/**
 * Integration test — EMR-facing API endpoints.
 *
 * Tests the full flow that MediMind EMR will use:
 * 1. GET /results/:barcode — poll for results
 * 2. POST /messages/:id/retry — re-queue a failed message
 * 3. GET /health — check middleware status
 *
 * Uses a real server with real stores (in-memory DB + ResultStore).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createServer } from '../../src/api/server.js';
import { ResultStore } from '../../src/api/resultStore.js';
import { MessageLogger } from '../../src/logging/messageLogger.js';
import type { LabResult } from '../../src/types/result.js';
import type { AnalyzerStatus } from '../../src/types/analyzer.js';
import type express from 'express';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildLabResult(overrides: Partial<LabResult> = {}): LabResult {
  return {
    messageId: 'msg-001',
    analyzerId: 'sysmex-xn550',
    specimenBarcode: '10000001',
    patientId: 'P001',
    patientName: 'Test Patient',
    testDateTime: '2026-03-05T10:00:00Z',
    receivedAt: '2026-03-05T10:00:01Z',
    components: [
      {
        testCode: 'WBC',
        testName: 'White Blood Cell Count',
        value: '7.5',
        unit: 'x10^3/uL',
        referenceRange: '4.5-11.0',
        flag: 'N',
        status: 'final',
      },
      {
        testCode: 'RBC',
        testName: 'Red Blood Cell Count',
        value: '4.8',
        unit: '10^6/uL',
        referenceRange: '4.5-5.5',
        flag: 'N',
        status: 'final',
      },
      {
        testCode: 'HGB',
        testName: 'Hemoglobin',
        value: '14.2',
        unit: 'g/dL',
        referenceRange: '12.0-17.5',
        flag: 'N',
        status: 'final',
      },
    ],
    rawMessage: 'H|\\^&||SysmexXN\nP|1||P001\nO|1|10000001\nR|1|WBC|7.5|...',
    processingStatus: 'sent',
    ...overrides,
  };
}

function mockStatus(overrides: Partial<AnalyzerStatus> = {}): AnalyzerStatus {
  return {
    id: 'sysmex-xn550',
    name: 'Sysmex XN-550',
    protocol: 'astm',
    connected: true,
    lastMessageTime: '2026-03-05T10:00:00Z',
    lastErrorTime: null,
    lastError: null,
    messagesReceived: 42,
    errorsCount: 0,
    upSince: '2026-03-05T08:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('EMR Integration API', () => {
  let app: express.Express;
  let resultStore: ResultStore;
  let messageLogger: MessageLogger;

  beforeEach(() => {
    resultStore = new ResultStore();
    messageLogger = new MessageLogger(':memory:');

    app = createServer({
      health: {
        getStatuses: () => [mockStatus(), mockStatus({ id: 'roche-c111', name: 'Cobas c111', connected: false })],
        startTime: new Date('2026-03-05T08:00:00Z'),
        version: '0.1.0',
      },
      status: {
        getStatuses: () => [mockStatus()],
      },
      messages: {
        logger: messageLogger,
        retryQueue: {
          enqueueRaw: (_msgId: string, _analyzerId: string, _payload: string) => 1,
        },
      },
      results: {
        resultStore,
      },
    });
  });

  afterEach(() => {
    messageLogger.close();
  });

  // -------------------------------------------------------------------------
  // GET /results/:barcode
  // -------------------------------------------------------------------------

  describe('GET /results/:barcode', () => {
    it('returns 204 when no results exist', async () => {
      const res = await request(app).get('/results/99999999');
      expect(res.status).toBe(204);
    });

    it('returns result payload matching EMR WebLabResultPayload shape', async () => {
      resultStore.add(buildLabResult());

      const res = await request(app).get('/results/10000001');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        barcode: '10000001',
        isComplete: true,
        instrumentName: 'sysmex-xn550',
        resultTimestamp: '2026-03-05T10:00:00Z',
        instrumentFlags: [],
      });

      // Verify components shape matches WebLabComponentResult
      expect(res.body.components).toHaveLength(3);
      const wbc = res.body.components[0];
      expect(wbc).toMatchObject({
        componentCode: 'WBC',
        value: 7.5, // numeric values converted to number
        unit: 'x10^3/uL',
        referenceRange: { low: 4.5, high: 11.0 },
        flag: 'N',
      });
    });

    it('merges results from multiple analyzer runs for same barcode', async () => {
      // CBC from Sysmex
      resultStore.add(buildLabResult());
      // Glucose from Roche
      resultStore.add(buildLabResult({
        messageId: 'msg-002',
        analyzerId: 'roche-c111',
        components: [{
          testCode: 'GLU',
          testName: 'Glucose',
          value: '95',
          unit: 'mg/dL',
          referenceRange: '70-100',
          flag: 'N',
          status: 'final',
        }],
      }));

      const res = await request(app).get('/results/10000001');

      expect(res.status).toBe(200);
      // 3 from CBC + 1 from chemistry = 4
      expect(res.body.components).toHaveLength(4);
    });
  });

  // -------------------------------------------------------------------------
  // GET /health
  // -------------------------------------------------------------------------

  describe('GET /health', () => {
    it('returns degraded status when some analyzers are disconnected', async () => {
      const res = await request(app).get('/health');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('degraded');
      expect(res.body.analyzers.total).toBe(2);
      expect(res.body.analyzers.connected).toBe(1);
      expect(res.body.version).toBe('0.1.0');
    });
  });

  // -------------------------------------------------------------------------
  // POST /messages/:id/retry
  // -------------------------------------------------------------------------

  describe('POST /messages/:id/retry', () => {
    it('re-queues a failed message', async () => {
      const id = messageLogger.logMessage({
        timestamp: '2026-03-05T10:00:00Z',
        analyzerId: 'sysmex-xn550',
        analyzerName: 'Sysmex XN-550',
        direction: 'inbound',
        protocol: 'astm',
        rawContent: 'H|\\^&||SysmexXN',
        parsedSummary: 'CBC result: WBC=7.5',
        fhirResourceIds: [],
        status: 'send-error',
        errorMessage: 'Medplum timeout',
      });

      const res = await request(app).post(`/messages/${id}/retry`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('rejects retry of successful messages', async () => {
      const id = messageLogger.logMessage({
        timestamp: '2026-03-05T10:00:00Z',
        analyzerId: 'sysmex-xn550',
        analyzerName: 'Sysmex XN-550',
        direction: 'inbound',
        protocol: 'astm',
        rawContent: 'data',
        parsedSummary: '',
        fhirResourceIds: [],
        status: 'success',
      });

      const res = await request(app).post(`/messages/${id}/retry`);

      expect(res.status).toBe(409);
    });
  });

  // -------------------------------------------------------------------------
  // Full flow simulation
  // -------------------------------------------------------------------------

  describe('Full EMR polling flow', () => {
    it('simulates the complete EMR interaction cycle', async () => {
      // Step 1: EMR checks health
      const healthRes = await request(app).get('/health');
      expect(healthRes.body.status).toBe('degraded');

      // Step 2: EMR polls for results — nothing yet
      const emptyRes = await request(app).get('/results/10000001');
      expect(emptyRes.status).toBe(204);

      // Step 3: Analyzer sends results → pipeline stores them
      resultStore.add(buildLabResult());

      // Step 4: EMR polls again — results are ready!
      const resultRes = await request(app).get('/results/10000001');
      expect(resultRes.status).toBe(200);
      expect(resultRes.body.barcode).toBe('10000001');
      expect(resultRes.body.components).toHaveLength(3);

      // Step 5: EMR checks message log
      const msgRes = await request(app).get('/messages');
      expect(msgRes.status).toBe(200);
    });
  });
});
