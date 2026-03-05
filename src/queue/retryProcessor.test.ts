/**
 * Tests for RetryProcessor — the periodic retry loop.
 *
 * Uses a real LocalQueue (in-memory SQLite) with a mock sender
 * function so we can control success/failure without any network.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LocalQueue } from './localQueue.js';
import { RetryProcessor, type SenderFn } from './retryProcessor.js';
import type { LabResult } from '../types/result.js';

function makeLabResult(messageId = 'msg-001'): LabResult {
  return {
    messageId,
    analyzerId: 'sysmex-xn550',
    specimenBarcode: '12345678',
    patientId: '',
    patientName: '',
    testDateTime: '2026-01-15T10:00:00Z',
    receivedAt: '2026-01-15T10:00:01Z',
    components: [],
    rawMessage: 'raw',
    processingStatus: 'mapped',
  };
}

describe('RetryProcessor', () => {
  let queue: LocalQueue;
  let sender: ReturnType<typeof vi.fn<SenderFn>>;
  let processor: RetryProcessor;

  beforeEach(() => {
    queue = new LocalQueue(':memory:');
    sender = vi.fn<SenderFn>().mockResolvedValue({ success: true });
    processor = new RetryProcessor(queue, sender);
  });

  afterEach(() => {
    processor.stop();
    queue.close();
  });

  it('processOnce returns 0 when queue is empty', async () => {
    const count = await processor.processOnce();
    expect(count).toBe(0);
    expect(sender).not.toHaveBeenCalled();
  });

  it('processOnce sends a pending item and marks it sent', async () => {
    queue.enqueue(makeLabResult());
    expect(queue.getPendingCount()).toBe(1);

    const count = await processor.processOnce();

    expect(count).toBe(1);
    expect(sender).toHaveBeenCalledOnce();
    expect(queue.getPendingCount()).toBe(0);
  });

  it('processOnce marks item failed when sender returns failure', async () => {
    sender.mockResolvedValue({ success: false, error: 'Server 500' });

    queue.enqueue(makeLabResult());
    const count = await processor.processOnce();

    expect(count).toBe(1);
    // Item is still pending (just with increased attempts), not permanently failed
    expect(queue.getPendingCount()).toBe(1);
  });

  it('processOnce marks item failed when sender throws', async () => {
    sender.mockRejectedValue(new Error('Connection refused'));

    queue.enqueue(makeLabResult());
    const count = await processor.processOnce();

    expect(count).toBe(1);
    expect(queue.getPendingCount()).toBe(1);
  });

  it('sender receives the deserialized LabResult', async () => {
    const labResult = makeLabResult('check-payload');
    queue.enqueue(labResult);

    await processor.processOnce();

    const sentArg = sender.mock.calls[0][0];
    expect(sentArg.messageId).toBe('check-payload');
    expect(sentArg.analyzerId).toBe('sysmex-xn550');
  });

  it('start() begins periodic processing', async () => {
    vi.useFakeTimers();

    queue.enqueue(makeLabResult());
    processor.start(1000);

    expect(processor.isRunning()).toBe(true);

    // Advance time to trigger one interval
    await vi.advanceTimersByTimeAsync(1000);

    expect(sender).toHaveBeenCalledOnce();

    processor.stop();
    vi.useRealTimers();
  });

  it('stop() halts periodic processing', () => {
    vi.useFakeTimers();

    processor.start(1000);
    expect(processor.isRunning()).toBe(true);

    processor.stop();
    expect(processor.isRunning()).toBe(false);

    vi.useRealTimers();
  });

  it('start() is idempotent — calling twice does not create two timers', () => {
    vi.useFakeTimers();

    processor.start(1000);
    processor.start(1000); // should be a no-op

    expect(processor.isRunning()).toBe(true);

    processor.stop();
    vi.useRealTimers();
  });
});
