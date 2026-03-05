/**
 * Analyzer mapping types — the "translation dictionaries".
 *
 * Each lab analyzer uses its own test codes (e.g., Sysmex says "WBC",
 * Roche says "WBC_COUNT"). We need to translate ALL of these to
 * standard LOINC codes (like "6690-2" for White Blood Cell Count)
 * so that medical systems worldwide understand the results.
 */

/** A single mapping entry — one test code translation */
export interface AnalyzerMappingEntry {
  /** LOINC code (e.g., "6690-2") — the universal medical code */
  loinc: string;
  /** Human-readable test name (e.g., "White Blood Cell Count") */
  display: string;
  /** UCUM unit (e.g., "10*3/uL") — standardized measurement unit */
  unit: string;
  /** Default reference range if the analyzer doesn't provide one */
  defaultReferenceRange?: string;
}

/**
 * A complete mapping for one analyzer model.
 * Key = analyzer's proprietary test code (e.g., "WBC")
 * Value = standardized LOINC mapping
 */
export type AnalyzerMapping = Record<string, AnalyzerMappingEntry>;

/**
 * Metadata about an analyzer mapping file.
 * Used by the mapping registry to track available mappings.
 */
export interface AnalyzerMappingMeta {
  /** Analyzer model ID (matches config analyzerId, e.g., "sysmex-xn550") */
  analyzerId: string;
  /** Analyzer display name (e.g., "Sysmex XN-550") */
  analyzerName: string;
  /** Manufacturer (e.g., "Sysmex") */
  manufacturer: string;
  /** Number of mapped test codes */
  mappedCodes: number;
}
