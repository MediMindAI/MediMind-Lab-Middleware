/**
 * Pipeline orchestrator — the "assembly line" for lab results.
 *
 * When an analyzer sends raw bytes, the pipeline routes them through:
 *   raw data → protocol parser → result mapper → FHIR sender (or queue on failure)
 *
 * It emits PipelineEvent events at each stage so the monitoring dashboard
 * can show real-time progress. It NEVER throws — all errors are caught
 * and emitted as events so the service keeps running even if one result fails.
 */

import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import type { PipelineEvent } from './types.js';
import type { LabResult } from '../types/result.js';
import { parseASTMMessage } from '../protocols/astm/parser.js';
import { parseORU } from '../protocols/hl7v2/parser.js';
import { parseCombilyzerOutput } from '../protocols/combilyzer/parser.js';
import { mapASTMToLabResults, mapHL7v2ToLabResults, mapCombilyzerToLabResults } from '../mappers/resultMapper.js';
import { mapLabResultToFHIR } from '../mappers/fhirMapper.js';

// ---------------------------------------------------------------------------
// Dependency interfaces — injected so we can mock them in tests
// ---------------------------------------------------------------------------

/** The sender just needs to accept a LabResult and say if it worked */
export interface PipelineSender {
  sendLabResult: (labResult: LabResult) => Promise<{ success: boolean; error?: string; resourceIds?: string[] }>;
}

/** The queue just needs to accept a LabResult for later retry */
export interface PipelineQueue {
  enqueue: (labResult: LabResult) => number;
  markSent: (id: number) => void;
}

/** The logger just needs to accept a log entry object */
export interface PipelineLogger {
  logMessage: (entry: Record<string, unknown>) => number;
}

/** Optional store for EMR polling — if provided, successfully sent results are cached here */
export interface PipelineResultStore {
  add: (result: LabResult) => void;
}

export interface PipelineDeps {
  resultSender: PipelineSender;
  queue: PipelineQueue;
  messageLogger: PipelineLogger;
  /** Optional — if provided, successfully sent results are stored for EMR polling */
  resultStore?: PipelineResultStore;
}

// ---------------------------------------------------------------------------
// Pipeline class
// ---------------------------------------------------------------------------

export class ResultPipeline extends EventEmitter {
  private deps: PipelineDeps;

  constructor(deps: PipelineDeps) {
    super();
    this.deps = deps;
  }

  /**
   * Process raw ASTM frame data from an analyzer.
   * Expects an array of frame strings joined by newlines.
   */
  async processASTM(analyzerId: string, rawFrameData: string): Promise<void> {
    const messageId = randomUUID();
    this.emitStage('received', analyzerId, messageId);

    try {
      const frames = rawFrameData.split('\n').filter((f) => f.length > 0);
      const parsed = parseASTMMessage(frames);
      this.emitStage('parsed', analyzerId, messageId);

      const labResults = mapASTMToLabResults(parsed, analyzerId);
      this.emitStage('mapped', analyzerId, messageId, { componentCount: labResults.length });

      await this.sendResults(analyzerId, messageId, labResults, rawFrameData, 'astm');
    } catch (err) {
      this.emitError(analyzerId, messageId, err);
    }
  }

  /** Process a raw HL7v2 ORU^R01 message from an analyzer. */
  async processHL7v2(analyzerId: string, rawMessage: string): Promise<void> {
    const messageId = randomUUID();
    this.emitStage('received', analyzerId, messageId);

    try {
      const parsed = parseORU(rawMessage);
      this.emitStage('parsed', analyzerId, messageId);

      const labResults = mapHL7v2ToLabResults(parsed, analyzerId);
      this.emitStage('mapped', analyzerId, messageId, { componentCount: labResults.length });

      await this.sendResults(analyzerId, messageId, labResults, rawMessage, 'hl7v2');
    } catch (err) {
      this.emitError(analyzerId, messageId, err);
    }
  }

