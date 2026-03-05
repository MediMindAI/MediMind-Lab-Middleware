/**
 * Tests for ResultStore — the in-memory pickup window for lab results.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ResultStore } from './resultStore.js';
import type { LabResult } from '../types/result.js';

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
    ],
    rawMessage: 'H|\\^&||SysmexXN',
    processingStatus: 'sent',
    ...overrides,
  };
}

describe('ResultStore', () => {
  let store: ResultStore;

  beforeEach(() => {
    store = new ResultStore();
  });

  it('stores and retrieves a result by barcode', () => {
    store.add(buildResult());
    const results = store.get('12345678');
    expect(results).toHaveLength(1);
    expect(results![0].specimenBarcode).toBe('12345678');
  });

  it('returns null for unknown barcode', () => {
    expect(store.get('unknown')).toBeNull();
  });

  it('accumulates multiple results for the same barcode', () => {
    store.add(buildResult({ messageId: 'msg-1' }));
    store.add(buildResult({ messageId: 'msg-2' }));
    expect(store.get('12345678')).toHaveLength(2);
  });

  it('stores results for different barcodes separately', () => {
    store.add(buildResult({ specimenBarcode: 'AAA' }));
    store.add(buildResult({ specimenBarcode: 'BBB' }));
    expect(store.get('AAA')).toHaveLength(1);
    expect(store.get('BBB')).toHaveLength(1);
    expect(store.size).toBe(2);
  });

  it('ignores results with empty barcode', () => {
    store.add(buildResult({ specimenBarcode: '' }));
    expect(store.size).toBe(0);
  });

  it('has() returns true/false correctly', () => {
    expect(store.has('12345678')).toBe(false);
    store.add(buildResult());
    expect(store.has('12345678')).toBe(true);
  });

  it('remove() deletes results for a barcode', () => {
    store.add(buildResult());
    store.remove('12345678');
    expect(store.get('12345678')).toBeNull();
    expect(store.size).toBe(0);
  });
});
