/**
 * Tests for resultSender — the orchestrator that sends LabResults to Medplum.
 *
 * Covers:
 * - Happy path: finds specimen, maps to FHIR, sends bundle, returns success
 * - Barcode not found: returns error (not thrown)
 * - Empty barcode: returns error immediately
 * - Medplum unreachable: returns error (not thrown)
 * - FHIR mapper throws: returns error (not thrown)
 * - FHIR mapper returns empty array: returns error
 * - Extracts resource IDs from response
 *
 * Uses vi.mock to replace medplumClient module functions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendLabResult } from './resultSender.js';
import type { MapToFHIRFn } from './resultSender.js';
import type { LabResult } from '../types/result.js';
import type { BarcodeMatch } from './types.js';
import type { Bundle, Observation, DiagnosticReport } from '@medplum/fhirtypes';

// ---------------------------------------------------------------------------
// Mock medplumClient module
// ---------------------------------------------------------------------------

const mockFindByBarcode = vi.fn();
const mockExecuteFHIRBundle = vi.fn();

vi.mock('./medplumClient.js', () => ({
  findByBarcode: (...args: unknown[]) => mockFindByBarcode(...args),
  executeFHIRBundle: (...args: unknown[]) => mockExecuteFHIRBundle(...args),
}));

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function buildLabResult(overrides: Partial<LabResult> = {}): LabResult {
  return {
    messageId: 'MSG-001',
    analyzerId: 'sysmex-xn550',
    specimenBarcode: '14829365',
    patientId: '',
    patientName: '',
    testDateTime: '2026-03-05T10:30:00+04:00',
    receivedAt: '2026-03-05T10:30:05+04:00',
    components: [
      {
        testCode: 'WBC',
        testName: 'White Blood Cell Count',
        value: '7.5',
        unit: '10*3/uL',
        referenceRange: '4.5-11.0',
        flag: 'N',
        status: 'final',
      },
    ],
    rawMessage: 'H|\\^&||...',
    processingStatus: 'parsed',
    ...overrides,
  };
}

const sampleMatch: BarcodeMatch = {
  specimenId: 'spec-789',
  specimenReference: 'Specimen/spec-789',
  serviceRequestId: 'sr-123',
  serviceRequestReference: 'ServiceRequest/sr-123',
  patientReference: 'Patient/pat-456',
  barcode: '14829365',
};

/** A mock FHIR mapper that returns one Observation and one DiagnosticReport */
const mockMapToFHIR: MapToFHIRFn = vi.fn().mockImplementation(() => {
  const obs: Partial<Observation> = {
    resourceType: 'Observation',
    status: 'preliminary',
  };
  const report: Partial<DiagnosticReport> = {
    resourceType: 'DiagnosticReport',
    status: 'preliminary',
  };
  return [obs, report];
});

