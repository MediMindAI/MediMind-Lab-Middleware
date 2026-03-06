/**
 * Tests for GET /health — the service health check endpoint.
 *
 * Verifies the health status logic:
 * - "ok" when all analyzers are connected
 * - "degraded" when some are disconnected
 * - "error" when all are disconnected
 * - correct uptime, version, and analyzer counts
 */

import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createHealthRouter, type HealthDeps } from './health.js';
import type { AnalyzerStatus } from '../../types/analyzer.js';

/** Build a mock AnalyzerStatus */
function mockStatus(overrides: Partial<AnalyzerStatus> = {}): AnalyzerStatus {
  return {
    id: 'test-analyzer',
    name: 'Test Analyzer',
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

describe('GET /health', () => {
  let app: express.Express;
  let deps: HealthDeps;

  beforeEach(() => {
    deps = {
      getStatuses: () => [],
      startTime: new Date(Date.now() - 60_000), // started 60 seconds ago
      version: '0.1.0',
    };
    app = express();
    app.use('/health', createHealthRouter(deps));
  });

  it('returns 200 with status "ok" when all analyzers connected', async () => {
    deps.getStatuses = () => [
      mockStatus({ id: 'a', connected: true }),
      mockStatus({ id: 'b', connected: true }),
    ];

    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.analyzers.total).toBe(2);
    expect(res.body.analyzers.connected).toBe(2);
    expect(res.body.analyzers.disconnected).toBe(0);
  });

  it('returns "degraded" when some analyzers are disconnected', async () => {
    deps.getStatuses = () => [
      mockStatus({ id: 'a', connected: true }),
      mockStatus({ id: 'b', connected: false }),
    ];

    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('degraded');
    expect(res.body.analyzers.connected).toBe(1);
    expect(res.body.analyzers.disconnected).toBe(1);
  });

  it('returns "error" when ALL analyzers are disconnected', async () => {
    deps.getStatuses = () => [
      mockStatus({ id: 'a', connected: false }),
      mockStatus({ id: 'b', connected: false }),
    ];

    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('error');
  });

  it('returns "ok" when no analyzers are configured', async () => {
    deps.getStatuses = () => [];

    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.analyzers.total).toBe(0);
  });

  it('includes version and timestamp', async () => {
    const res = await request(app).get('/health');

    expect(res.body.version).toBe('0.1.0');
    expect(res.body.timestamp).toBeDefined();
    // Timestamp should be a valid ISO string
    expect(new Date(res.body.timestamp).toISOString()).toBe(res.body.timestamp);
  });

  it('calculates uptime in seconds', async () => {
    // Started 60 seconds ago
    deps.startTime = new Date(Date.now() - 60_000);

    const res = await request(app).get('/health');

    // Allow a 2-second margin for test execution time
    expect(res.body.uptime).toBeGreaterThanOrEqual(59);
    expect(res.body.uptime).toBeLessThanOrEqual(62);
  });
});
