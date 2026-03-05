/**
 * Tests for LocalQueue — the SQLite offline queue.
 *
 * All tests use ':memory:' SQLite databases so they're instant
 * and don't leave any files behind. Each test gets a fresh queue.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LocalQueue } from './localQueue.js';
import type { LabResult } from '../types/result.js';

/** Helper: create a minimal LabResult for testing */
function makeLabResult(overrides: Partial<LabResult> = {}): LabResult {
  return {
    messageId: overrides.messageId ?? 'msg-001',
    analyzerId: overrides.analyzerId ?? 'sysmex-xn550',
    specimenBarcode: '12345678',
    patientId: '',
    patientName: '',
    testDateTime: '2026-01-15T10:00:00Z',
    receivedAt: '2026-01-15T10:00:01Z',
    components: [],
    rawMessage: 'raw-data',
    processingStatus: 'mapped',
    ...overrides,
  };
}

describe('LocalQueue', () => {
  let queue: LocalQueue;

  beforeEach(() => {
    queue = new LocalQueue(':memory:');
  });

  afterEach(() => {
    queue.close();
  });

  it('enqueue returns a numeric ID', () => {
    const id = queue.enqueue(makeLabResult());
    expect(id).toBeGreaterThan(0);
  });

  it('enqueue stores the LabResult as JSON', () => {
    queue.enqueue(makeLabResult({ messageId: 'test-json' }));

    const entry = queue.dequeueNext();
    expect(entry).not.toBeNull();

    const parsed = JSON.parse(entry!.payload) as LabResult;
    expect(parsed.messageId).toBe('test-json');
    expect(parsed.analyzerId).toBe('sysmex-xn550');
  });

  it('dequeueNext returns the oldest pending entry', () => {
    queue.enqueue(makeLabResult({ messageId: 'first' }));
    queue.enqueue(makeLabResult({ messageId: 'second' }));

    const entry = queue.dequeueNext();
    expect(entry!.messageId).toBe('first');
  });

  it('dequeueNext returns null when queue is empty', () => {
    const entry = queue.dequeueNext();
    expect(entry).toBeNull();
  });

  it('markSent removes item from pending results', () => {
    const id = queue.enqueue(makeLabResult());
    expect(queue.getPendingCount()).toBe(1);

    queue.markSent(id);

    expect(queue.getPendingCount()).toBe(0);
    expect(queue.dequeueNext()).toBeNull();
  });

  it('markFailed increments attempts and keeps item pending', () => {
    const id = queue.enqueue(makeLabResult());

    queue.markFailed(id, 'Network timeout');

    // Still pending (just 1 attempt, max is 10)
    expect(queue.getPendingCount()).toBe(1);
    expect(queue.getFailedCount()).toBe(0);
  });

  it('markFailed sets status to failed when max retries exceeded', () => {
    // Create queue with maxRetries = 2
    queue.close();
    queue = new LocalQueue(':memory:', 2);

    const id = queue.enqueue(makeLabResult());

    queue.markFailed(id, 'Error 1'); // attempt 1
    queue.markFailed(id, 'Error 2'); // attempt 2 — hits max

    expect(queue.getPendingCount()).toBe(0);
    expect(queue.getFailedCount()).toBe(1);
  });

  it('failed items are not returned by dequeueNext', () => {
    queue.close();
    queue = new LocalQueue(':memory:', 1);

    const id = queue.enqueue(makeLabResult());
    queue.markFailed(id, 'Permanent failure'); // 1 attempt = max

    expect(queue.dequeueNext()).toBeNull();
  });

  it('getPendingCount returns correct count', () => {
    expect(queue.getPendingCount()).toBe(0);

    queue.enqueue(makeLabResult({ messageId: 'a' }));
    queue.enqueue(makeLabResult({ messageId: 'b' }));
    queue.enqueue(makeLabResult({ messageId: 'c' }));

    expect(queue.getPendingCount()).toBe(3);
  });

  it('getFailedCount returns correct count', () => {
    expect(queue.getFailedCount()).toBe(0);

    queue.close();
    queue = new LocalQueue(':memory:', 1);

    const id1 = queue.enqueue(makeLabResult({ messageId: 'x' }));
    const id2 = queue.enqueue(makeLabResult({ messageId: 'y' }));

    queue.markFailed(id1, 'err');
    queue.markFailed(id2, 'err');

    expect(queue.getFailedCount()).toBe(2);
  });

  it('markFailed schedules next retry in the future via backoff', () => {
    const id = queue.enqueue(makeLabResult());

    // First failure — backoff is 1s * 2^1 = 2s
    queue.markFailed(id, 'timeout');

    // The item is pending but nextRetryAt is in the future,
    // so dequeueNext (which checks nextRetryAt <= now) won't return it
    // immediately. But getPendingCount still counts it.
    expect(queue.getPendingCount()).toBe(1);
  });

  it('rejects duplicate messageIds', () => {
    queue.enqueue(makeLabResult({ messageId: 'dup' }));

    expect(() => {
      queue.enqueue(makeLabResult({ messageId: 'dup' }));
    }).toThrow();
  });
});
