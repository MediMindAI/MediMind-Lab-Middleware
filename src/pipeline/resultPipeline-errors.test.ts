/**
 * Tests for ResultPipeline error catch blocks.
 *
 * These tests use vi.mock() to force the parsers to throw, exercising
 * the catch blocks at lines 84 and 120 of resultPipeline.ts that can't
 * be reached with real parser input (since parsers handle bad data gracefully).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PipelineEvent } from './types.js';

// Mock parsers to throw on demand
const mockParseASTM = vi.fn();
const mockParseORU = vi.fn();
const mockParseCombilyzer = vi.fn();
const mockMapASTM = vi.fn();
const mockMapHL7v2 = vi.fn();
const mockMapCombilyzer = vi.fn();
const mockMapFHIR = vi.fn();

vi.mock('../protocols/astm/parser.js', () => ({
  parseASTMMessage: (...args: unknown[]) => mockParseASTM(...args),
}));

vi.mock('../protocols/hl7v2/parser.js', () => ({
  parseORU: (...args: unknown[]) => mockParseORU(...args),
}));

vi.mock('../protocols/combilyzer/parser.js', () => ({
  parseCombilyzerOutput: (...args: unknown[]) => mockParseCombilyzer(...args),
}));

vi.mock('../mappers/resultMapper.js', () => ({
  mapASTMToLabResults: (...args: unknown[]) => mockMapASTM(...args),
  mapHL7v2ToLabResults: (...args: unknown[]) => mockMapHL7v2(...args),
  mapCombilyzerToLabResults: (...args: unknown[]) => mockMapCombilyzer(...args),
}));

vi.mock('../mappers/fhirMapper.js', () => ({
  mapLabResultToFHIR: (...args: unknown[]) => mockMapFHIR(...args),
}));

// Import AFTER mocks are set up
import { ResultPipeline, type PipelineDeps } from './resultPipeline.js';

function createMockDeps(): PipelineDeps {
  return {
    resultSender: {
      sendLabResult: vi.fn().mockResolvedValue({ success: true, resourceIds: [] }),
    },
    queue: {
      enqueue: vi.fn().mockReturnValue(1),
      markSent: vi.fn(),
    },
    messageLogger: {
      logMessage: vi.fn().mockReturnValue(1),
    },
  };
}

function collectEvents(pipeline: ResultPipeline): PipelineEvent[] {
  const events: PipelineEvent[] = [];
  pipeline.on('pipeline', (e: PipelineEvent) => events.push(e));
  return events;
}

describe('ResultPipeline — parser error catch blocks', () => {
  let deps: PipelineDeps;
  let pipeline: ResultPipeline;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = createMockDeps();
    pipeline = new ResultPipeline(deps);
  });

  it('processASTM catches parser throw and emits error', async () => {
    mockParseASTM.mockImplementation(() => {
      throw new Error('ASTM parse explosion');
    });

    const events = collectEvents(pipeline);
    await pipeline.processASTM('test-analyzer', 'bad-data');

    const stages = events.map((e) => e.stage);
    expect(stages).toContain('received');
    expect(stages).toContain('error');

    const errorEvent = events.find((e) => e.stage === 'error');
    expect(errorEvent!.error).toContain('ASTM parse explosion');
  });

  it('processCombilyzer catches parser throw and emits error', async () => {
    mockParseCombilyzer.mockImplementation(() => {
      throw new Error('Combilyzer parse explosion');
    });

    const events = collectEvents(pipeline);
    await pipeline.processCombilyzer('test-analyzer', 'bad-data');

    const stages = events.map((e) => e.stage);
    expect(stages).toContain('received');
    expect(stages).toContain('error');

    const errorEvent = events.find((e) => e.stage === 'error');
    expect(errorEvent!.error).toContain('Combilyzer parse explosion');
  });
});
