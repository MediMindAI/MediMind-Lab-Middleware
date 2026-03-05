/**
 * Tests for GET /results/:barcode — the result lookup endpoint.
 *
 * Uses a real ResultStore (not mocks) so we test the full
 * route+store integration.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createResultsRouter } from './results.js';
import { ResultStore } from '../resultStore.js';
import type { LabResult } from '../../types/result.js';

function buildResult(overrides: Partial<LabResult> = {}): LabResult {
  return {
    messageId: 'msg-1',
    analyzerId: 'sysmex-xn550',
    specimenBarcode: '12345678',
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
    ],
    rawMessage: 'H|\\^&||SysmexXN',
    processingStatus: 'sent',
    ...overrides,
  };
}

describe('GET /results/:barcode', () => {
  let app: express.Express;
  let store: ResultStore;

  beforeEach(() => {
    store = new ResultStore();
    app = express();
    app.use('/results', createResultsRouter({ resultStore: store }));
  });

  it('returns 204 when no results exist for the barcode', async () => {
    const res = await request(app).get('/results/99999999');
    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
  });

  it('returns result payload for a known barcode', async () => {
    store.add(buildResult());

    const res = await request(app).get('/results/12345678');

    expect(res.status).toBe(200);
    expect(res.body.barcode).toBe('12345678');
    expect(res.body.isComplete).toBe(true);
    expect(res.body.components).toHaveLength(2);
    expect(res.body.instrumentName).toBe('sysmex-xn550');
    expect(res.body.resultTimestamp).toBe('2026-03-05T10:00:00Z');
  });

  it('converts numeric values to numbers', async () => {
    store.add(buildResult());

    const res = await request(app).get('/results/12345678');

    const wbc = res.body.components.find((c: { componentCode: string }) => c.componentCode === 'WBC');
    expect(wbc.value).toBe(7.5);
    expect(typeof wbc.value).toBe('number');
  });

  it('parses reference ranges into { low, high } objects', async () => {
    store.add(buildResult());

    const res = await request(app).get('/results/12345678');

    const wbc = res.body.components.find((c: { componentCode: string }) => c.componentCode === 'WBC');
    expect(wbc.referenceRange).toEqual({ low: 4.5, high: 11.0 });
  });

  it('keeps text values as strings', async () => {
    store.add(buildResult({
      components: [{
        testCode: 'COLOR',
        testName: 'Urine Color',
        value: 'Yellow',
        unit: '',
        referenceRange: '',
        flag: 'N',
        status: 'final',
      }],
    }));

    const res = await request(app).get('/results/12345678');
    expect(res.body.components[0].value).toBe('Yellow');
  });

  it('merges results from multiple analyzer runs', async () => {
    store.add(buildResult({ messageId: 'msg-1', analyzerId: 'sysmex-xn550' }));
    store.add(buildResult({
      messageId: 'msg-2',
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

    const res = await request(app).get('/results/12345678');

    // 2 from first result + 1 from second = 3
    expect(res.body.components).toHaveLength(3);
  });

  it('returns instrumentFlags as empty array', async () => {
    store.add(buildResult());
    const res = await request(app).get('/results/12345678');
    expect(res.body.instrumentFlags).toEqual([]);
  });
});
