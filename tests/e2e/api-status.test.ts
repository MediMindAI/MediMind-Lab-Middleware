/**
 * E2E test: REST API endpoints.
 *
 * Spins up the Express server with mock dependencies and verifies
 * that GET /health, GET /status, and GET /messages return the correct
 * response shapes. Uses supertest to make HTTP calls without starting
 * a real TCP listener.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createServer, type ServerDeps } from '../../src/api/server.js';
import { MessageLogger } from '../../src/logging/messageLogger.js';
import type { AnalyzerStatus } from '../../src/types/analyzer.js';

/** Build a mock AnalyzerStatus with sensible defaults */
function mockAnalyzerStatus(overrides: Partial<AnalyzerStatus> = {}): AnalyzerStatus {
  return {
    id: 'sysmex-xn550',
    name: 'Sysmex XN-550',
    protocol: 'astm',
    connected: true,
    lastMessageTime: '2026-03-05T14:30:00Z',
    lastErrorTime: null,
    lastError: null,
    messagesReceived: 42,
    errorsCount: 0,
    upSince: '2026-03-05T08:00:00Z',
    ...overrides,
  };
}

describe('REST API E2E', () => {
  let logger: MessageLogger;
  let deps: ServerDeps;

  beforeEach(() => {
    logger = new MessageLogger(':memory:');

    deps = {
      health: {
        getStatuses: () => [
          mockAnalyzerStatus(),
          mockAnalyzerStatus({
            id: 'mindray-bc3510',
            name: 'Mindray BC-3510',
            protocol: 'hl7v2',
            connected: false,
          }),
        ],
        startTime: new Date('2026-03-05T08:00:00Z'),
        version: '0.1.0-test',
      },
      status: {
        getStatuses: () => [
          mockAnalyzerStatus(),
          mockAnalyzerStatus({
            id: 'mindray-bc3510',
            name: 'Mindray BC-3510',
            protocol: 'hl7v2',
            connected: false,
          }),
        ],
      },
      messages: { logger },
    };
  });

  // ── GET /health ─────────────────────────────────────────────

  describe('GET /health', () => {
    it('returns 200 with correct shape', async () => {
      const app = createServer(deps);
      const res = await request(app).get('/health');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status');
      expect(res.body).toHaveProperty('version');
      expect(res.body).toHaveProperty('uptime');
      expect(res.body).toHaveProperty('timestamp');
      expect(res.body).toHaveProperty('analyzers');
    });

    it('reports degraded when some analyzers are disconnected', async () => {
      const app = createServer(deps);
      const res = await request(app).get('/health');

      // One connected, one disconnected -> "degraded"
      expect(res.body.status).toBe('degraded');
      expect(res.body.analyzers.total).toBe(2);
      expect(res.body.analyzers.connected).toBe(1);
      expect(res.body.analyzers.disconnected).toBe(1);
    });

    it('reports ok when all analyzers are connected', async () => {
      deps.health.getStatuses = () => [mockAnalyzerStatus(), mockAnalyzerStatus()];
      const app = createServer(deps);
      const res = await request(app).get('/health');

      expect(res.body.status).toBe('ok');
    });

    it('includes version string', async () => {
      const app = createServer(deps);
      const res = await request(app).get('/health');

      expect(res.body.version).toBe('0.1.0-test');
    });
  });

  // ── GET /status ─────────────────────────────────────────────

  describe('GET /status', () => {
    it('returns 200 with analyzers array', async () => {
      const app = createServer(deps);
      const res = await request(app).get('/status');

      expect(res.status).toBe(200);
      expect(res.body.analyzers).toHaveLength(2);
    });

    it('each analyzer has expected fields', async () => {
      const app = createServer(deps);
      const res = await request(app).get('/status');

      const analyzer = res.body.analyzers[0];
      expect(analyzer).toHaveProperty('id');
      expect(analyzer).toHaveProperty('name');
      expect(analyzer).toHaveProperty('protocol');
      expect(analyzer).toHaveProperty('connected');
      expect(analyzer).toHaveProperty('messagesReceived');
      expect(analyzer).toHaveProperty('errorsCount');
    });

    it('shows correct connection status per analyzer', async () => {
      const app = createServer(deps);
      const res = await request(app).get('/status');

      const sysmex = res.body.analyzers.find(
        (a: AnalyzerStatus) => a.id === 'sysmex-xn550'
      );
      const mindray = res.body.analyzers.find(
        (a: AnalyzerStatus) => a.id === 'mindray-bc3510'
      );

      expect(sysmex.connected).toBe(true);
      expect(mindray.connected).toBe(false);
    });
  });

  // ── GET /messages ───────────────────────────────────────────

  describe('GET /messages', () => {
    it('returns 200 with empty messages when no logs exist', async () => {
      const app = createServer(deps);
      const res = await request(app).get('/messages');

      expect(res.status).toBe(200);
      expect(res.body.messages).toEqual([]);
      expect(res.body.total).toBe(0);
    });

    it('returns logged messages after inserting one', async () => {
      // Log a message first
      logger.logMessage({
        timestamp: '2026-03-05T14:30:00Z',
        analyzerId: 'sysmex-xn550',
        analyzerName: 'Sysmex XN-550',
        direction: 'inbound',
        protocol: 'astm',
        rawContent: 'R|1|^^^WBC|7.5',
        parsedSummary: 'WBC=7.5',
        fhirResourceIds: ['Observation/obs-1'],
        status: 'success',
      });

      const app = createServer(deps);
      const res = await request(app).get('/messages');

      expect(res.body.messages).toHaveLength(1);
      expect(res.body.total).toBe(1);
      expect(res.body.messages[0].analyzerId).toBe('sysmex-xn550');
      expect(res.body.messages[0].rawContent).toBe('R|1|^^^WBC|7.5');
    });

    it('GET /messages/:id returns a single message', async () => {
      const id = logger.logMessage({
        timestamp: '2026-03-05T14:30:00Z',
        analyzerId: 'sysmex-xn550',
        analyzerName: 'Sysmex XN-550',
        direction: 'inbound',
        protocol: 'astm',
        rawContent: 'test content',
        parsedSummary: '',
        fhirResourceIds: [],
        status: 'success',
      });

      const app = createServer(deps);
      const res = await request(app).get(`/messages/${id}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(id);
      expect(res.body.rawContent).toBe('test content');
    });

    it('GET /messages/:id returns 404 for nonexistent id', async () => {
      const app = createServer(deps);
      const res = await request(app).get('/messages/99999');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Message not found');
    });

    it('supports pagination with limit and offset', async () => {
      // Insert 3 messages
      for (let i = 1; i <= 3; i++) {
        logger.logMessage({
          timestamp: `2026-03-05T14:3${i}:00Z`,
          analyzerId: 'sysmex-xn550',
          analyzerName: 'Sysmex XN-550',
          direction: 'inbound',
          protocol: 'astm',
          rawContent: `message ${i}`,
          parsedSummary: '',
          fhirResourceIds: [],
          status: 'success',
        });
      }

      const app = createServer(deps);

      // Get first 2
      const res1 = await request(app).get('/messages?limit=2&offset=0');
      expect(res1.body.messages).toHaveLength(2);
      expect(res1.body.total).toBe(3);

      // Get last 1
      const res2 = await request(app).get('/messages?limit=2&offset=2');
      expect(res2.body.messages).toHaveLength(1);
    });
  });

  // ── 404 and error handling ──────────────────────────────────

  describe('Error handling', () => {
    it('returns 404 JSON for unknown routes', async () => {
      const app = createServer(deps);
      const res = await request(app).get('/nonexistent');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Not found');
    });

    it('returns proper CORS headers', async () => {
      const app = createServer(deps);
      const res = await request(app).get('/health');

      expect(res.headers['access-control-allow-origin']).toBe('*');
    });
  });
});
