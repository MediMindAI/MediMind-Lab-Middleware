/**
 * FHIR-related types for the middleware's Medplum interactions.
 *
 * When we send lab results to Medplum Cloud, we need to:
 * 1. Look up the patient's specimen by barcode
 * 2. Find the doctor's order (ServiceRequest) linked to that specimen
 * 3. Create Observation resources (one per test value)
 * 4. Create a DiagnosticReport grouping all observations
 *
 * These types track those lookups and creations.
 */

/** Result of looking up a specimen barcode in Medplum */
export interface BarcodeMatch {
  /** The FHIR Specimen resource ID */
  specimenId: string;
  /** Reference string (e.g., "Specimen/abc-123") */
  specimenReference: string;
  /** The FHIR ServiceRequest resource ID (doctor's order) */
  serviceRequestId: string;
  /** Reference string (e.g., "ServiceRequest/def-456") */
  serviceRequestReference: string;
  /** The patient reference (e.g., "Patient/ghi-789") */
  patientReference: string;
  /** The barcode that was matched */
  barcode: string;
}

/** Result of creating FHIR resources in Medplum */
export interface FHIRCreateResult {
  /** Whether the creation succeeded */
  success: boolean;
  /** Created Observation resource IDs */
  observationIds: string[];
  /** Created DiagnosticReport resource ID */
  diagnosticReportId: string | null;
  /** Error message if failed */
  error?: string;
  /** The barcode this result is for */
  barcode: string;
}

/** Medplum client configuration */
export interface MedplumConfig {
  /** Medplum API base URL (e.g., "https://api.medplum.com") */
  baseUrl: string;
  /** Medplum project ID */
  projectId: string;
  /** OAuth2 client ID for machine-to-machine auth */
  clientId: string;
  /** OAuth2 client secret */
  clientSecret: string;
}

/** FHIR LIS extension URLs -- matches the EMR's fhir-systems.ts */
export const LIS_EXTENSIONS = {
  TRANSMISSION_STATUS: 'http://medimind.ge/fhir/StructureDefinition/lis-transmission-status',
  TRANSMISSION_TIME: 'http://medimind.ge/fhir/StructureDefinition/lis-transmission-time',
  MESSAGE_ID: 'http://medimind.ge/fhir/StructureDefinition/lis-message-id',
  PROTOCOL: 'http://medimind.ge/fhir/StructureDefinition/lis-protocol',
  IMPORTED: 'http://medimind.ge/fhir/StructureDefinition/lis-imported',
  IMPORT_TIME: 'http://medimind.ge/fhir/StructureDefinition/lis-import-time',
  BARCODE: 'http://medimind.ge/fhir/StructureDefinition/lis-barcode',
} as const;

/** Possible transmission status values */
export type TransmissionStatus =
  | 'not-sent'
  | 'pending'
  | 'sent'
  | 'acknowledged'
  | 'completed'
  | 'error';
