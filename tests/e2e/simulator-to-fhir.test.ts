/**
 * E2E test: simulator -> pipeline -> FHIR output.
 *
 * Uses the actual ASTMSimulator and HL7Simulator to generate realistic
 * analyzer data, feeds it through the ResultPipeline with a mock sender,
 * and verifies the sender receives correct FHIR-ready LabResults.
 *
 * This is the closest thing to a real hospital test without actual hardware.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ASTMSimulator } from '../../src/simulators/astmSimulator.js';
import { HL7Simulator } from '../../src/simulators/hl7Simulator.js';
import { ASTMTransport } from '../../src/protocols/astm/transport.js';
import { MLLPTransport } from '../../src/protocols/hl7v2/mllpTransport.js';
import { ResultPipeline, type PipelineDeps } from '../../src/pipeline/resultPipeline.js';
import type { LabResult } from '../../src/types/result.js';

function createMockDeps(): PipelineDeps & { captured: LabResult[] } {
  const captured: LabResult[] = [];
  return {
    captured,
    resultSender: {
      sendLabResult: vi.fn(async (lr: LabResult) => {
        captured.push(lr);
        return { success: true, resourceIds: ['Observation/e2e-1'] };
      }),
    },
    queue: { enqueue: vi.fn().mockReturnValue(1) },
    messageLogger: { logMessage: vi.fn().mockReturnValue(1) },
  };
}

describe('E2E: ASTM Simulator -> Pipeline -> FHIR', () => {
  let deps: ReturnType<typeof createMockDeps>;
  let pipeline: ResultPipeline;

  beforeEach(() => {
    deps = createMockDeps();
    pipeline = new ResultPipeline(deps);
  });

  it('simulator generates a valid ASTM session that the transport can parse', () => {
    const sim = new ASTMSimulator();
    const session = sim.generateDefaultSession();

    // Session should start with ENQ and end with EOT
    expect(session[0]).toBe(0x05); // ENQ
    expect(session[session.length - 1]).toBe(0x04); // EOT

    // Feed the session bytes into ASTMTransport and collect frames
    const transport = new ASTMTransport();
    const frames: string[] = [];
    transport.on('frame', (data: string) => frames.push(data));
    transport.on('message', (allFrames: string[]) => {
      // message event fires on EOT with all collected frames
    });

    transport.receive(session);

    // Transport should have parsed all 24 record lines (H + P + O + 20 R + L)
    expect(frames.length).toBe(24);

    // First frame should be the H (header) record
    expect(frames[0]).toMatch(/^H\|/);
    // Last frame should be the L (terminator) record
    expect(frames[frames.length - 1]).toMatch(/^L\|/);
  });

  it('ASTM simulator data flows through full pipeline to mock sender', async () => {
    const sim = new ASTMSimulator();
    const fixtureData = sim.getFixtureData('sysmex-cbc');

    await pipeline.processASTM('sysmex-xn550', fixtureData);

    expect(deps.resultSender.sendLabResult).toHaveBeenCalledOnce();
    expect(deps.captured).toHaveLength(1);

    const result = deps.captured[0];
    expect(result.analyzerId).toBe('sysmex-xn550');
    expect(result.specimenBarcode).toBe('12345678');
    expect(result.components).toHaveLength(20);
    expect(result.components[0].testCode).toBe('WBC');
    expect(result.components[0].value).toBe('7.45');
  });

  it('ASTM simulator transport frames are valid (all ACKed, no NAKs)', () => {
    const sim = new ASTMSimulator();
    const session = sim.generateDefaultSession();

    const transport = new ASTMTransport();
    const responses: number[] = [];
    const errors: string[] = [];

    transport.on('response', (byte: number) => responses.push(byte));
    transport.on('error', (msg: string) => errors.push(msg));

    transport.receive(session);

    // Should have no errors
    expect(errors).toHaveLength(0);

    // All responses should be ACKs (0x06) — one for ENQ + one per frame
    for (const r of responses) {
      expect(r).toBe(0x06); // ACK
    }
  });
});

describe('E2E: HL7v2 Simulator -> Pipeline -> FHIR', () => {
  let deps: ReturnType<typeof createMockDeps>;
  let pipeline: ResultPipeline;

  beforeEach(() => {
    deps = createMockDeps();
    pipeline = new ResultPipeline(deps);
  });

  it('simulator generates a valid MLLP frame that the transport can parse', () => {
    const sim = new HL7Simulator();
    const frame = sim.generateDefaultFrame();

    // Frame should start with VT (0x0B) and end with FS+CR (0x1C 0x0D)
    expect(frame[0]).toBe(0x0b);
    expect(frame[frame.length - 2]).toBe(0x1c);
    expect(frame[frame.length - 1]).toBe(0x0d);

    // Feed into MLLPTransport and collect the message
    const transport = new MLLPTransport();
    const messages: string[] = [];
    transport.on('message', (msg: string) => messages.push(msg));

    transport.receive(frame);

    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('MSH|');
    expect(messages[0]).toContain('OBX|');
  });

  it('HL7v2 simulator data flows through full pipeline to mock sender', async () => {
    const sim = new HL7Simulator();
    const fixtureData = sim.getFixtureData();

    await pipeline.processHL7v2('mindray-bc3510', fixtureData);

    expect(deps.resultSender.sendLabResult).toHaveBeenCalledOnce();
    expect(deps.captured).toHaveLength(1);

    const result = deps.captured[0];
    expect(result.analyzerId).toBe('mindray-bc3510');
    expect(result.specimenBarcode).toBe('12345678');
    expect(result.components).toHaveLength(19);

    // Verify some specific values from the fixture
    const wbc = result.components.find((c) => c.testCode === 'WBC');
    expect(wbc).toBeDefined();
    expect(wbc!.value).toBe('12.8');
    expect(wbc!.flag).toBe('H');
  });

  it('HL7v2 simulator generates correct segment separator (CR)', () => {
    const sim = new HL7Simulator();
    const data = sim.getFixtureData();

    // HL7v2 segments should be separated by CR (\r)
    const segments = data.split('\r').filter((s) => s.length > 0);
    expect(segments[0]).toMatch(/^MSH\|/);

    // Should have all expected segments
    const segmentTypes = segments.map((s) => s.substring(0, 3));
    expect(segmentTypes).toContain('MSH');
    expect(segmentTypes).toContain('PID');
    expect(segmentTypes).toContain('OBR');
    expect(segmentTypes).toContain('OBX');
  });
});
