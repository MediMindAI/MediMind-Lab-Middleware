/**
 * Tests for MessageLogger — the audit trail that records every message
 * received from (or sent to) lab analyzers.
 *
 * Uses in-memory SQLite (':memory:') so no files are created on disk.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomBytes } from 'node:crypto';
import { MessageLogger, type NewMessageLogEntry } from './messageLogger.js';

// ---------------------------------------------------------------------------
// Helper — builds a valid log entry with sensible defaults
// ---------------------------------------------------------------------------

function buildEntry(overrides: Partial<NewMessageLogEntry> = {}): NewMessageLogEntry {
  return {
    timestamp: '2026-03-05T10:00:00.000Z',
    analyzerId: 'sysmex-xn550',
    analyzerName: 'Sysmex XN-550',
    direction: 'inbound',
    protocol: 'astm',
    rawContent: 'H|\\^&||SysmexXN||||||LIS2-A2|P|1|20260305\r',
    parsedSummary: 'CBC result: WBC=7.5, RBC=4.8',
    fhirResourceIds: ['obs-123', 'diag-456'],
    status: 'success',
    errorMessage: undefined,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('MessageLogger', () => {
  let logger: MessageLogger;

  beforeEach(() => {
    logger = new MessageLogger(':memory:');
  });

  afterEach(() => {
    logger.close();
  });

  // --- logMessage ---

  it('logs a message with all fields and returns an ID', () => {
    const id = logger.logMessage(buildEntry());

    expect(id).toBe(1);
  });

  it('assigns incrementing IDs to consecutive messages', () => {
    const id1 = logger.logMessage(buildEntry());
    const id2 = logger.logMessage(buildEntry({ analyzerId: 'roche-c111' }));

    expect(id1).toBe(1);
    expect(id2).toBe(2);
  });

  // --- getMessageById ---

  it('retrieves a logged message by ID with all fields intact', () => {
    const entry = buildEntry();
    const id = logger.logMessage(entry);

    const result = logger.getMessageById(id);

    expect(result).not.toBeNull();
    expect(result!.id).toBe(id);
    expect(result!.timestamp).toBe(entry.timestamp);
    expect(result!.analyzerId).toBe(entry.analyzerId);
    expect(result!.analyzerName).toBe(entry.analyzerName);
    expect(result!.direction).toBe(entry.direction);
    expect(result!.protocol).toBe(entry.protocol);
    expect(result!.rawContent).toBe(entry.rawContent);
    expect(result!.parsedSummary).toBe(entry.parsedSummary);
    expect(result!.fhirResourceIds).toEqual(entry.fhirResourceIds);
    expect(result!.status).toBe(entry.status);
  });

  it('returns null for an unknown ID', () => {
    const result = logger.getMessageById(999);
    expect(result).toBeNull();
  });

  // --- queryMessages: filters ---

  it('queries messages by analyzerId', () => {
    logger.logMessage(buildEntry({ analyzerId: 'sysmex-xn550' }));
    logger.logMessage(buildEntry({ analyzerId: 'roche-c111' }));
    logger.logMessage(buildEntry({ analyzerId: 'sysmex-xn550' }));

    const results = logger.queryMessages({ analyzerId: 'sysmex-xn550' });

    expect(results).toHaveLength(2);
    expect(results.every((r) => r.analyzerId === 'sysmex-xn550')).toBe(true);
  });

  it('queries messages by status', () => {
    logger.logMessage(buildEntry({ status: 'success' }));
    logger.logMessage(buildEntry({ status: 'parse-error', errorMessage: 'bad checksum' }));
    logger.logMessage(buildEntry({ status: 'success' }));

    const errors = logger.queryMessages({ status: 'parse-error' });

    expect(errors).toHaveLength(1);
    expect(errors[0].status).toBe('parse-error');
    expect(errors[0].errorMessage).toBe('bad checksum');
  });

  it('queries messages by date range', () => {
    logger.logMessage(buildEntry({ timestamp: '2026-03-01T08:00:00.000Z' }));
    logger.logMessage(buildEntry({ timestamp: '2026-03-05T10:00:00.000Z' }));
    logger.logMessage(buildEntry({ timestamp: '2026-03-10T14:00:00.000Z' }));

    const results = logger.queryMessages({
      from: '2026-03-04T00:00:00.000Z',
      to: '2026-03-06T00:00:00.000Z',
    });

    expect(results).toHaveLength(1);
    expect(results[0].timestamp).toBe('2026-03-05T10:00:00.000Z');
  });

  // --- queryMessages: pagination ---

  it('paginates results with limit and offset', () => {
    // Insert 5 messages
    for (let i = 0; i < 5; i++) {
      logger.logMessage(buildEntry({ parsedSummary: `message-${i}` }));
    }

    const page1 = logger.queryMessages({ limit: 2, offset: 0 });
    const page2 = logger.queryMessages({ limit: 2, offset: 2 });
    const page3 = logger.queryMessages({ limit: 2, offset: 4 });

    expect(page1).toHaveLength(2);
    expect(page2).toHaveLength(2);
    expect(page3).toHaveLength(1);
  });

  it('defaults to limit=50 and offset=0', () => {
    // Insert 3 messages — all should come back with default pagination
    for (let i = 0; i < 3; i++) {
      logger.logMessage(buildEntry());
    }

    const results = logger.queryMessages();
    expect(results).toHaveLength(3);
  });

  // --- getCount ---

  it('returns total count of all messages', () => {
    logger.logMessage(buildEntry());
    logger.logMessage(buildEntry());
    logger.logMessage(buildEntry());

    expect(logger.getCount()).toBe(3);
  });

  it('returns count filtered by analyzerId', () => {
    logger.logMessage(buildEntry({ analyzerId: 'sysmex-xn550' }));
    logger.logMessage(buildEntry({ analyzerId: 'roche-c111' }));
    logger.logMessage(buildEntry({ analyzerId: 'sysmex-xn550' }));

    expect(logger.getCount({ analyzerId: 'sysmex-xn550' })).toBe(2);
    expect(logger.getCount({ analyzerId: 'roche-c111' })).toBe(1);
  });

  it('returns count filtered by status', () => {
    logger.logMessage(buildEntry({ status: 'success' }));
    logger.logMessage(buildEntry({ status: 'parse-error' }));
    logger.logMessage(buildEntry({ status: 'success' }));

    expect(logger.getCount({ status: 'success' })).toBe(2);
    expect(logger.getCount({ status: 'parse-error' })).toBe(1);
  });

  // --- Edge cases ---

  it('preserves raw content exactly (binary-like data)', () => {
    const rawContent = '\x02H|\\^&||Host|||||||LIS2-A2|P|1\x03\r\n';
    const id = logger.logMessage(buildEntry({ rawContent }));

    const result = logger.getMessageById(id);
    expect(result!.rawContent).toBe(rawContent);
  });

  it('handles unicode content correctly', () => {
    const entry = buildEntry({
      analyzerName: 'Анализатор XN-550',
      parsedSummary: 'ანალიზატორის შედეგი: WBC=7.5',
      rawContent: 'Unicode: \u00e9\u00f1\u00fc \u4e2d\u6587 \u10e5\u10d0\u10e0\u10d7\u10e3\u10da\u10d8',
    });
    const id = logger.logMessage(entry);

    const result = logger.getMessageById(id);
    expect(result!.analyzerName).toBe('Анализатор XN-550');
    expect(result!.parsedSummary).toBe('ანალიზატორის შედეგი: WBC=7.5');
    expect(result!.rawContent).toBe(entry.rawContent);
  });

  it('stores empty fhirResourceIds as empty array', () => {
    const id = logger.logMessage(buildEntry({ fhirResourceIds: [] }));

    const result = logger.getMessageById(id);
    expect(result!.fhirResourceIds).toEqual([]);
  });

  it('stores errorMessage as undefined when not provided', () => {
    const id = logger.logMessage(buildEntry({ errorMessage: undefined }));

    const result = logger.getMessageById(id);
    expect(result!.errorMessage).toBeUndefined();
  });

  it('stores errorMessage when provided', () => {
    const id = logger.logMessage(buildEntry({
      status: 'send-error',
      errorMessage: 'Connection refused',
    }));

    const result = logger.getMessageById(id);
    expect(result!.errorMessage).toBe('Connection refused');
  });

  // --- Encryption ---

  describe('with encryption', () => {
    const TEST_KEY = randomBytes(32).toString('hex');
    let encLogger: MessageLogger;

    beforeEach(() => {
      encLogger = new MessageLogger(':memory:', TEST_KEY);
    });

    afterEach(() => {
      encLogger.close();
    });

    it('encrypts rawContent on insert and decrypts on read (round-trip)', () => {
      const entry = buildEntry({ rawContent: 'Patient: John Doe, WBC=7.5' });
      const id = encLogger.logMessage(entry);

      const result = encLogger.getMessageById(id);
      expect(result!.rawContent).toBe('Patient: John Doe, WBC=7.5');
    });

    it('stores encrypted (not plaintext) data in SQLite', () => {
      const plaintext = 'H|\\^&||SysmexXN||||||LIS2-A2|P|1|20260305\r';
      const id = encLogger.logMessage(buildEntry({ rawContent: plaintext }));

      // Read the raw row directly from SQLite — it should NOT be plaintext
      const rawRow = encLogger.getRawDb()
        .prepare('SELECT raw_content FROM message_log WHERE id = ?')
        .get(id) as { raw_content: string };

      expect(rawRow.raw_content).not.toBe(plaintext);
    });

    it('decrypts rawContent in queryMessages results', () => {
      const entry = buildEntry({ rawContent: 'Sensitive PHI data' });
      encLogger.logMessage(entry);

      const results = encLogger.queryMessages();
      expect(results).toHaveLength(1);
      expect(results[0].rawContent).toBe('Sensitive PHI data');
    });
  });

  // --- pruneOldMessages ---

  describe('pruneOldMessages', () => {
    it('deletes messages older than the specified days', () => {
      // Insert a message with a timestamp 100 days ago
      logger.logMessage(buildEntry({ timestamp: '2025-11-01T10:00:00.000Z' }));
      // Insert a recent message
      logger.logMessage(buildEntry({ timestamp: '2026-03-05T10:00:00.000Z' }));

      const deleted = logger.pruneOldMessages(90);

      expect(deleted).toBe(1);
      expect(logger.getCount()).toBe(1);
    });

    it('keeps recent messages intact', () => {
      logger.logMessage(buildEntry({ timestamp: '2026-03-05T10:00:00.000Z' }));
      logger.logMessage(buildEntry({ timestamp: '2026-03-04T10:00:00.000Z' }));

      const deleted = logger.pruneOldMessages(7);

      expect(deleted).toBe(0);
      expect(logger.getCount()).toBe(2);
    });

    it('returns 0 when no messages match', () => {
      const deleted = logger.pruneOldMessages(30);
      expect(deleted).toBe(0);
    });
  });
});
