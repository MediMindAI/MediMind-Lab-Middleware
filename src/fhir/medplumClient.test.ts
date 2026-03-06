/**
 * Tests for medplumClient — the thin wrapper around @medplum/core.
 *
 * Covers:
 * - createMedplumClient(): initialization and authentication
 * - findByBarcode(): barcode lookup success, not found, no patient ref, no specimen
 * - executeFHIRBundle(): builds and sends transaction bundles
 *
 * All tests use a mock MedplumClient — no real API calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMedplumClient, findByBarcode, executeFHIRBundle } from './medplumClient.js';
import type { MedplumConfig, BarcodeMatch } from './types.js';
import type { Bundle, ServiceRequest, Specimen, Observation } from '@medplum/fhirtypes';

// ---------------------------------------------------------------------------
// Mock MedplumClient — vi.mock replaces the real @medplum/core import
// ---------------------------------------------------------------------------

const mockStartClientLogin = vi.fn().mockResolvedValue(undefined);
const mockSearchOne = vi.fn();
const mockSearchResources = vi.fn();
const mockExecuteBatch = vi.fn();

vi.mock('@medplum/core', () => ({
  MedplumClient: vi.fn().mockImplementation(() => ({
    startClientLogin: mockStartClientLogin,
    searchOne: mockSearchOne,
    searchResources: mockSearchResources,
    executeBatch: mockExecuteBatch,
  })),
}));

const testConfig: MedplumConfig = {
  baseUrl: 'https://api.medplum.com',
  projectId: 'test-project',
  clientId: 'test-client-id',
  clientSecret: 'test-secret',
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// createMedplumClient()
// ---------------------------------------------------------------------------

describe('createMedplumClient()', () => {
  it('creates a client and authenticates with client credentials', async () => {
    const client = await createMedplumClient(testConfig);

    expect(client).toBeDefined();
    expect(mockStartClientLogin).toHaveBeenCalledWith('test-client-id', 'test-secret');
  });

  it('propagates auth errors', async () => {
    mockStartClientLogin.mockRejectedValueOnce(new Error('Invalid credentials'));

    await expect(createMedplumClient(testConfig)).rejects.toThrow('Invalid credentials');
  });
});

// ---------------------------------------------------------------------------
// findByBarcode()
// ---------------------------------------------------------------------------

describe('findByBarcode()', () => {
  const mockClient = {
    searchOne: mockSearchOne,
    searchResources: mockSearchResources,
  } as any;

  it('returns a full match when Specimen and ServiceRequest both exist', async () => {
    const mockSR: Partial<ServiceRequest> = {
      id: 'sr-123',
      resourceType: 'ServiceRequest',
      subject: { reference: 'Patient/pat-456' },
    };
    const mockSpecimen: Partial<Specimen> = {
      id: 'spec-789',
      resourceType: 'Specimen',
    };

    mockSearchOne.mockResolvedValueOnce(mockSR);
    mockSearchResources.mockResolvedValueOnce([mockSpecimen]);

    const result = await findByBarcode(mockClient, '14829365');

    expect(result).toEqual<BarcodeMatch>({
      specimenId: 'spec-789',
      specimenReference: 'Specimen/spec-789',
      serviceRequestId: 'sr-123',
      serviceRequestReference: 'ServiceRequest/sr-123',
      patientReference: 'Patient/pat-456',
      barcode: '14829365',
    });

    // Verify the correct search params were used
    expect(mockSearchOne).toHaveBeenCalledWith('ServiceRequest', {
      identifier: 'http://medimind.ge/fhir/identifier/lab-barcode|14829365',
    });
  });

  it('returns null when no ServiceRequest matches the barcode', async () => {
    mockSearchOne.mockResolvedValueOnce(undefined);

    const result = await findByBarcode(mockClient, '99999999');

    expect(result).toBeNull();
  });

  it('returns null when ServiceRequest has no patient reference', async () => {
    const mockSR: Partial<ServiceRequest> = {
      id: 'sr-no-patient',
      resourceType: 'ServiceRequest',
      subject: {}, // no reference
    };
    mockSearchOne.mockResolvedValueOnce(mockSR);

    const result = await findByBarcode(mockClient, '11111111');

    expect(result).toBeNull();
  });

  it('returns match with empty specimen fields when Specimen not found', async () => {
    const mockSR: Partial<ServiceRequest> = {
      id: 'sr-456',
      resourceType: 'ServiceRequest',
      subject: { reference: 'Patient/pat-789' },
    };
    mockSearchOne.mockResolvedValueOnce(mockSR);
    mockSearchResources.mockResolvedValueOnce([]); // no specimens

    const result = await findByBarcode(mockClient, '22222222');

    expect(result).not.toBeNull();
    expect(result!.specimenId).toBe('');
    expect(result!.specimenReference).toBe('');
    expect(result!.serviceRequestId).toBe('sr-456');
    expect(result!.patientReference).toBe('Patient/pat-789');
  });

  it('handles specimen search errors gracefully (returns match without specimen)', async () => {
    const mockSR: Partial<ServiceRequest> = {
      id: 'sr-err',
      resourceType: 'ServiceRequest',
      subject: { reference: 'Patient/pat-err' },
    };
    mockSearchOne.mockResolvedValueOnce(mockSR);
    mockSearchResources.mockRejectedValueOnce(new Error('Network timeout'));

    const result = await findByBarcode(mockClient, '33333333');

    expect(result).not.toBeNull();
    expect(result!.specimenId).toBe('');
    expect(result!.serviceRequestId).toBe('sr-err');
  });

  it('returns empty specimenId when Specimen search returns empty array', async () => {
    const mockSR: Partial<ServiceRequest> = {
      id: 'sr-empty-spec',
      resourceType: 'ServiceRequest',
      subject: { reference: 'Patient/pat-empty' },
    };
    mockSearchOne.mockResolvedValueOnce(mockSR);
    mockSearchResources.mockResolvedValueOnce([]);

    const result = await findByBarcode(mockClient, '44444444');
    expect(result).not.toBeNull();
    expect(result!.specimenId).toBe('');
    expect(result!.specimenReference).toBe('');
  });

  it('returns empty specimenId when Specimen has no id field', async () => {
    const mockSR: Partial<ServiceRequest> = {
      id: 'sr-noid',
      resourceType: 'ServiceRequest',
      subject: { reference: 'Patient/pat-noid' },
    };
    const mockSpecNoId: Partial<Specimen> = {
      resourceType: 'Specimen',
      // id is undefined
    };
    mockSearchOne.mockResolvedValueOnce(mockSR);
    mockSearchResources.mockResolvedValueOnce([mockSpecNoId]);

    const result = await findByBarcode(mockClient, '55555555');
    expect(result).not.toBeNull();
    expect(result!.specimenId).toBe('');
    expect(result!.specimenReference).toBe('');
  });

  it('continues without specimen when Specimen search throws', async () => {
    const mockSR: Partial<ServiceRequest> = {
      id: 'sr-throw',
      resourceType: 'ServiceRequest',
      subject: { reference: 'Patient/pat-throw' },
    };
    mockSearchOne.mockResolvedValueOnce(mockSR);
    mockSearchResources.mockRejectedValueOnce(new Error('Timeout'));

    const result = await findByBarcode(mockClient, '66666666');
    expect(result).not.toBeNull();
    expect(result!.specimenId).toBe('');
    expect(result!.serviceRequestId).toBe('sr-throw');
  });
});

// ---------------------------------------------------------------------------
// executeFHIRBundle()
// ---------------------------------------------------------------------------

describe('executeFHIRBundle()', () => {
  const mockClient = { executeBatch: mockExecuteBatch } as any;

  it('builds a transaction bundle from resources and sends it', async () => {
    const mockResponse: Bundle = {
      resourceType: 'Bundle',
      type: 'transaction-response',
      entry: [
        { response: { status: '201 Created', location: 'Observation/obs-1/_history/1' } },
      ],
    };
    mockExecuteBatch.mockResolvedValueOnce(mockResponse);

    const observation: Partial<Observation> = {
      resourceType: 'Observation',
      id: 'test-uuid-123',
      status: 'preliminary',
    };

    const result = await executeFHIRBundle(mockClient, [observation as Observation]);

    expect(result.type).toBe('transaction-response');

    // Verify the bundle structure sent to executeBatch
    const sentBundle = mockExecuteBatch.mock.calls[0][0] as Bundle;
    expect(sentBundle.type).toBe('transaction');
    expect(sentBundle.entry).toHaveLength(1);
    expect(sentBundle.entry![0].request?.method).toBe('POST');
    expect(sentBundle.entry![0].request?.url).toBe('Observation');
    expect(sentBundle.entry![0].resource).toEqual(observation);
  });

  it('includes fullUrl matching urn:uuid:<resource.id> on each entry', async () => {
    mockExecuteBatch.mockResolvedValueOnce({
      resourceType: 'Bundle',
      type: 'transaction-response',
      entry: [
        { response: { status: '201 Created' } },
        { response: { status: '201 Created' } },
      ],
    });

    const obs1 = { resourceType: 'Observation' as const, id: 'uuid-aaa', status: 'preliminary' as const, code: { text: 'test' } };
    const obs2 = { resourceType: 'Observation' as const, id: 'uuid-bbb', status: 'preliminary' as const, code: { text: 'test' } };

    await executeFHIRBundle(mockClient, [obs1, obs2]);

    const sentBundle = mockExecuteBatch.mock.calls[0][0] as Bundle;
    expect(sentBundle.entry![0].fullUrl).toBe('urn:uuid:uuid-aaa');
    expect(sentBundle.entry![1].fullUrl).toBe('urn:uuid:uuid-bbb');
  });

  it('omits fullUrl when resource has no id', async () => {
    mockExecuteBatch.mockResolvedValueOnce({
      resourceType: 'Bundle',
      type: 'transaction-response',
      entry: [{ response: { status: '201 Created' } }],
    });

    const obs = { resourceType: 'Observation' as const, status: 'preliminary' as const, code: { text: 'test' } };

    await executeFHIRBundle(mockClient, [obs]);

    const sentBundle = mockExecuteBatch.mock.calls[0][0] as Bundle;
    expect(sentBundle.entry![0].fullUrl).toBeUndefined();
  });

  it('handles multiple resources in one bundle', async () => {
    const mockResponse: Bundle = {
      resourceType: 'Bundle',
      type: 'transaction-response',
      entry: [
        { response: { status: '201 Created' } },
        { response: { status: '201 Created' } },
      ],
    };
    mockExecuteBatch.mockResolvedValueOnce(mockResponse);

    const obs1 = { resourceType: 'Observation' as const, status: 'preliminary' as const, code: { text: 'test' } };
    const obs2 = { resourceType: 'Observation' as const, status: 'preliminary' as const, code: { text: 'test' } };

    const result = await executeFHIRBundle(mockClient, [obs1, obs2]);

    expect(result.entry).toHaveLength(2);
    const sentBundle = mockExecuteBatch.mock.calls[0][0] as Bundle;
    expect(sentBundle.entry).toHaveLength(2);
  });

  it('propagates Medplum errors', async () => {
    mockExecuteBatch.mockRejectedValueOnce(new Error('Server unavailable'));

    const obs = { resourceType: 'Observation' as const, status: 'preliminary' as const, code: { text: 'test' } };

    await expect(executeFHIRBundle(mockClient, [obs])).rejects.toThrow('Server unavailable');
  });
});
