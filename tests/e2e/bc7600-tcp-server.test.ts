/**
 * E2E test: BC-7600 over TCP server connection.
 *
 * Simulates what happens in the real hospital:
 *   1. Our middleware opens a TCP server (TcpServerConnection) on a port
 *   2. The "analyzer" (a test TCP client) connects to us
 *   3. The client sends an MLLP-framed HL7v2 ORU^R01 message
 *   4. MLLPTransport strips framing, pipeline processes the message
 *   5. An MLLP-framed ACK is sent back to the client
 *   6. The result appears in the ResultStore (ready for EMR to poll)
 *
 * This is the closest test to a real BC-7600 → LabXpert → middleware flow
 * without actual hardware. It tests: TCP server, MLLP, HL7v2 parsing,
 * result mapping (32 params), FHIR mapping, ACK building, and result storage.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import net from 'node:net';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TcpServerConnection } from '../../src/connections/tcpServerConnection.js';
import { MLLPTransport } from '../../src/protocols/hl7v2/mllpTransport.js';
import { parseORU } from '../../src/protocols/hl7v2/parser.js';
import { buildACK } from '../../src/protocols/hl7v2/ack.js';
import { ResultPipeline, type PipelineDeps } from '../../src/pipeline/resultPipeline.js';
import { ResultStore } from '../../src/api/resultStore.js';
import type { LabResult } from '../../src/types/result.js';
import type { TcpServerConfig } from '../../src/types/analyzer.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** MLLP framing constants */
const VT = 0x0b;
const FS = 0x1c;
const CR = 0x0d;

/** Load BC-7600 fixture and strip comments */
function loadFixture(): string {
  const raw = readFileSync(
    resolve(__dirname, '../../src/simulators/fixtures/hl7v2/mindray-bc7600-cbc.hl7'),
    'utf-8',
  );
  return raw
    .split('\n')
    .filter((l) => l.length > 0 && !l.startsWith('#'))
    .join('\r');
}

/** Wrap an HL7v2 message in MLLP framing for sending */
function wrapMLLP(message: string): Buffer {
  return Buffer.concat([Buffer.from([VT]), Buffer.from(message), Buffer.from([FS, CR])]);
}

/** Connect a test TCP client to a port */
function connectClient(port: number): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    client.once('error', reject);
    client.connect(port, '127.0.0.1', () => {
      client.removeListener('error', reject);
      resolve(client);
    });
  });
}

/** Get the actual port from the server connection */
function getPort(conn: TcpServerConnection): number {
  const server = (conn as unknown as { server: net.Server }).server;
  return (server.address() as net.AddressInfo).port;
}

