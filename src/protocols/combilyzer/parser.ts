/**
 * Combilyzer 13 proprietary output parser.
 *
 * The Combilyzer 13 is a urine strip reader that sends results in a simplified
 * ASTM-like format over serial. Think of it like a receipt printer — it just
 * spits out lines of text with the test results, no handshaking needed.
 *
 * Unlike full ASTM, there's no ENQ/ACK framing or checksums. The data arrives
 * as plain text lines (pipe-delimited) with record types:
 *   H = Header (instrument info, timestamp)
 *   P = Patient (just a sequence number)
 *   O = Order (contains the specimen barcode)
 *   R = Result (one line per urinalysis parameter, e.g., GLU, PRO, pH)
 *   L = Terminator (end of message)
 *
 * This parser reads that raw text, extracts each parameter, and determines
 * whether each value is abnormal (outside the normal range for urine).
 */

import { CombilyzerResult, CombilyzerParameter } from './types.js';

/** Maps parameter codes to human-readable names. */
const PARAMETER_NAMES: Record<string, string> = {
  GLU: 'Glucose',
  PRO: 'Protein',
  BLD: 'Blood',
  LEU: 'Leukocytes',
  NIT: 'Nitrite',
  KET: 'Ketone',
  UBG: 'Urobilinogen',
  BIL: 'Bilirubin',
  pH: 'pH',
  SG: 'Specific Gravity',
  ASC: 'Ascorbic Acid',
  CRE: 'Creatinine',
  ALB: 'Albumin',
};

/**
 * Determines whether a urinalysis parameter value is abnormal.
 *
 * Most urine strip parameters are "Negative" when normal. A few have special
 * rules — pH has a numeric range, specific gravity has a density range, and
 * urobilinogen is "Normal" or "0.2" when normal.
 */
function isAbnormal(code: string, value: string): boolean {
  const upper = value.toUpperCase();

  switch (code) {
    case 'GLU':
      // Normal glucose reading can be "Negative" or "Normal"
      return upper !== 'NEGATIVE' && upper !== 'NORMAL';
    case 'PRO':
    case 'BLD':
    case 'LEU':
    case 'KET':
    case 'BIL':
    case 'ASC':
    case 'ALB':
      return upper !== 'NEGATIVE';
    case 'NIT':
      return upper === 'POSITIVE';
    case 'UBG':
      return upper !== 'NORMAL' && value !== '0.2';
    case 'pH': {
      const ph = parseFloat(value);
      if (isNaN(ph)) return false;
      return ph < 5.0 || ph > 8.0;
    }
    case 'SG': {
      const sg = parseFloat(value);
      if (isNaN(sg)) return false;
      return sg < 1.005 || sg > 1.030;
    }
    default:
      return false;
  }
}

/**
 * Extracts the specimen ID (barcode) from an O (Order) record.
 * Format: O|1|78901234||^^^UA|...
 * The barcode is in field index 2 (third field, zero-based).
 */
function parseOrderRecord(fields: string[]): string {
  return fields[2]?.trim() || '';
}

/**
 * Extracts the timestamp from the H (Header) record.
 * Format: H|\^&|||Combilyzer13^Human^SN-C13-00187|||||||P|1|20260305144500
 * The timestamp is the last field.
 */
function parseHeaderTimestamp(fields: string[]): string {
  const raw = fields[fields.length - 1]?.trim() || '';
  // Format: YYYYMMDDHHMMSS -> YYYY-MM-DDTHH:MM:SS
  if (raw.length === 14 && /^\d{14}$/.test(raw)) {
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T${raw.slice(8, 10)}:${raw.slice(10, 12)}:${raw.slice(12, 14)}`;
  }
  return raw;
}

/**
 * Parses a single R (Result) record into a CombilyzerParameter.
 * Format: R|seq|^^^CODE|value|value2|unit|refRange|flag||status
 *
 * The parameter code is inside the test ID field (index 2), formatted as ^^^CODE.
 * The value is in field 3. The unit is in field 5.
 */
function parseResultRecord(fields: string[]): CombilyzerParameter | null {
  const testIdField = fields[2] || '';
  // Extract code from ^^^CODE format
  const codeMatch = testIdField.match(/\^{3}(\w+)/);
  if (!codeMatch) return null;

  const code = codeMatch[1];
  const value = fields[3]?.trim() || '';
  const unit = fields[5]?.trim() || '';

  if (!value) return null;

  return {
    code,
    name: PARAMETER_NAMES[code] || code,
    value,
    unit,
    abnormal: isAbnormal(code, value),
  };
}

/**
 * Parses raw Combilyzer 13 output text into a structured result.
 *
 * Processes each line by record type (H/P/O/R/L), skipping comments and
 * malformed lines. Conservative by design — a bad line is skipped, not a crash.
 *
 * @param rawOutput - The complete text output from the Combilyzer 13
 * @returns Parsed result with specimen ID, timestamp, and all parameters
 */
export function parseCombilyzerOutput(rawOutput: string): CombilyzerResult {
  const result: CombilyzerResult = {
    specimenId: '',
    dateTime: '',
    parameters: [],
    rawOutput,
    receivedAt: new Date().toISOString(),
  };

  if (!rawOutput || !rawOutput.trim()) {
    return result;
  }

  const lines = rawOutput.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) continue;

    const fields = trimmed.split('|');
    const recordType = fields[0];

    switch (recordType) {
      case 'H':
        result.dateTime = parseHeaderTimestamp(fields);
        break;

      case 'O':
        result.specimenId = parseOrderRecord(fields);
        break;

      case 'R': {
        const param = parseResultRecord(fields);
        if (param) {
          result.parameters.push(param);
        }
        break;
      }

      case 'P':
      case 'L':
        // Patient and terminator records — nothing to extract
        break;

      default:
        // Unknown record type — skip silently (conservative parsing)
        break;
    }
  }

  return result;
}
