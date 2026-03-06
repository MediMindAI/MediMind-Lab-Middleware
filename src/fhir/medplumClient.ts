/**
 * Medplum client wrapper — provides the three operations this middleware needs:
 * 1. Create an authenticated MedplumClient
 * 2. Find a Specimen + ServiceRequest + Patient by specimen barcode
 * 3. Send a FHIR transaction bundle (atomic — all resources created or none)
 *
 * This is a thin wrapper, not a general-purpose FHIR client.
 * It only exposes what the result-sending pipeline needs.
 */

import { MedplumClient } from '@medplum/core';
import type { Bundle, Resource } from '@medplum/fhirtypes';
import type { MedplumConfig, BarcodeMatch } from './types.js';

/** Identifier system used for lab barcodes on ServiceRequests in MediMind EMR */
const LAB_BARCODE_SYSTEM = 'http://medimind.ge/fhir/identifier/lab-barcode';

/**
 * Create and authenticate a MedplumClient using client credentials.
 * This is a one-time setup — the client handles token refresh internally.
 */
export async function createMedplumClient(config: MedplumConfig): Promise<MedplumClient> {
  const client = new MedplumClient({ baseUrl: config.baseUrl });
  await client.startClientLogin(config.clientId, config.clientSecret);
  return client;
}

/**
 * Find a Specimen, ServiceRequest, and Patient by specimen barcode.
 *
 * Lookup strategy (matches research Decision 9):
 * 1. Search ServiceRequest by barcode identifier
 * 2. Extract patient reference from ServiceRequest.subject
 * 3. Search Specimen linked to that ServiceRequest
 * 4. Return all references, or null if barcode not found
 */
export async function findByBarcode(
  client: MedplumClient,
  barcode: string
): Promise<BarcodeMatch | null> {
  // Step 1: Find the ServiceRequest by barcode
  const serviceRequest = await client.searchOne('ServiceRequest', {
    identifier: `${LAB_BARCODE_SYSTEM}|${barcode}`,
  });

  if (!serviceRequest) {
    return null;
  }

  const patientReference = serviceRequest.subject?.reference;
  if (!patientReference) {
    return null;
  }

  // Step 2: Find the Specimen linked to this order
  let specimenId = '';
  let specimenReference = '';
  try {
    const specimens = await client.searchResources('Specimen', {
      request: `ServiceRequest/${serviceRequest.id}`,
      _count: '1',
    });
    if (specimens.length > 0) {
      specimenId = specimens[0].id ?? '';
      specimenReference = specimenId ? `Specimen/${specimenId}` : '';
    }
  } catch {
    // Specimen not found — continue without it
  }

  return {
    specimenId,
    specimenReference,
    serviceRequestId: serviceRequest.id ?? '',
    serviceRequestReference: `ServiceRequest/${serviceRequest.id}`,
    patientReference,
    barcode,
  };
}

/**
 * Create FHIR resources via a transaction bundle (atomic — all or nothing).
 * Each resource becomes a POST entry in the bundle.
 * Uses client.executeBatch() which sends to POST /fhir/R4.
 */
export async function executeFHIRBundle(
  client: MedplumClient,
  resources: Resource[]
): Promise<Bundle> {
  const bundle: Bundle = {
    resourceType: 'Bundle',
    type: 'transaction',
    entry: resources.map((resource) => ({
      fullUrl: resource.id ? `urn:uuid:${resource.id}` : undefined,
      resource,
      request: {
        method: 'POST' as const,
        url: resource.resourceType,
      },
    })),
  };

  return client.executeBatch(bundle);
}
