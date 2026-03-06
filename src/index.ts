/**
 * MediMind Lab Middleware — Entry Point
 *
 * This is the "power button" that wires everything together and starts the service:
 * 1. Loads config (which analyzers, how to connect)
 * 2. Creates the pipeline (parser → mapper → sender → queue)
 * 3. Connects protocol transports to the pipeline
 * 4. Starts the REST API and retry processor
 * 5. Handles graceful shutdown
 */

import 'dotenv/config';
import { loadConfig } from './config/configLoader.js';
import { createAppLogger } from './logging/appLogger.js';
import { MessageLogger, type NewMessageLogEntry } from './logging/messageLogger.js';
import { LocalQueue } from './queue/localQueue.js';
import { createMedplumClient } from './fhir/medplumClient.js';
import { sendLabResult, type MapToFHIRFn } from './fhir/resultSender.js';
import { mapLabResultToFHIR } from './mappers/fhirMapper.js';
import { RetryProcessor } from './queue/retryProcessor.js';
import { ConnectionManager } from './connections/connectionManager.js';
import { ASTMTransport } from './protocols/astm/transport.js';
import { MLLPTransport } from './protocols/hl7v2/mllpTransport.js';
import { buildACK } from './protocols/hl7v2/ack.js';
import { parseORU } from './protocols/hl7v2/parser.js';
import { ResultPipeline } from './pipeline/resultPipeline.js';
import { createServer } from './api/server.js';
import { ResultStore } from './api/resultStore.js';
import type { LabResult } from './types/result.js';
import type { BarcodeMatch } from './fhir/types.js';
import type { Resource } from '@medplum/fhirtypes';

/** Max Combilyzer buffer size before forced reset (1MB) */
const MAX_COMBILYZER_BUFFER = 1_048_576;

/** Message log retention in days */
const MESSAGE_LOG_RETENTION_DAYS = 90;

/** ResultStore eviction interval (1 hour) */
const EVICTION_INTERVAL_MS = 60 * 60 * 1000;


const VERSION = '0.1.0';

