/**
 * Pipeline event types — tracking lab results through processing stages.
 *
 * Like a package tracking system: each result gets status updates as it moves
 * through each stage (received → parsed → mapped → sent). These types let us
 * emit events at each stage for monitoring and debugging.
 */

/** The stages a result passes through */
export type PipelineStage = 'received' | 'parsed' | 'mapped' | 'sent' | 'queued' | 'error';

/** An event emitted when a result reaches a new pipeline stage */
export interface PipelineEvent {
  /** Which stage this event is for */
  stage: PipelineStage;
  /** When this stage was reached (ISO 8601) */
  timestamp: string;
  /** Analyzer that sent the result */
  analyzerId: string;
  /** Unique message ID for tracking */
  messageId: string;
  /** Specimen barcode (available after parsing) */
  barcode?: string;
  /** Number of test components (available after parsing) */
  componentCount?: number;
  /** Created FHIR resource IDs (available after sent stage) */
  fhirResourceIds?: string[];
  /** Error details (only for error stage) */
  error?: string;
  /** How long this stage took in milliseconds */
  durationMs?: number;
}

/** Summary of pipeline processing for the monitoring dashboard */
export interface PipelineSummary {
  /** Total results processed since startup */
  totalProcessed: number;
  /** Results successfully sent to Medplum */
  totalSent: number;
  /** Results currently queued (offline) */
  totalQueued: number;
  /** Results that errored */
  totalErrors: number;
  /** Average processing time in ms (received → sent) */
  avgProcessingTimeMs: number;
  /** Timestamp of last processed result, or null if none */
  lastProcessedAt: string | null;
}
