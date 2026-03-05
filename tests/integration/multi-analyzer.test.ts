/**
 * Integration test: multiple analyzers running concurrently.
 *
 * Simulates what happens in the real hospital: two analyzers (Sysmex ASTM
 * and Mindray HL7v2) send results at the same time. The pipeline should
 * process both without losing data or mixing results between analyzers.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ResultPipeline, type PipelineDeps } from '../../src/pipeline/resultPipeline.js';
import type { LabResult } from '../../src/types/result.js';
import type { PipelineEvent } from '../../src/pipeline/types.js';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Load ASTM fixture (Sysmex CBC) */
function loadASTMFixture(): string {
  const raw = readFileSync(
    resolve(__dirname, '../../src/simulators/fixtures/astm/sysmex-cbc.txt'),
    'utf-8'
  );
  return raw
    .split('\n')
    .filter((l) => l.length > 0 && !l.startsWith('#'))
    .join('\n');
}

/** Load HL7v2 fixture (Mindray CBC) */
function loadHL7v2Fixture(): string {
  const raw = readFileSync(
    resolve(__dirname, '../../src/simulators/fixtures/hl7v2/mindray-cbc.hl7'),
    'utf-8'
  );
  return raw
    .split('\n')
    .filter((l) => l.length > 0 && !l.startsWith('#'))
    .join('\r');
}

describe('Multi-Analyzer Concurrent Processing', () => {
  let deps: PipelineDeps;
  let pipeline: ResultPipeline;
  let sentResults: LabResult[];

  beforeEach(() => {
    sentResults = [];
    deps = {
      resultSender: {
        sendLabResult: vi.fn(async (lr: LabResult) => {
          sentResults.push(lr);
          return { success: true, resourceIds: [`Observation/${lr.analyzerId}-obs`] };
        }),
      },
      queue: {
        enqueue: vi.fn().mockReturnValue(1),
      },
      messageLogger: {
        logMessage: vi.fn().mockReturnValue(1),
      },
    };
    pipeline = new ResultPipeline(deps);
  });

  it('processes ASTM and HL7v2 concurrently without data loss', async () => {
    const astmData = loadASTMFixture();
    const hl7Data = loadHL7v2Fixture();

    // Fire both at the same time — like two analyzers sending simultaneously
    await Promise.all([
      pipeline.processASTM('sysmex-xn550', astmData),
      pipeline.processHL7v2('mindray-bc3510', hl7Data),
    ]);

    // Sender should have been called twice (one LabResult per analyzer)
    expect(deps.resultSender.sendLabResult).toHaveBeenCalledTimes(2);

    // Both results should be captured
    expect(sentResults).toHaveLength(2);

    // Each result should reference its own analyzer
    const analyzerIds = sentResults.map((r) => r.analyzerId).sort();
    expect(analyzerIds).toEqual(['mindray-bc3510', 'sysmex-xn550']);
  });

  it('no data is mixed between analyzers', async () => {
    const astmData = loadASTMFixture();
    const hl7Data = loadHL7v2Fixture();

    await Promise.all([
      pipeline.processASTM('sysmex-xn550', astmData),
      pipeline.processHL7v2('mindray-bc3510', hl7Data),
    ]);

    const sysmexResult = sentResults.find((r) => r.analyzerId === 'sysmex-xn550');
    const mindrayResult = sentResults.find((r) => r.analyzerId === 'mindray-bc3510');

    expect(sysmexResult).toBeDefined();
    expect(mindrayResult).toBeDefined();

    // Sysmex should have 20 CBC components
    expect(sysmexResult!.components).toHaveLength(20);
    // Mindray should have 19 CBC components
    expect(mindrayResult!.components).toHaveLength(19);

    // Barcodes should both be from their respective fixtures
    expect(sysmexResult!.specimenBarcode).toBe('12345678');
    expect(mindrayResult!.specimenBarcode).toBe('12345678');
  });

  it('one failure does not affect the other analyzer', async () => {
    const astmData = loadASTMFixture();
    const hl7Data = loadHL7v2Fixture();

    // Make the sender fail for Sysmex but succeed for Mindray
    let callIndex = 0;
    (deps.resultSender.sendLabResult as ReturnType<typeof vi.fn>).mockImplementation(
      async (lr: LabResult) => {
        callIndex++;
        if (lr.analyzerId === 'sysmex-xn550') {
          return { success: false, error: 'Sysmex send failed' };
        }
        sentResults.push(lr);
        return { success: true };
      }
    );

    const events: PipelineEvent[] = [];
    pipeline.on('pipeline', (e: PipelineEvent) => events.push(e));

    await Promise.all([
      pipeline.processASTM('sysmex-xn550', astmData),
      pipeline.processHL7v2('mindray-bc3510', hl7Data),
    ]);

    // Sysmex should have been queued (failure)
    expect(deps.queue.enqueue).toHaveBeenCalled();
    // Mindray should have succeeded
    expect(sentResults.some((r) => r.analyzerId === 'mindray-bc3510')).toBe(true);

    // Both analyzers should have emitted events
    const sysmexEvents = events.filter((e) => e.analyzerId === 'sysmex-xn550');
    const mindrayEvents = events.filter((e) => e.analyzerId === 'mindray-bc3510');
    expect(sysmexEvents.length).toBeGreaterThan(0);
    expect(mindrayEvents.length).toBeGreaterThan(0);
  });

  it('pipeline events have unique messageIds per analyzer', async () => {
    const astmData = loadASTMFixture();
    const hl7Data = loadHL7v2Fixture();

    const events: PipelineEvent[] = [];
    pipeline.on('pipeline', (e: PipelineEvent) => events.push(e));

    await Promise.all([
      pipeline.processASTM('sysmex-xn550', astmData),
      pipeline.processHL7v2('mindray-bc3510', hl7Data),
    ]);

    const sysmexMsgId = events.find((e) => e.analyzerId === 'sysmex-xn550')?.messageId;
    const mindrayMsgId = events.find((e) => e.analyzerId === 'mindray-bc3510')?.messageId;

    expect(sysmexMsgId).toBeTruthy();
    expect(mindrayMsgId).toBeTruthy();
    expect(sysmexMsgId).not.toBe(mindrayMsgId);
  });
});
