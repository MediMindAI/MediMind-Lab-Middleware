/**
 * Tests for the Express REST API server.
 *
 * Verifies the server setup: CORS headers, JSON parsing, 404 handling,
 * and that routes are mounted correctly at /health and /status.
 */

import { describe, it, expect, beforeEach } from 'vitest';
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

  it('sets CORS headers', async () => {
    const app = createServer(deps);
    const res = await request(app).get('/health');

    expect(res.headers['access-control-allow-origin']).toBe('*');
    expect(res.headers['access-control-allow-methods']).toContain('GET');
  });

  it('handles OPTIONS preflight requests', async () => {
    const app = createServer(deps);
    const res = await request(app).options('/health');

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('*');
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
});