describe('E2E: BC-7600 via TCP Server', () => {
  let serverConn: TcpServerConnection;
  let client: net.Socket | null = null;

  afterEach(async () => {
    client?.destroy();
    client = null;
    await serverConn?.close();
  });

  it('full flow: TCP connect → MLLP message → pipeline → ACK → ResultStore', async () => {
    // ── 1. Set up the TCP server (our middleware) ──────────────────
    const config: TcpServerConfig = {
      connection: 'tcp-server',
      listenPort: 0, // OS picks a free port
      listenHost: '127.0.0.1',
    };
    serverConn = new TcpServerConnection(config);
    await serverConn.open();
    const port = getPort(serverConn);

    // ── 2. Set up the pipeline with mock sender + real ResultStore ─
    const resultStore = new ResultStore();
    const sentResults: LabResult[] = [];

    const deps: PipelineDeps = {
      resultSender: {
        sendLabResult: vi.fn(async (lr: LabResult) => {
          sentResults.push(lr);
          return { success: true, resourceIds: ['Observation/bc7600-e2e-1'] };
        }),
      },
      queue: { enqueue: vi.fn().mockReturnValue(1), markSent: vi.fn() },
      messageLogger: { logMessage: vi.fn().mockReturnValue(1) },
      resultStore,
    };
    const pipeline = new ResultPipeline(deps);

    // ── 3. Wire: server data → MLLP → pipeline + ACK ─────────────
    const mllp = new MLLPTransport();
    serverConn.on('data', (data: Buffer) => mllp.receive(data));

    mllp.on('message', (rawMessage: string) => {
      // Send ACK back (same as index.ts does)
      try {
        const parsed = parseORU(rawMessage);
        const ack = buildACK(parsed.msh, 'AA');
        const wrappedAck = MLLPTransport.wrapFrame(ack);
        serverConn.write(wrappedAck).catch(() => {});
      } catch {
        // If ACK fails, test will catch it
      }

      // Process through pipeline
      pipeline.processHL7v2('mindray-bc7600', rawMessage).catch(() => {});
    });

    // ── 4. "Analyzer" connects as TCP client ──────────────────────
    client = await connectClient(port);
    await new Promise((r) => setTimeout(r, 30)); // Let server register client

    expect(serverConn.isOpen()).toBe(true);

    // ── 5. Collect the ACK that comes back ────────────────────────
    const ackPromise = new Promise<Buffer>((resolveAck) => {
      client!.on('data', (data: Buffer) => resolveAck(data));
    });

    // ── 6. Send the MLLP-framed BC-7600 HL7v2 message ────────────
    const fixture = loadFixture();
    const mllpFrame = wrapMLLP(fixture);
    client.write(mllpFrame);

    // ── 7. Wait for the ACK response ──────────────────────────────
    const ackData = await ackPromise;

    // ACK should be MLLP-framed (VT...FS+CR)
    expect(ackData[0]).toBe(VT);
    expect(ackData[ackData.length - 2]).toBe(FS);
    expect(ackData[ackData.length - 1]).toBe(CR);

    // Extract the ACK message content
    const ackContent = ackData.subarray(1, ackData.length - 2).toString();
    expect(ackContent).toContain('MSH|');
    expect(ackContent).toContain('ACK^R01');
    expect(ackContent).toContain('MSA|AA|BC7600-00107');

    // ── 8. Wait for pipeline to finish processing ─────────────────
    await new Promise((r) => setTimeout(r, 100));

    // ── 9. Verify the result was sent to Medplum ──────────────────
    expect(sentResults).toHaveLength(1);
    expect(sentResults[0].analyzerId).toBe('mindray-bc7600');
    expect(sentResults[0].specimenBarcode).toBe('87654321');
    expect(sentResults[0].components).toHaveLength(32);

    // ── 10. Verify the result is in the ResultStore ───────────────
    const stored = resultStore.get('87654321');
    expect(stored).not.toBeNull();
    expect(stored!).toHaveLength(1);
    expect(stored![0].components).toHaveLength(32);

    // ── 11. Spot-check some component values ──────────────────────
    const wbc = stored![0].components.find((c) => c.testCode === 'WBC');
    expect(wbc!.value).toBe('13.2');
    expect(wbc!.flag).toBe('H');

    const crp = stored![0].components.find((c) => c.testCode === 'CRP');
    expect(crp!.value).toBe('12.4');
    expect(crp!.flag).toBe('H');

    const plt = stored![0].components.find((c) => c.testCode === 'PLT');
    expect(plt!.value).toBe('245');
    expect(plt!.flag).toBe('N');

    // ── 12. Verify message was logged ─────────────────────────────
    expect(deps.messageLogger.logMessage).toHaveBeenCalled();
  });

  it('sends multiple messages sequentially (like a real analyzer)', async () => {
    const config: TcpServerConfig = {
      connection: 'tcp-server',
      listenPort: 0,
      listenHost: '127.0.0.1',
    };
    serverConn = new TcpServerConnection(config);
    await serverConn.open();
    const port = getPort(serverConn);

    const resultStore = new ResultStore();
    const deps: PipelineDeps = {
      resultSender: {
        sendLabResult: vi.fn(async () => ({ success: true, resourceIds: ['Obs/1'] })),
      },
      queue: { enqueue: vi.fn().mockReturnValue(1), markSent: vi.fn() },
      messageLogger: { logMessage: vi.fn().mockReturnValue(1) },
      resultStore,
    };
    const pipeline = new ResultPipeline(deps);

    const mllp = new MLLPTransport();
    serverConn.on('data', (data: Buffer) => mllp.receive(data));
    mllp.on('message', (rawMessage: string) => {
      try {
        const parsed = parseORU(rawMessage);
        const ack = buildACK(parsed.msh, 'AA');
        serverConn.write(MLLPTransport.wrapFrame(ack)).catch(() => {});
      } catch { /* ignore */ }
      pipeline.processHL7v2('mindray-bc7600', rawMessage).catch(() => {});
    });

    // Connect client
    client = await connectClient(port);
    await new Promise((r) => setTimeout(r, 30));

    // Send two messages back-to-back (simulating two patient samples)
    const fixture = loadFixture();

    // Message 1
    let ackPromise = new Promise<Buffer>((res) => {
      client!.once('data', (data: Buffer) => res(data));
    });
    client.write(wrapMLLP(fixture));
    await ackPromise;

    // Message 2 (same fixture, but proves sequential processing works)
    ackPromise = new Promise<Buffer>((res) => {
      client!.once('data', (data: Buffer) => res(data));
    });
    client.write(wrapMLLP(fixture));
    await ackPromise;

    await new Promise((r) => setTimeout(r, 100));

    // Both should have been processed
    expect(deps.resultSender.sendLabResult).toHaveBeenCalledTimes(2);

    // ResultStore should have 2 entries for the same barcode
    const stored = resultStore.get('87654321');
    expect(stored).toHaveLength(2);
  });
});