async function main(): Promise<void> {
  // Step 1: Load config
  const config = loadConfig();
  const logger = createAppLogger(config.logging);

  logger.info(`MediMind Lab Middleware v${VERSION} starting...`);

  // Step 2: Initialize storage (SQLite databases for queue and message log)
  const messageDbPath = config.queue.dbPath.replace('queue.db', 'messages.db');
  const messageLogger = new MessageLogger(messageDbPath);
  const queue = new LocalQueue(config.queue.dbPath);
  const resultStore = new ResultStore();
  logger.info('Local queue, message logger, and result store initialized');

  // Step 3: Connect to Medplum Cloud
  const medplumClient = await createMedplumClient(config.medplum);
  logger.info('Medplum client authenticated');

  // Wrapper: convert LabResult + BarcodeMatch into flat FHIR Resource[]
  const mapToFHIR: MapToFHIRFn = (labResult: LabResult, match: BarcodeMatch): Resource[] => {
    const { observations, diagnosticReport } = mapLabResultToFHIR(
      labResult,
      match.specimenReference || undefined,
      match.serviceRequestReference || undefined,
      match.patientReference || undefined,
    );
    return [...observations, diagnosticReport];
  };

  // Step 4: Create the pipeline
  const pipeline = new ResultPipeline({
    resultSender: {
      sendLabResult: (labResult: LabResult) =>
        sendLabResult(medplumClient, labResult, mapToFHIR),
    },
    queue,
    resultStore,
    messageLogger: {
      logMessage: (entry: Record<string, unknown>) => {
        // Adapt the pipeline's simple log calls to the MessageLogger's full schema
        return messageLogger.logMessage({
          timestamp: (entry.timestamp as string) || new Date().toISOString(),
          analyzerId: (entry.analyzerId as string) || '',
          analyzerName: (entry.analyzerName as string) || (entry.analyzerId as string) || '',
          direction: (entry.direction as 'inbound' | 'outbound') || 'inbound',
          protocol: (entry.protocol as string) || '',
          rawContent: (entry.rawContent as string) || '',
          parsedSummary: (entry.parsedSummary as string) || '',
          fhirResourceIds: (entry.fhirResourceIds as string[]) || [],
          status: (entry.status as NewMessageLogEntry['status']) || 'success',
          errorMessage: entry.errorMessage as string | undefined,
        });
      },
    },
  });

  // Log pipeline events
  pipeline.on('pipeline', (event) => {
    if (event.stage === 'error') {
      logger.error('Pipeline error', { analyzerId: event.analyzerId, error: event.error });
    } else {
      logger.debug(`Pipeline: ${event.stage}`, { analyzerId: event.analyzerId, messageId: event.messageId });
    }
  });

  // Step 5: Create retry processor
  const retryProcessor = new RetryProcessor(queue, (labResult: LabResult) =>
    sendLabResult(medplumClient, labResult, mapToFHIR),
  );
  retryProcessor.start(config.queue.retryIntervalMs);
  logger.info(`Retry processor started (interval: ${config.queue.retryIntervalMs}ms)`);

  // Step 6: Create connection manager and wire protocol transports
  const connectionManager = new ConnectionManager(config.analyzers);

  for (const analyzer of config.analyzers.filter((a) => a.enabled)) {
    switch (analyzer.protocol) {
      case 'astm': {
        const transport = new ASTMTransport();
        // Feed raw bytes from connection → ASTM transport
        connectionManager.onData(analyzer.id, (data: Buffer) => {
          transport.receive(data);
        });
        // Send ACK/NAK responses back to the analyzer
        transport.on('response', (byte: number) => {
          const conn = connectionManager.getConnection(analyzer.id);
          conn?.write(Buffer.from([byte]));
        });
        // When transport assembles a complete message → pipeline
        transport.on('message', (frames: string[]) => {
          const raw = frames.join('\n');
          pipeline.processASTM(analyzer.id, raw).catch((err) => {
            logger.error('ASTM pipeline error', { analyzerId: analyzer.id, error: String(err) });
          });
        });
        logger.info(`Wired ASTM transport for ${analyzer.name}`);
        break;
      }

      case 'hl7v2': {
        const transport = new MLLPTransport();
        connectionManager.onData(analyzer.id, (data: Buffer) => {
          transport.receive(data);
        });
        transport.on('message', (rawMessage: string) => {
          // Send HL7v2 ACK back to analyzer, wrapped in MLLP framing
          try {
            const parsed = parseORU(rawMessage);
            const ack = buildACK(parsed.msh, 'AA');
            const conn = connectionManager.getConnection(analyzer.id);
            conn?.write(MLLPTransport.wrapFrame(ack));
          } catch (ackErr) {
            logger.warn('Failed to send HL7v2 ACK', { analyzerId: analyzer.id, error: String(ackErr) });
          }
          pipeline.processHL7v2(analyzer.id, rawMessage).catch((err) => {
            logger.error('HL7v2 pipeline error', { analyzerId: analyzer.id, error: String(err) });
          });
        });
        logger.info(`Wired MLLP transport for ${analyzer.name}`);
        break;
      }

      case 'combilyzer': {
        // Combilyzer sends plain text — no transport layer needed
        let buffer = '';
        connectionManager.onData(analyzer.id, (data: Buffer) => {
          // Guard: prevent buffer from growing beyond 1MB on malformed input
          if (buffer.length + data.length > MAX_COMBILYZER_BUFFER) {
            logger.error('Combilyzer buffer overflow (>1MB) — resetting', { analyzerId: analyzer.id });
            buffer = '';
            return;
          }
          buffer += data.toString();
          // L|1|N marks the end of a Combilyzer message
          if (buffer.includes('L|')) {
            const raw = buffer;
            buffer = '';
            pipeline.processCombilyzer(analyzer.id, raw).catch((err) => {
              logger.error('Combilyzer pipeline error', { analyzerId: analyzer.id, error: String(err) });
            });
          }
        });
        logger.info(`Wired Combilyzer parser for ${analyzer.name}`);
        break;
      }

      default:
        logger.warn(`Unsupported protocol "${analyzer.protocol}" for ${analyzer.name} — skipping`);
    }
  }

  // Step 7: Start connections
  await connectionManager.startAll();
  const statuses = connectionManager.getStatuses();
  const connectedCount = statuses.filter((s) => s.connected).length;
  logger.info(`Connections started: ${connectedCount}/${statuses.length} connected`);

  // Step 8: Start REST API
  const startTime = new Date();
  const app = createServer({
    health: {
      getStatuses: () => connectionManager.getStatuses(),
      startTime,
      version: VERSION,
    },
    status: {
      getStatuses: () => connectionManager.getStatuses(),
    },
    messages: {
      logger: messageLogger,
      retryQueue: queue,
    },
    results: {
      resultStore,
    },
  });

  const server = app.listen(config.api.port, config.api.host, () => {
    logger.info(`REST API listening on http://${config.api.host}:${config.api.port}`);
  });

  // Step 9: Periodic maintenance — prune old logs and evict stale results
  const pruneInterval = setInterval(() => {
    try {
      const deleted = messageLogger.pruneOldMessages(MESSAGE_LOG_RETENTION_DAYS);
      if (deleted > 0) logger.info(`Pruned ${deleted} old message log entries`);
    } catch (err) {
      logger.error('Message log pruning failed', { error: String(err) });
    }
  }, 24 * 60 * 60 * 1000); // Once per day

  const evictionInterval = setInterval(() => {
    try {
      const evicted = resultStore.evictExpired();
      if (evicted > 0) logger.info(`Evicted ${evicted} expired result store entries`);
    } catch (err) {
      logger.error('Result store eviction failed', { error: String(err) });
    }
  }, EVICTION_INTERVAL_MS);

  // Step 10: Graceful shutdown — drain HTTP, then close databases
  const shutdown = async (): Promise<void> => {
    logger.info('Shutting down...');
    clearInterval(pruneInterval);
    clearInterval(evictionInterval);
    // Drain in-flight HTTP requests (5s timeout)
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 5000);
      server.close(() => { clearTimeout(timer); resolve(); });
    });
    retryProcessor.stop();
    await connectionManager.stopAll();
    queue.close();
    messageLogger.close();
    logger.info('Shutdown complete.');
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());

  // Step 11: Process-level safety nets — log and exit on unhandled errors
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', { error: String(reason) });
    process.exit(1);
  });
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', { error: err.message, stack: err.stack });
    process.exit(1);
  });

  logger.info('MediMind Lab Middleware is running.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
