/**
 * Retry Processor — the "mail carrier" for queued lab results.
 *
 * Periodically checks the offline queue for pending items and tries
 * to send them. If sending succeeds, the item is marked as sent.
 * If it fails, the item gets rescheduled with exponential backoff.
 *
 * Usage:
 *   const processor = new RetryProcessor(queue, sendToMedplum);
 *   processor.start(5000);  // check every 5 seconds
 *   // later...
 *   processor.stop();
 */

import type { LocalQueue } from './localQueue.js';
import type { LabResult } from '../types/result.js';

/** The function that actually sends a LabResult somewhere (e.g., Medplum) */
export type SenderFn = (labResult: LabResult) => Promise<{
  success: boolean;
  error?: string;
}>;

export class RetryProcessor {
  private queue: LocalQueue;
  private sender: SenderFn;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(queue: LocalQueue, sender: SenderFn) {
    this.queue = queue;
    this.sender = sender;
  }

  /**
   * Process the next pending item in the queue.
   * Returns the number of items processed (0 or 1).
   */
  async processOnce(): Promise<number> {
    const entry = this.queue.dequeueNext();
    if (!entry) return 0;

    const labResult = JSON.parse(entry.payload) as LabResult;

    try {
      const result = await this.sender(labResult);

      if (result.success) {
        this.queue.markSent(entry.id);
      } else {
        this.queue.markFailed(entry.id, result.error ?? 'Unknown error');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.queue.markFailed(entry.id, message);
    }

    return 1;
  }

  /** Start periodic processing at the given interval (in ms). */
  start(intervalMs: number): void {
    if (this.timer) return; // already running
    this.timer = setInterval(() => {
      void this.processOnce();
    }, intervalMs);
  }

  /** Stop periodic processing. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Check if the processor is currently running. */
  isRunning(): boolean {
    return this.timer !== null;
  }
}
