/**
 * Tests for the Express REST API server.
 *
 * Verifies the server setup: CORS headers, JSON parsing, 404 handling,
 * and that routes are mounted correctly at /health and /status.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createServer, type ServerDeps } from './server.js';
import type { AnalyzerStatus } from '../types/analyzer.js';

function mockStatus(overrides: Partial<AnalyzerStatus> = {}): AnalyzerStatus {
  return {
    id: 'test',
    name: 'Test',
    protocol: 'astm',
    connected: true,
    lastMessageTime: null,
    lastErrorTime: null,
    lastError: null,
    messagesReceived: 0,
    errorsCount: 0,
    upSince: null,
    ...overrides,
  };
}

describe('API Server', () => {
  let deps: ServerDeps;

  beforeEach(() => {
    deps = {
      health: {
        getStatuses: () => [mockStatus()],
        startTime: new Date(),
        version: '0.1.0',
      },
      status: {
        getStatuses: () => [mockStatus()],
      },
    };
  });

  it('GET /health returns 200', async () => {
    const app = createServer(deps);
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBeDefined();
  });

  it('GET /status returns 200', async () => {
    const app = createServer(deps);
    const res = await request(app).get('/status');
    expect(res.status).toBe(200);
    expect(res.body.analyzers).toBeDefined();
  });

  it('returns 404 for unknown routes', async () => {
    const app = createServer(deps);
    const res = await request(app).get('/nonexistent');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Not found');
  });

  it('sets CORS headers with default wildcard origin', async () => {
    const app = createServer(deps);
    const res = await request(app).get('/health');

    expect(res.headers['access-control-allow-origin']).toBe('*');
    expect(res.headers['access-control-allow-methods']).toContain('GET');
  });

  it('sets CORS headers with configured origin', async () => {
    const app = createServer({ ...deps, corsOrigin: 'https://emr.hospital.local' });
    const res = await request(app).get('/health');

    expect(res.headers['access-control-allow-origin']).toBe('https://emr.hospital.local');
  });

  it('handles OPTIONS preflight requests', async () => {
    const app = createServer(deps);
    const res = await request(app).options('/health');

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('*');
  });

  it('error handler returns 500 for unhandled errors', async () => {
    const app = createServer(deps);

    // Malformed JSON triggers express.json() parser error, which calls
    // the Express error handler (lines 71-73 of server.ts)
    const res = await request(app)
      .post('/health')
      .set('Content-Type', 'application/json')
      .send('not-valid-json');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error');
  });

  it('error handler uses logger when provided', async () => {
    const mockLogger = { error: vi.fn() };
    const app = createServer({ ...deps, logger: mockLogger });

    await request(app)
      .post('/health')
      .set('Content-Type', 'application/json')
      .send('not-valid-json');

    expect(mockLogger.error).toHaveBeenCalledWith(
      'Unhandled API error',
      expect.objectContaining({ error: expect.any(String) })
    );
  });

  it('returns JSON content type for all responses', async () => {
    const app = createServer(deps);

    const healthRes = await request(app).get('/health');
    expect(healthRes.headers['content-type']).toMatch(/application\/json/);

    const statusRes = await request(app).get('/status');
    expect(statusRes.headers['content-type']).toMatch(/application\/json/);

    const notFoundRes = await request(app).get('/unknown');
    expect(notFoundRes.headers['content-type']).toMatch(/application\/json/);
  });

  // --- API Key Authentication ---

  describe('API key authentication', () => {
    const API_KEY = 'test-secret-key-12345';

    it('returns 401 for protected routes when API key is required but not provided', async () => {
      const app = createServer({ ...deps, apiKey: API_KEY });

      const res = await request(app).get('/status');

      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Unauthorized');
    });

    it('returns 401 for protected routes with wrong API key', async () => {
      const app = createServer({ ...deps, apiKey: API_KEY });

      const res = await request(app)
        .get('/status')
        .set('X-Api-Key', 'wrong-key');

      expect(res.status).toBe(401);
    });

    it('returns 200 for protected routes with correct API key', async () => {
      const app = createServer({ ...deps, apiKey: API_KEY });

      const res = await request(app)
        .get('/status')
        .set('X-Api-Key', API_KEY);

      expect(res.status).toBe(200);
      expect(res.body.analyzers).toBeDefined();
    });

    it('/health is always accessible without API key', async () => {
      const app = createServer({ ...deps, apiKey: API_KEY });

      const res = await request(app).get('/health');

      expect(res.status).toBe(200);
      expect(res.body.status).toBeDefined();
    });

    it('does not require API key when apiKey is not set', async () => {
      // deps has no apiKey — all routes should be open
      const app = createServer(deps);

      const res = await request(app).get('/status');

      expect(res.status).toBe(200);
    });
  });

  // --- Rate Limiting ---

  describe('rate limiting', () => {
    it('returns 429 after 100 requests in a minute', async () => {
      const app = createServer(deps);

      // Send 100 requests (all should succeed)
      for (let i = 0; i < 100; i++) {
        const res = await request(app).get('/health');
        expect(res.status).toBe(200);
      }

      // The 101st request should be rate-limited
      const res = await request(app).get('/health');
      expect(res.status).toBe(429);
      expect(res.body.error).toContain('Too many requests');
    });
  });
});
