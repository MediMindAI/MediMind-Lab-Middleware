/**
 * Tests for GET /status — the analyzer connection status endpoint.
 *
 * Verifies that the endpoint returns the correct list of analyzer
 * statuses with all fields (connected, message counts, errors, etc).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createStatusRouter, type StatusDeps } from './status.js';
import type { AnalyzerStatus } from '../../types/analyzer.js';

/** Build a full AnalyzerStatus object for testing */
function mockStatus(overrides: Partial<AnalyzerStatus> = {}): AnalyzerStatus {
  return {
    id: 'test-analyzer',
    name: 'Test Analyzer',
    protocol: 'astm',
    connected: true,
    lastMessageTime: '2026-03-05T10:00:00.000Z',
    lastErrorTime: null,
    lastError: null,
    messagesReceived: 42,
    errorsCount: 0,
    upSince: '2026-03-05T08:00:00.000Z',
    ...overrides,
  };
}

describe('GET /status', () => {
  let app: express.Express;
  let deps: StatusDeps;

  beforeEach(() => {
    deps = {
      getStatuses: () => [],
    };
    app = express();
    app.use('/status', createStatusRouter(deps));
  });

  it('returns 200 with empty analyzers array when none configured', async () => {
    const res = await request(app).get('/status');

    expect(res.status).toBe(200);
    expect(res.body.analyzers).toEqual([]);
  });

  it('returns all analyzer statuses', async () => {
    deps.getStatuses = () => [
      mockStatus({ id: 'sysmex', name: 'Sysmex XN-550', connected: true }),
      mockStatus({ id: 'roche', name: 'Roche Cobas c111', connected: false }),
    ];

    const res = await request(app).get('/status');

    expect(res.status).toBe(200);
    expect(res.body.analyzers).toHaveLength(2);
    expect(res.body.analyzers[0].id).toBe('sysmex');
    expect(res.body.analyzers[0].connected).toBe(true);
    expect(res.body.analyzers[1].id).toBe('roche');
    expect(res.body.analyzers[1].connected).toBe(false);
  });

  it('includes all AnalyzerStatus fields', async () => {
    deps.getStatuses = () => [
      mockStatus({
        id: 'sysmex-xn550',
        name: 'Sysmex XN-550',
        protocol: 'astm',
        connected: true,
        lastMessageTime: '2026-03-05T10:29:50.000Z',
        lastErrorTime: null,
        lastError: null,
        messagesReceived: 142,
        errorsCount: 0,
        upSince: '2026-03-04T08:00:00.000Z',
      }),
    ];

    const res = await request(app).get('/status');

    const analyzer = res.body.analyzers[0];
    expect(analyzer.id).toBe('sysmex-xn550');
    expect(analyzer.name).toBe('Sysmex XN-550');
    expect(analyzer.protocol).toBe('astm');
    expect(analyzer.connected).toBe(true);
    expect(analyzer.lastMessageTime).toBe('2026-03-05T10:29:50.000Z');
    expect(analyzer.lastErrorTime).toBeNull();
    expect(analyzer.lastError).toBeNull();
    expect(analyzer.messagesReceived).toBe(142);
    expect(analyzer.errorsCount).toBe(0);
    expect(analyzer.upSince).toBe('2026-03-04T08:00:00.000Z');
  });

  it('returns JSON content type', async () => {
    const res = await request(app).get('/status');

    expect(res.headers['content-type']).toMatch(/application\/json/);
  });
});
