/**
 * ASTM E1394 record-layer parser.
 *
 * After the transport layer gives us clean frame data strings, this parser
 * turns them into structured objects. Think of it like reading a form:
 * each line (record) starts with a letter saying what it is (H=Header,
 * P=Patient, O=Order, R=Result, L=done), and the fields are separated
 * by pipe characters "|".
 *
 * The parser assembles a complete message: one Header, then nested
 * Patient > Order > Result groups, ending with a Terminator.
 */

import type {
  ASTMMessage,
  ASTMHeader,
  ASTMPatient,
  ASTMOrder,
  ASTMResult,
  ASTMTerminator,
  ASTMRecord,
} from '../../types/astm.js';

/**
 * Parse a single ASTM record line into a typed object.
 * The first character determines the record type (H, P, O, R, L).
 */
export function parseRecord(frame: string): ASTMRecord {
  const type = frame.charAt(0);
  // Strip trailing CR if present
  const clean = frame.endsWith('\r') ? frame.slice(0, -1) : frame;
  const fields = clean.split('|');

  switch (type) {
    case 'H': return parseHeader(fields);
    case 'P': return parsePatient(fields);
    case 'O': return parseOrder(fields);
    case 'R': return parseResult(fields);
    case 'L': return parseTerminator(fields);
    default:
      // Return a minimal header for unknown record types
      return parseHeader(fields);
  }
}

/**
 * Parse an array of frame data strings into a complete ASTM message.
 * Assembles the nested structure: Header > Patient[] > Order[] > Result[].
 */
export function parseASTMMessage(frames: string[]): ASTMMessage {
  const records = frames.map(parseRecord);

  // First record must be H (header)
  const header = records[0]?.type === 'H'
    ? records[0] as ASTMHeader
    : createEmptyHeader();

  const patients: ASTMMessage['patients'] = [];
  let currentPatient: ASTMMessage['patients'][number] | null = null;
  let currentOrder: { order: ASTMOrder; results: ASTMResult[] } | null = null;

  for (const record of records) {
    switch (record.type) {
      case 'P': {
        // Start a new patient group
        currentPatient = { patient: record, orders: [] };
        patients.push(currentPatient);
        currentOrder = null;
        break;
      }
      case 'O': {
        // Start a new order within current patient
        currentOrder = { order: record, results: [] };
        if (currentPatient) {
          currentPatient.orders.push(currentOrder);
        } else {
          // O record without a P record — create an implicit patient
          currentPatient = { patient: createEmptyPatient(), orders: [currentOrder] };
          patients.push(currentPatient);
        }
        break;
      }
      case 'R': {
        if (currentOrder) {
          currentOrder.results.push(record);
        }
        break;
      }
      // H and L records are handled outside the loop
    }
  }

  return {
    header,
    patients,
    rawFrames: frames,
    receivedAt: new Date().toISOString(),
  };
}

// ─── Individual record parsers ───────────────────────────────────────────

function parseHeader(fields: string[]): ASTMHeader {
  // Tail fields count from the end because analyzers send different numbers
  // of middle fields (some include extra proprietary fields).
  const len = fields.length;
  return {
    type: 'H',
    delimiter: field(fields, 1),
    senderId: field(fields, 4),
    senderName: field(fields, 5),
    receiverId: len >= 5 ? field(fields, len - 4) : '',
    processingId: len >= 4 ? field(fields, len - 3) : '',
    versionNumber: len >= 3 ? field(fields, len - 2) : '',
    timestamp: len >= 2 ? field(fields, len - 1) : '',
  };
}

function parsePatient(fields: string[]): ASTMPatient {
  return {
    type: 'P',
    sequenceNumber: parseInt(field(fields, 1), 10) || 0,
    patientId: field(fields, 2),
    laboratoryPatientId: field(fields, 3),
    patientName: field(fields, 5),
    dateOfBirth: field(fields, 7),
    sex: field(fields, 8),
  };
}

function parseOrder(fields: string[]): ASTMOrder {
  return {
    type: 'O',
    sequenceNumber: parseInt(field(fields, 1), 10) || 0,
    specimenId: field(fields, 2),
    instrumentSpecimenId: field(fields, 3),
    universalTestId: field(fields, 4),
    priority: field(fields, 5),
    requestedDateTime: field(fields, 6),
    collectionDateTime: field(fields, 8),
    specimenType: field(fields, 15),
  };
}

function parseResult(fields: string[]): ASTMResult {
  const rawTestId = field(fields, 2);
  const testCode = extractTestCode(rawTestId);

  return {
    type: 'R',
    sequenceNumber: parseInt(field(fields, 1), 10) || 0,
    universalTestId: rawTestId,
    testCode,
    testName: testCode, // Default to code; caller can enrich later
    value: field(fields, 3),
    unit: field(fields, 4),
    referenceRange: field(fields, 5),
    abnormalFlag: field(fields, 6),
    resultStatus: field(fields, 8),
    dateTimeOfTest: field(fields, 12),
    instrumentId: field(fields, 13),
  };
}

function parseTerminator(fields: string[]): ASTMTerminator {
  return {
    type: 'L',
    sequenceNumber: parseInt(field(fields, 1), 10) || 0,
    terminationCode: field(fields, 2),
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────

/** Safely get a field by index (0-based), returning empty string if missing. */
function field(fields: string[], index: number): string {
  return fields[index] ?? '';
}

/**
 * Extract the test code from a universal test ID like "^^^WBC".
 * Strips the leading "^^^" (or any number of "^" prefixes).
 */
function extractTestCode(universalTestId: string): string {
  const match = universalTestId.match(/\^*(.+)/);
  return match ? match[1] : universalTestId;
}

function createEmptyHeader(): ASTMHeader {
  return {
    type: 'H', delimiter: '', senderId: '', senderName: '',
    receiverId: '', processingId: '', versionNumber: '', timestamp: '',
  };
}

function createEmptyPatient(): ASTMPatient {
  return {
    type: 'P', sequenceNumber: 0, patientId: '', laboratoryPatientId: '',
    patientName: '', dateOfBirth: '', sex: '',
  };
}
