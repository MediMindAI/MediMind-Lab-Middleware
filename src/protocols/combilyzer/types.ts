/**
 * Combilyzer 13 urinalysis analyzer types.
 *
 * The Combilyzer 13 (by 77 Elektronika) is a urine test strip reader.
 * Think of it like a barcode scanner for pee strips — you dip a strip
 * in urine, feed it into the machine, and it reads the color changes
 * to measure things like glucose, protein, and blood.
 *
 * It sends results over serial in a simplified proprietary format
 * (not full ASTM). Results are semi-quantitative — values like
 * "Negative", "1+", "2+", "3+" rather than exact numbers.
 *
 * Standard parameters: GLU, PRO, BLD, LEU, NIT, KET, UBG, BIL,
 * pH, SG, ASC, CRE, ALB.
 */

/** A single urinalysis test parameter (e.g., "GLU = Negative") */
export interface CombilyzerParameter {
  /** Parameter code from the device (e.g., "GLU", "PRO", "BLD") */
  code: string;
  /** Human-readable parameter name (e.g., "Glucose", "Protein") */
  name: string;
  /** Result value — may be semi-quantitative (e.g., "Negative", "1+", "2+", "3+", "100") */
  value: string;
  /** Unit if applicable (e.g., "mg/dL") — may be empty for semi-quantitative */
  unit: string;
  /** Whether this value is outside normal range */
  abnormal: boolean;
}

/** A complete urinalysis result from the Combilyzer 13 */
export interface CombilyzerResult {
  /** Sample/specimen ID (barcode) if provided */
  specimenId: string;
  /** Timestamp from the device */
  dateTime: string;
  /** Individual test parameters */
  parameters: CombilyzerParameter[];
  /** Raw output from the device (for audit trail) */
  rawOutput: string;
  /** When the middleware received this */
  receivedAt: string;
}
