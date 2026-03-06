/**
 * Standard result types.
 * All protocol drivers convert their raw messages into these types.
 * Think of this as the "common language" inside the middleware —
 * regardless of whether a result came from ASTM, HL7v2, or Siemens LIS3,
 * it all gets converted to a LabResult before being sent to FHIR.
 */

/** A single test component result (e.g., "WBC = 7.5 x10^3/uL") */
export interface ComponentResult {
  /** Test code from the analyzer (e.g., "WBC", "RBC", "HGB") */
  testCode: string;
  /** Human-readable test name (e.g., "White Blood Cell Count") */
  testName: string;
  /** Result value — can be numeric or text */
  value: string;
  /** Unit of measurement (e.g., "x10^3/uL", "g/dL", "mg/dL") */
  unit: string;
  /** Reference range as string (e.g., "4.5-11.0") */
  referenceRange: string;
  /** Abnormal flag from the analyzer */
  flag: ResultFlag;
  /** Result status */
  status: 'preliminary' | 'final' | 'corrected';
  /** LOINC code from analyzer mapping (e.g., "6690-2") — optional */
  loincCode?: string;
}

/** Abnormal result flags */
export type ResultFlag =
  | 'N'   // Normal
  | 'L'   // Low
  | 'H'   // High
  | 'LL'  // Critically low
  | 'HH'  // Critically high
  | 'A'   // Abnormal (direction unknown)
  | ''    // No flag provided
  ;

/** A complete lab result from one analyzer run */
export interface LabResult {
  /** Unique message ID for tracking */
  messageId: string;
  /** Which analyzer sent this */
  analyzerId: string;
  /** Specimen barcode (links to MediMind's ServiceRequest/Specimen) */
  specimenBarcode: string;
  /** Patient ID from the analyzer (may be empty) */
  patientId: string;
  /** Patient name from the analyzer (may be empty) */
  patientName: string;
  /** When the test was performed */
  testDateTime: string;
  /** When the middleware received this result */
  receivedAt: string;
  /** Individual test results */
  components: ComponentResult[];
  /** Raw message content (for audit trail) */
  rawMessage: string;
  /** Processing status */
  processingStatus: 'received' | 'parsed' | 'mapped' | 'sent' | 'error';
  /** Error message if processing failed */
  error?: string;
}

/** Message log entry for the audit trail */
export interface MessageLogEntry {
  id: number;
  timestamp: string;
  analyzerId: string;
  analyzerName: string;
  direction: 'inbound' | 'outbound';
  protocol: string;
  rawContent: string;
  parsedSummary: string;
  fhirResourceIds: string[];
  status: 'success' | 'parse-error' | 'send-error' | 'queued';
  errorMessage?: string;
}