  /** Process raw Combilyzer 13 output text from an analyzer. */
  async processCombilyzer(analyzerId: string, rawOutput: string): Promise<void> {
    const messageId = randomUUID();
    this.emitStage('received', analyzerId, messageId);

    try {
      const parsed = parseCombilyzerOutput(rawOutput);
      this.emitStage('parsed', analyzerId, messageId);

      const labResults = mapCombilyzerToLabResults(parsed, analyzerId);
      this.emitStage('mapped', analyzerId, messageId, { componentCount: labResults.length });

      await this.sendResults(analyzerId, messageId, labResults, rawOutput, 'combilyzer');
    } catch (err) {
      this.emitError(analyzerId, messageId, err);
    }
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Queue each LabResult first (crash safety), then try to send to Medplum.
   * If send succeeds, mark the queue entry as sent.
   * If send fails, the item is already safely queued for retry.
   */
  private async sendResults(
    analyzerId: string,
    messageId: string,
    labResults: LabResult[],
    rawContent: string,
    protocol?: string,
  ): Promise<void> {
    for (const labResult of labResults) {
      // Step 1: Queue first for crash safety
      let queueId: number;
      try {
        queueId = this.deps.queue.enqueue(labResult);
      } catch (enqueueErr) {
        // CRITICAL: queue itself failed — result may be lost
        const errMsg = enqueueErr instanceof Error ? enqueueErr.message : String(enqueueErr);
        this.emitStage('error', analyzerId, messageId, {
          error: `CRITICAL: Queue failed — result may be lost: ${errMsg}`,
        });
        continue;
      }

      try {
        // Map to FHIR (for logging purposes — the sender does its own mapping)
        mapLabResultToFHIR(labResult);

        // Step 2: Try sending to Medplum
        const sendResult = await this.deps.resultSender.sendLabResult(labResult);

        if (sendResult.success) {
          // Step 3: Mark queue entry as sent
          this.deps.queue.markSent(queueId);
          this.deps.resultStore?.add(labResult);
          this.emitStage('sent', analyzerId, messageId, {
            barcode: labResult.specimenBarcode,
            fhirResourceIds: sendResult.resourceIds,
          });
          this.deps.messageLogger.logMessage({
            timestamp: new Date().toISOString(),
            analyzerId,
            direction: 'inbound',
            ...(protocol ? { protocol } : {}),
            rawContent,
            barcode: labResult.specimenBarcode,
            status: 'sent',
            fhirResourceIds: sendResult.resourceIds ?? [],
          });
        } else {
          // Send failed — item already in queue, just emit event
          this.emitStage('queued', analyzerId, messageId, {
            barcode: labResult.specimenBarcode,
            error: sendResult.error,
          });
          this.deps.messageLogger.logMessage({
            timestamp: new Date().toISOString(),
            analyzerId,
            direction: 'inbound',
            ...(protocol ? { protocol } : {}),
            rawContent,
            barcode: labResult.specimenBarcode,
            status: 'error',
            errorMessage: sendResult.error,
          });
        }
      } catch (err) {
        // Unexpected error — item already in queue from step 1
        const errorMsg = err instanceof Error ? err.message : String(err);
        this.emitStage('error', analyzerId, messageId, { error: errorMsg });
        this.deps.messageLogger.logMessage({
          timestamp: new Date().toISOString(),
          analyzerId,
          direction: 'inbound',
          ...(protocol ? { protocol } : {}),
          rawContent,
          barcode: labResult.specimenBarcode,
          status: 'error',
          errorMessage: errorMsg,
        });
      }
    }
  }

  /** Emit a PipelineEvent for the given stage. */
  private emitStage(
    stage: PipelineEvent['stage'],
    analyzerId: string,
    messageId: string,
    extra: Partial<PipelineEvent> = {},
  ): void {
    const event: PipelineEvent = {
      stage,
      timestamp: new Date().toISOString(),
      analyzerId,
      messageId,
      ...extra,
    };
    this.emit('pipeline', event);
  }

  /** Emit an error event (parser/mapper threw). */
  private emitError(analyzerId: string, messageId: string, err: unknown): void {
    const errorMsg = err instanceof Error ? err.message : String(err);
    this.emitStage('error', analyzerId, messageId, { error: errorMsg });
  }
}
