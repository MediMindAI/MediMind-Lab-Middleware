/**
 * Result sender — orchestrates the full flow from LabResult to Medplum Cloud.
 *
 * When a lab result arrives from an analyzer, this module:
 * 1. Looks up the matching Specimen/ServiceRequest by barcode
 * 2. Calls the FHIR mapper to convert results to Observations + DiagnosticReport
 * 3. Sends everything to Medplum in one atomic transaction bundle
 *
 * Returns a SendResult — never throws. The caller decides whether to
 * queue failed results for retry or log them as unmatched.
 */

import type { MedplumClient } from '@medplum/core';
import type { Bundle, Resource } from '@medplum/fhirtypes';
import type { LabResult } from '../types/result.js';
import type { BarcodeMatch } from './types.js';
import { findByBarcode, executeFHIRBundle } from './medplumClient.js';

/** What sendLabResult returns — success or error, never throws */
export interface SendResult {
  success: boolean;
  error?: string;
  resourceIds?: string[];
}

/** Signature for the FHIR mapper function (injected, not imported directly) */
export type MapToFHIRFn = (
  labResult: LabResult,
  match: BarcodeMatch
) => Resource[];

/**
 * Send a lab result to Medplum Cloud.
 *
 * @param client - Authenticated MedplumClient
 * @param labResult - Parsed result from a protocol driver
 * @param mapToFHIR - Function that converts LabResult + BarcodeMatch into FHIR resources
 * @returns SendResult — check .success to know if it worked
 */
export async function sendLabResult(
  client: MedplumClient,
  labResult: LabResult,
  mapToFHIR: MapToFHIRFn
): Promise<SendResult> {
  // Validate barcode
  if (!labResult.specimenBarcode) {
    return { success: false, error: 'LabResult has no specimen barcode' };
  }

  // Step 1: Find Specimen + ServiceRequest by barcode
  let match: BarcodeMatch | null;
  try {
    match = await findByBarcode(client, labResult.specimenBarcode);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Barcode lookup failed: ${message}` };
  }

  if (!match) {
    return {
      success: false,
      error: `Specimen not found for barcode: ${labResult.specimenBarcode}`,
    };
  }

  // Step 2: Convert to FHIR resources
  let resources: Resource[];
  try {
    resources = mapToFHIR(labResult, match);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: `FHIR mapping failed: ${message}` };
  }

  if (resources.length === 0) {
    return { success: false, error: 'FHIR mapper returned no resources' };
  }

  // Step 3: Send via transaction bundle
  let response: Bundle;
  try {
    response = await executeFHIRBundle(client, resources);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Medplum transaction failed: ${message}` };
  }

  // Step 4: Extract created resource IDs from response
  const resourceIds = extractResourceIds(response);

  return { success: true, resourceIds };
}

/**
 * Extract resource IDs from a transaction response bundle.
 * Each entry's response.location looks like "Observation/abc-123/_history/1".
 */
function extractResourceIds(response: Bundle): string[] {
  const ids: string[] = [];
  for (const entry of response.entry ?? []) {
    const location = entry.response?.location;
    if (location) {
      // "Observation/abc-123/_history/1" → "Observation/abc-123"
      const parts = location.split('/');
      if (parts.length >= 2) {
        ids.push(`${parts[0]}/${parts[1]}`);
      }
    }
  }
  return ids;
}
