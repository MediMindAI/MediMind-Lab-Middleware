/**
 * Local offline queue — the "mailbox" for lab results.
 *
 * When the internet goes down and results can't reach Medplum Cloud,
 * they get saved here in a SQLite database. When connectivity returns,
 * the RetryProcessor picks them up and delivers them.
 *
 * Uses better-sqlite3 (synchronous API) with WAL mode for safe
 * concurrent reads/writes. In tests, pass ':memory:' for instant
 * in-memory databases that need no cleanup.
 */

import Database from 'better-sqlite3';
import type { LabResult } from '../types/result.js';

export interface QueueEntry {
  id: number;
  messageId: string;
  analyzerId: string;
  payload: string;
  status: 'pending' | 'processing' | 'sent' | 'failed';
  attempts: number;
  maxRetries: number;
  lastAttemptAt: string | null;
  nextRetryAt: string | null;
  createdAt: string;
  error: string | null;
}

/** Default max retries before giving up */
const DEFAULT_MAX_RETRIES = 10;

/** Max backoff delay in milliseconds (30 seconds) */
const MAX_BACKOFF_MS = 30_000;

export class LocalQueue {
  private db: Database.Database;

  constructor(dbPath: string, maxRetries = DEFAULT_MAX_RETRIES) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.initSchema();
    this.defaultMaxRetries = maxRetries;
  }

  private defaultMaxRetries: number;

  /** Create the queue table if it doesn't exist */
  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id TEXT NOT NULL UNIQUE,
        analyzer_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0,
        max_retries INTEGER NOT NULL DEFAULT 10,
        last_attempt_at TEXT,
        next_retry_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        error TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_queue_status ON queue(status);
      CREATE INDEX IF NOT EXISTS idx_queue_next_retry ON queue(next_retry_at);
    `);
  }

  /** Add a LabResult to the queue. Returns the new entry's ID. */
  enqueue(labResult: LabResult): number {
    const stmt = this.db.prepare(`
      INSERT INTO queue (message_id, analyzer_id, payload, status, max_retries, next_retry_at)
      VALUES (?, ?, ?, 'pending', ?, datetime('now'))
    `);
    const info = stmt.run(
      labResult.messageId,
      labResult.analyzerId,
      JSON.stringify(labResult),
      this.defaultMaxRetries,
    );
    return Number(info.lastInsertRowid);
  }

  /** Add a raw payload to the queue for retry (used by POST /messages/:id/retry). */
  enqueueRaw(messageId: string, analyzerId: string, payload: string): number {
    const stmt = this.db.prepare(`
      INSERT INTO queue (message_id, analyzer_id, payload, status, max_retries, next_retry_at)
      VALUES (?, ?, ?, 'pending', ?, datetime('now'))
    `);
    const info = stmt.run(messageId, analyzerId, payload, this.defaultMaxRetries);
    return Number(info.lastInsertRowid);
  }

  /**
   * Get the next item ready for retry.
   * Returns the oldest pending entry whose nextRetryAt is now or in the past.
   * Returns null if nothing is due.
   */
  dequeueNext(): QueueEntry | null {
    const row = this.db.prepare(`
      SELECT id, message_id, analyzer_id, payload, status, attempts,
             max_retries, last_attempt_at, next_retry_at, created_at, error
      FROM queue
      WHERE status = 'pending' AND next_retry_at <= datetime('now')
      ORDER BY next_retry_at ASC, id ASC
      LIMIT 1
    `).get() as Record<string, unknown> | undefined;

    if (!row) return null;

    return {
      id: row.id as number,
      messageId: row.message_id as string,
      analyzerId: row.analyzer_id as string,
      payload: row.payload as string,
      status: row.status as QueueEntry['status'],
      attempts: row.attempts as number,
      maxRetries: row.max_retries as number,
      lastAttemptAt: row.last_attempt_at as string | null,
      nextRetryAt: row.next_retry_at as string | null,
      createdAt: row.created_at as string,
      error: row.error as string | null,
    };
  }

  /** Mark a queue entry as successfully sent. */
  markSent(id: number): void {
    this.db.prepare(`
      UPDATE queue SET status = 'sent', last_attempt_at = datetime('now')
      WHERE id = ?
    `).run(id);
  }

  /**
   * Mark a queue entry as failed for this attempt.
   * Increments the attempt counter and calculates the next retry time
   * using exponential backoff: min(30s, 1s * 2^attempts).
   * If max retries exceeded, status becomes 'failed' permanently.
   */
  markFailed(id: number, error: string): void {
    // First, get current state
    const row = this.db.prepare(
      'SELECT attempts, max_retries FROM queue WHERE id = ?'
    ).get(id) as { attempts: number; max_retries: number } | undefined;

    if (!row) return;

    const newAttempts = row.attempts + 1;

    if (newAttempts >= row.max_retries) {
      // Exceeded max retries — mark as permanently failed
      this.db.prepare(`
        UPDATE queue
        SET status = 'failed', attempts = ?, error = ?, last_attempt_at = datetime('now')
        WHERE id = ?
      `).run(newAttempts, error, id);
    } else {
      // Schedule next retry with exponential backoff
      const backoffMs = Math.min(MAX_BACKOFF_MS, 1000 * Math.pow(2, newAttempts));
      const backoffSeconds = Math.round(backoffMs / 1000);
      this.db.prepare(`
        UPDATE queue
        SET status = 'pending', attempts = ?, error = ?,
            last_attempt_at = datetime('now'),
            next_retry_at = datetime('now', '+' || ? || ' seconds')
        WHERE id = ?
      `).run(newAttempts, error, backoffSeconds, id);
    }
  }

  /** Count entries still waiting to be sent. */
  getPendingCount(): number {
    const row = this.db.prepare(
      "SELECT COUNT(*) as count FROM queue WHERE status = 'pending'"
    ).get() as { count: number };
    return row.count;
  }

  /** Count entries that permanently failed (exceeded max retries). */
  getFailedCount(): number {
    const row = this.db.prepare(
      "SELECT COUNT(*) as count FROM queue WHERE status = 'failed'"
    ).get() as { count: number };
    return row.count;
  }

  /** Close the database connection. */
  close(): void {
    this.db.close();
  }
}
