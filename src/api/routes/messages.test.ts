/**
 * Tests for GET /messages — the message audit log endpoint.
 *
 * Uses a real in-memory MessageLogger (not mocks) so we test the
 * full route+logger integration, matching the pattern of other route tests.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createMessagesRouter } from './messages.js';
import { MessageLogger, type NewMessageLogEntry } from '../../logging/messageLogger.js';

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
    rawContent: 'H|\\^&||SysmexXN',
    parsedSummary: 'CBC result: WBC=7.5',
    fhirResourceIds: ['obs-1'],
    status: 'success',
    errorMessage: undefined,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('GET /messages', () => {
  let app: express.Express;
  let logger: MessageLogger;

  beforeEach(() => {
    logger = new MessageLogger(':memory:');
    app = express();
    app.use('/messages', createMessagesRouter({ logger }));
  });

  afterEach(() => {
    logger.close();
  });

  it('returns paginated messages with total count', async () => {
    logger.logMessage(buildEntry());
    logger.logMessage(buildEntry({ analyzerId: 'roche-c111' }));

    const res = await request(app).get('/messages');

    expect(res.status).toBe(200);
    expect(res.body.messages).toHaveLength(2);
    expect(res.body.total).toBe(2);
    expect(res.body.limit).toBe(50); // default
    expect(res.body.offset).toBe(0); // default
  });

  it('respects limit and offset query params', async () => {
    for (let i = 0; i < 5; i++) {
      logger.logMessage(buildEntry({ parsedSummary: `msg-${i}` }));
    }

    const res = await request(app).get('/messages?limit=2&offset=2');

    expect(res.status).toBe(200);
    expect(res.body.messages).toHaveLength(2);
    expect(res.body.limit).toBe(2);
    expect(res.body.offset).toBe(2);
    expect(res.body.total).toBe(5);
  });

  it('filters by analyzerId', async () => {
    logger.logMessage(buildEntry({ analyzerId: 'sysmex-xn550' }));
    logger.logMessage(buildEntry({ analyzerId: 'roche-c111' }));
    logger.logMessage(buildEntry({ analyzerId: 'sysmex-xn550' }));

    const res = await request(app).get('/messages?analyzerId=sysmex-xn550');

    expect(res.status).toBe(200);
    expect(res.body.messages).toHaveLength(2);
    expect(res.body.total).toBe(2);
    expect(res.body.messages.every((m: { analyzerId: string }) => m.analyzerId === 'sysmex-xn550')).toBe(true);
  });

  it('filters by status', async () => {
    logger.logMessage(buildEntry({ status: 'success' }));
    logger.logMessage(buildEntry({ status: 'parse-error', errorMessage: 'bad data' }));
    logger.logMessage(buildEntry({ status: 'success' }));

    const res = await request(app).get('/messages?status=parse-error');

    expect(res.status).toBe(200);
    expect(res.body.messages).toHaveLength(1);
    expect(res.body.messages[0].status).toBe('parse-error');
    expect(res.body.total).toBe(1);
  });

  it('filters by date range (from and to)', async () => {
    logger.logMessage(buildEntry({ timestamp: '2026-03-01T08:00:00.000Z' }));
    logger.logMessage(buildEntry({ timestamp: '2026-03-05T10:00:00.000Z' }));
    logger.logMessage(buildEntry({ timestamp: '2026-03-10T14:00:00.000Z' }));

    const res = await request(app).get(
      '/messages?from=2026-03-04T00:00:00.000Z&to=2026-03-06T00:00:00.000Z'
    );

    expect(res.status).toBe(200);
    expect(res.body.messages).toHaveLength(1);
    expect(res.body.messages[0].timestamp).toBe('2026-03-05T10:00:00.000Z');
  });

  it('returns empty array when no messages exist', async () => {
    const res = await request(app).get('/messages');

    expect(res.status).toBe(200);
    expect(res.body.messages).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  it('clamps limit to max 500', async () => {
    const res = await request(app).get('/messages?limit=9999');

    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(500);
  });

  it('clamps limit to min 1', async () => {
    const res = await request(app).get('/messages?limit=0');

    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(1);
  });

  it('returns JSON content type', async () => {
    const res = await request(app).get('/messages');
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });
});

describe('GET /messages/:id', () => {
  let app: express.Express;
  let logger: MessageLogger;

  beforeEach(() => {
    logger = new MessageLogger(':memory:');
    app = express();
    app.use('/messages', createMessagesRouter({ logger }));
  });

  afterEach(() => {
    logger.close();
  });

  it('returns a single message by ID', async () => {
    const id = logger.logMessage(buildEntry({ parsedSummary: 'target message' }));

    const res = await request(app).get(`/messages/${id}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(id);
    expect(res.body.parsedSummary).toBe('target message');
    expect(res.body.analyzerId).toBe('sysmex-xn550');
  });

  it('returns 404 for an unknown ID', async () => {
    const res = await request(app).get('/messages/999');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Message not found');
  });

  it('returns 400 for a non-numeric ID', async () => {
    const res = await request(app).get('/messages/abc');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid message ID');
  });

  it('includes fhirResourceIds as an array', async () => {
    const id = logger.logMessage(buildEntry({ fhirResourceIds: ['obs-1', 'diag-2'] }));

    const res = await request(app).get(`/messages/${id}`);

    expect(res.status).toBe(200);
    expect(res.body.fhirResourceIds).toEqual(['obs-1', 'diag-2']);
  });
});

describe('POST /messages/:id/retry', () => {
  let app: express.Express;
  let logger: MessageLogger;
  let enqueued: { messageId: string; analyzerId: string; payload: string }[];

  beforeEach(() => {
    logger = new MessageLogger(':memory:');
    enqueued = [];
    app = express();
    app.use(express.json());
    app.use('/messages', createMessagesRouter({
      logger,
      retryQueue: {
        enqueueRaw: (messageId, analyzerId, payload) => {
          enqueued.push({ messageId, analyzerId, payload });
          return 1;
        },
      },
    }));
  });

  afterEach(() => {
    logger.close();
  });

  it('re-queues a send-error message and returns success', async () => {
    const id = logger.logMessage(buildEntry({ status: 'send-error', errorMessage: 'timeout' }));

    const res = await request(app).post(`/messages/${id}/retry`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.messageId).toBe(id);
    expect(enqueued).toHaveLength(1);
    expect(enqueued[0].analyzerId).toBe('sysmex-xn550');
  });

  it('re-queues a queued message', async () => {
    const id = logger.logMessage(buildEntry({ status: 'queued' }));

    const res = await request(app).post(`/messages/${id}/retry`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('rejects retry of a success message with 409', async () => {
    const id = logger.logMessage(buildEntry({ status: 'success' }));

    const res = await request(app).post(`/messages/${id}/retry`);

    expect(res.status).toBe(409);
    expect(enqueued).toHaveLength(0);
  });

  it('returns 404 for unknown message', async () => {
    const res = await request(app).post('/messages/999/retry');

    expect(res.status).toBe(404);
  });

  it('returns 400 for non-numeric ID', async () => {
    const res = await request(app).post('/messages/abc/retry');

    expect(res.status).toBe(400);
  });

  it('returns 501 when retryQueue is not configured', async () => {
    const noRetryApp = express();
    noRetryApp.use(express.json());
    noRetryApp.use('/messages', createMessagesRouter({ logger }));

    const id = logger.logMessage(buildEntry({ status: 'send-error' }));
    const res = await request(noRetryApp).post(`/messages/${id}/retry`);

    expect(res.status).toBe(501);
  });
});
