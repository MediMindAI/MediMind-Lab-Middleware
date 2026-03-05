/**
 * ASTM E1381/E1394 protocol types.
 *
 * ASTM is like a walkie-talkie protocol:
 * - ENQ = "Can I talk?"
 * - ACK = "Go ahead" / "Got it"
 * - NAK = "Didn't get that, say again"
 * - STX = "Here comes data..."
 * - ETX = "...end of data"
 * - EOT = "I'm done talking"
 *
 * Messages are split into records:
 * - H = Header (who's sending, what system)
 * - P = Patient (patient info)
 * - O = Order (what test was ordered)
 * - R = Result (the actual test result!)
 * - Q = Query (asking about an order)
 * - L = Terminator (end of message)
 */

/** ASTM control characters (byte values) */
export const ASTM = {
  ENQ: 0x05,  // Enquiry — "Can I talk?"
  ACK: 0x06,  // Acknowledge — "Go ahead" / "Got it"
  NAK: 0x15,  // Negative Ack — "Didn't get that"
  STX: 0x02,  // Start of Text — "Here comes data"
  ETX: 0x03,  // End of Text — "End of this frame"
  EOT: 0x04,  // End of Transmission — "I'm done"
  ETB: 0x17,  // End of Transmission Block — "More frames coming"
  CR: 0x0D,   // Carriage Return
  LF: 0x0A,   // Line Feed
} as const;

/** ASTM record types */
export type ASTMRecordType = 'H' | 'P' | 'O' | 'R' | 'Q' | 'L' | 'C' | 'M' | 'S';

/** ASTM transport state machine states */
export type ASTMState =
  | 'idle'           // Waiting for communication
  | 'receiving'      // Got ENQ, waiting for data frames
  | 'sending'        // We sent ENQ, sending data
  | 'error'          // Something went wrong
  ;

/** A single ASTM frame (max 247 bytes between STX and ETX) */
export interface ASTMFrame {
  frameNumber: number;  // 0-7, cycles
  data: string;         // The actual content
  checksum: string;     // 2-character hex checksum
  isLastFrame: boolean; // ETX (last) vs ETB (more coming)
}

/** Parsed ASTM Header record (H) */
export interface ASTMHeader {
  type: 'H';
  delimiter: string;
  senderId: string;
  senderName: string;
  receiverId: string;
  processingId: string;
  versionNumber: string;
  timestamp: string;
}

/** Parsed ASTM Patient record (P) */
export interface ASTMPatient {
  type: 'P';
  sequenceNumber: number;
  patientId: string;
  laboratoryPatientId: string;
  patientName: string;
  dateOfBirth: string;
  sex: string;
}

/** Parsed ASTM Order record (O) */
export interface ASTMOrder {
  type: 'O';
  sequenceNumber: number;
  specimenId: string;    // This is the barcode!
  instrumentSpecimenId: string;
  universalTestId: string;
  priority: string;
  requestedDateTime: string;
  collectionDateTime: string;
  specimenType: string;
}

/** Parsed ASTM Result record (R) */
export interface ASTMResult {
  type: 'R';
  sequenceNumber: number;
  universalTestId: string;
  testCode: string;
  testName: string;
  value: string;
  unit: string;
  referenceRange: string;
  abnormalFlag: string;
  resultStatus: string;
  dateTimeOfTest: string;
  instrumentId: string;
}

/** Parsed ASTM Terminator record (L) */
export interface ASTMTerminator {
  type: 'L';
  sequenceNumber: number;
  terminationCode: string;
}

/** Any parsed ASTM record */
export type ASTMRecord = ASTMHeader | ASTMPatient | ASTMOrder | ASTMResult | ASTMTerminator;

/** A complete ASTM message (all records from H to L) */
export interface ASTMMessage {
  header: ASTMHeader;
  patients: Array<{
    patient: ASTMPatient;
    orders: Array<{
      order: ASTMOrder;
      results: ASTMResult[];
    }>;
  }>;
  rawFrames: string[];
  receivedAt: string;
}