const mockSearchOne = vi.fn();
const mockClient = { searchOne: mockSearchOne } as any;

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('sendLabResult()', () => {
  it('sends successfully when specimen found and bundle accepted', async () => {
    mockSearchOne.mockResolvedValueOnce(undefined); // idempotency check — not found
    mockFindByBarcode.mockResolvedValueOnce(sampleMatch);
    mockExecuteFHIRBundle.mockResolvedValueOnce({
      resourceType: 'Bundle',
      type: 'transaction-response',
      entry: [
        { response: { status: '201 Created', location: 'Observation/obs-1/_history/1' } },
        { response: { status: '201 Created', location: 'DiagnosticReport/dr-1/_history/1' } },
      ],
    } as Bundle);

    const result = await sendLabResult(mockClient, buildLabResult(), mockMapToFHIR);

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.resourceIds).toEqual(['Observation/obs-1', 'DiagnosticReport/dr-1']);
  });

  it('returns error when barcode is empty', async () => {
    const labResult = buildLabResult({ specimenBarcode: '' });

    const result = await sendLabResult(mockClient, labResult, mockMapToFHIR);

    expect(result.success).toBe(false);
    expect(result.error).toContain('no specimen barcode');
    expect(mockFindByBarcode).not.toHaveBeenCalled();
  });

  it('returns error when specimen not found for barcode', async () => {
    mockSearchOne.mockResolvedValueOnce(undefined); // idempotency check — not found
    mockFindByBarcode.mockResolvedValueOnce(null);

    const result = await sendLabResult(mockClient, buildLabResult(), mockMapToFHIR);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Specimen not found for barcode: 14829365');
  });

  it('returns error when barcode lookup throws (network error)', async () => {
    mockSearchOne.mockResolvedValueOnce(undefined); // idempotency check — not found
    mockFindByBarcode.mockRejectedValueOnce(new Error('Connection refused'));

    const result = await sendLabResult(mockClient, buildLabResult(), mockMapToFHIR);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Barcode lookup failed');
    expect(result.error).toContain('Connection refused');
  });

  it('returns error when FHIR mapper throws', async () => {
    mockSearchOne.mockResolvedValueOnce(undefined); // idempotency check — not found
    mockFindByBarcode.mockResolvedValueOnce(sampleMatch);
    (mockMapToFHIR as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new Error('Unknown test code: XYZ');
    });

    const result = await sendLabResult(mockClient, buildLabResult(), mockMapToFHIR);

    expect(result.success).toBe(false);
    expect(result.error).toContain('FHIR mapping failed');
    expect(result.error).toContain('Unknown test code: XYZ');
  });

  it('returns error when FHIR mapper returns empty array', async () => {
    mockSearchOne.mockResolvedValueOnce(undefined); // idempotency check — not found
    mockFindByBarcode.mockResolvedValueOnce(sampleMatch);
    (mockMapToFHIR as ReturnType<typeof vi.fn>).mockReturnValueOnce([]);

    const result = await sendLabResult(mockClient, buildLabResult(), mockMapToFHIR);

    expect(result.success).toBe(false);
    expect(result.error).toContain('returned no resources');
  });

  it('returns error when Medplum transaction fails', async () => {
    mockSearchOne.mockResolvedValueOnce(undefined); // idempotency check — not found
    mockFindByBarcode.mockResolvedValueOnce(sampleMatch);
    mockExecuteFHIRBundle.mockRejectedValueOnce(new Error('Server 503'));

    const result = await sendLabResult(mockClient, buildLabResult(), mockMapToFHIR);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Medplum transaction failed');
    expect(result.error).toContain('Server 503');
  });

  it('passes the correct arguments to mapToFHIR', async () => {
    mockSearchOne.mockResolvedValueOnce(undefined); // idempotency check — not found
    mockFindByBarcode.mockResolvedValueOnce(sampleMatch);
    mockExecuteFHIRBundle.mockResolvedValueOnce({
      resourceType: 'Bundle',
      type: 'transaction-response',
      entry: [],
    });

    const labResult = buildLabResult();
    await sendLabResult(mockClient, labResult, mockMapToFHIR);

    expect(mockMapToFHIR).toHaveBeenCalledWith(labResult, sampleMatch);
  });

  it('passes the FHIR mapper output to executeFHIRBundle', async () => {
    mockSearchOne.mockResolvedValueOnce(undefined); // idempotency check — not found
    const fakeObs = { resourceType: 'Observation' as const, status: 'preliminary' as const };
    (mockMapToFHIR as ReturnType<typeof vi.fn>).mockReturnValueOnce([fakeObs]);
    mockFindByBarcode.mockResolvedValueOnce(sampleMatch);
    mockExecuteFHIRBundle.mockResolvedValueOnce({
      resourceType: 'Bundle',
      type: 'transaction-response',
      entry: [{ response: { status: '201 Created', location: 'Observation/obs-x/_history/1' } }],
    });

    await sendLabResult(mockClient, buildLabResult(), mockMapToFHIR);

    expect(mockExecuteFHIRBundle).toHaveBeenCalledWith(mockClient, [fakeObs]);
  });

  it('handles response entries without location (still succeeds)', async () => {
    mockSearchOne.mockResolvedValueOnce(undefined); // idempotency check — not found
    mockFindByBarcode.mockResolvedValueOnce(sampleMatch);
    mockExecuteFHIRBundle.mockResolvedValueOnce({
      resourceType: 'Bundle',
      type: 'transaction-response',
      entry: [{ response: { status: '201 Created' } }], // no location
    });

    const result = await sendLabResult(mockClient, buildLabResult(), mockMapToFHIR);

    expect(result.success).toBe(true);
    expect(result.resourceIds).toEqual([]);
  });

  it('handles non-Error throw in barcode lookup', async () => {
    mockSearchOne.mockResolvedValueOnce(undefined); // idempotency check — not found
    mockFindByBarcode.mockRejectedValueOnce('string error');

    const result = await sendLabResult(mockClient, buildLabResult(), mockMapToFHIR);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Barcode lookup failed');
    expect(result.error).toContain('string error');
  });

  it('handles non-Error throw in FHIR mapper', async () => {
    mockSearchOne.mockResolvedValueOnce(undefined); // idempotency check — not found
    mockFindByBarcode.mockResolvedValueOnce(sampleMatch);
    (mockMapToFHIR as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw 'mapper string throw';
    });

    const result = await sendLabResult(mockClient, buildLabResult(), mockMapToFHIR);

    expect(result.success).toBe(false);
    expect(result.error).toContain('FHIR mapping failed');
    expect(result.error).toContain('mapper string throw');
  });

  it('handles non-Error throw in Medplum transaction', async () => {
    mockSearchOne.mockResolvedValueOnce(undefined); // idempotency check — not found
    mockFindByBarcode.mockResolvedValueOnce(sampleMatch);
    mockExecuteFHIRBundle.mockRejectedValueOnce('transaction string throw');

    const result = await sendLabResult(mockClient, buildLabResult(), mockMapToFHIR);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Medplum transaction failed');
    expect(result.error).toContain('transaction string throw');
  });

  it('handles response location with less than 2 parts', async () => {
    mockSearchOne.mockResolvedValueOnce(undefined); // idempotency check — not found
    mockFindByBarcode.mockResolvedValueOnce(sampleMatch);
    mockExecuteFHIRBundle.mockResolvedValueOnce({
      resourceType: 'Bundle',
      type: 'transaction-response',
      entry: [
        { response: { status: '201 Created', location: 'JustOneSegment' } },
      ],
    });

    const result = await sendLabResult(mockClient, buildLabResult(), mockMapToFHIR);

    expect(result.success).toBe(true);
    expect(result.resourceIds).toEqual([]);
  });

  // ─── Idempotency protection (Task 3.5) ─────────────────────────

  it('skips creation when DiagnosticReport with same messageId already exists', async () => {
    mockSearchOne.mockResolvedValueOnce({ resourceType: 'DiagnosticReport', id: 'existing-dr' });

    const result = await sendLabResult(mockClient, buildLabResult(), mockMapToFHIR);

    expect(result.success).toBe(true);
    expect(result.skipped).toBe(true);
    expect(mockFindByBarcode).not.toHaveBeenCalled();
    expect(mockExecuteFHIRBundle).not.toHaveBeenCalled();
  });

  it('proceeds normally when no existing DiagnosticReport found', async () => {
    mockSearchOne.mockResolvedValueOnce(undefined);
    mockFindByBarcode.mockResolvedValueOnce(sampleMatch);
    mockExecuteFHIRBundle.mockResolvedValueOnce({
      resourceType: 'Bundle',
      type: 'transaction-response',
      entry: [
        { response: { status: '201 Created', location: 'Observation/obs-1/_history/1' } },
      ],
    });

    const result = await sendLabResult(mockClient, buildLabResult(), mockMapToFHIR);

    expect(result.success).toBe(true);
    expect(result.skipped).toBeUndefined();
    expect(mockSearchOne).toHaveBeenCalledWith('DiagnosticReport', {
      identifier: 'http://medimind.ge/fhir/identifier/lis-message-id|MSG-001',
    });
  });

  it('continues normally when idempotency check throws', async () => {
    mockSearchOne.mockRejectedValueOnce(new Error('Network error'));
    mockFindByBarcode.mockResolvedValueOnce(sampleMatch);
    mockExecuteFHIRBundle.mockResolvedValueOnce({
      resourceType: 'Bundle',
      type: 'transaction-response',
      entry: [],
    });

    const result = await sendLabResult(mockClient, buildLabResult(), mockMapToFHIR);

    expect(result.success).toBe(true);
  });

  it('skips idempotency check when messageId is empty', async () => {
    const labResult = buildLabResult({ messageId: '' });
    mockFindByBarcode.mockResolvedValueOnce(sampleMatch);
    mockExecuteFHIRBundle.mockResolvedValueOnce({
      resourceType: 'Bundle',
      type: 'transaction-response',
      entry: [],
    });

    await sendLabResult(mockClient, labResult, mockMapToFHIR);

    expect(mockSearchOne).not.toHaveBeenCalled();
  });
});
