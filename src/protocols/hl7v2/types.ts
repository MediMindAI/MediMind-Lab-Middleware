/**
 * HL7v2 message types.
 *
 * HL7v2 is a medical messaging standard — think of it like a structured letter
 * that lab machines send to communicate results. Each message is made of
 * "segments" (lines), and each segment has numbered fields separated by "|".
 *
 * Example HL7v2 message:
 *   MSH|^~\&|BC-3510|Lab|Middleware|Hospital|20240315||ORU^R01|MSG001|P|2.3.1
 *   PID|||12345||Doe^John||19800101|M
 *   OBR|1|ORD001|LAB001|CBC|||20240315120000
 *   OBX|1|NM|WBC^White Blood Cell Count||7.5|x10^3/uL|4.5-11.0|N|||F
 *   OBX|2|NM|RBC^Red Blood Cell Count||4.8|x10^6/uL|4.5-5.5|N|||F
 *
 * Key segments:
 * - MSH = Message Header (who sent it, what type of message)
 * - PID = Patient ID (patient demographics)
 * - OBR = Observation Request (which test was ordered)
 * - OBX = Observation Result (one test value — the important part!)
 *
 * The Mindray BC-3510 hematology analyzer uses HL7 v2.3.1 with ORU^R01
 * messages (ORU = Observation Result Unsolicited).
 */

/** A single HL7v2 segment — one line of a message */
export interface HL7v2Segment {
  /** Segment name (e.g., "MSH", "PID", "OBR", "OBX") */
  name: string;
  /** Pipe-delimited fields (field[0] = segment name) */
  fields: string[];
}

/** MSH segment — message header (who sent it, what type, etc.) */
export interface MSHSegment {
  /** Field separator character — usually "|" */
  fieldSeparator: string;
  /** Encoding characters — usually "^~\\&" */
  encodingCharacters: string;
  /** MSH.3 — analyzer software name */
  sendingApplication: string;
  /** MSH.4 — lab or instrument name */
  sendingFacility: string;
  /** MSH.5 — receiving software name */
  receivingApplication: string;
  /** MSH.6 — receiving facility name */
  receivingFacility: string;
  /** MSH.7 — message timestamp (e.g., "20240315120000") */
  dateTime: string;
  /** MSH.9 — message type (e.g., "ORU^R01" = unsolicited observation result) */
  messageType: string;
  /** MSH.10 — unique message ID used for ACK matching */
  messageControlId: string;
  /** MSH.11 — "P" for production, "T" for test */
  processingId: string;
  /** MSH.12 — HL7 version (e.g., "2.3.1") */
  versionId: string;
}

/** PID segment — patient identification */
export interface PIDSegment {
  /** PID.3 — patient identifier */
  patientId: string;
  /** PID.5 — patient name in last^first format */
  patientName: string;
  /** PID.7 — date of birth */
  dateOfBirth: string;
  /** PID.8 — sex (M/F/U) */
  sex: string;
}

/** OBR segment — observation request (test order info) */
export interface OBRSegment {
  /** OBR.1 — sequence number (1, 2, 3...) */
  setId: number;
  /** OBR.2 — order number from the ordering system */
  placerOrderNumber: string;
  /** OBR.3 — order number from the lab/analyzer */
  fillerOrderNumber: string;
  /** OBR.4 — test identifier (e.g., "CBC") */
  universalServiceId: string;
  /** Specimen barcode — extracted from OBR.3 sub-field */
  specimenId: string;
  /** OBR.6 — when the test was requested */
  requestedDateTime: string;
  /** OBR.7 — when the observation was made */
  observationDateTime: string;
  /** OBR.25 — "F" for final, "P" for preliminary */
  resultStatus: string;
}

/** OBX segment — observation result (one test value) */
export interface OBXSegment {
  /** OBX.1 — sequence number (1, 2, 3...) */
  setId: number;
  /** OBX.2 — value type: "NM" (numeric), "ST" (string), "CE" (coded entry), etc. */
  valueType: string;
  /** OBX.3 — test code and name (e.g., "WBC^White Blood Cell Count") */
  observationId: string;
  /** OBX.4 — sub-ID for distinguishing repeated observations */
  observationSubId: string;
  /** OBX.5 — the actual result value (e.g., "7.5") */
  value: string;
  /** OBX.6 — unit of measurement (e.g., "x10^3/uL") */
  units: string;
  /** OBX.7 — normal reference range (e.g., "4.5-11.0") */
  referenceRange: string;
  /** OBX.8 — abnormal flag: "H" (high), "L" (low), "HH", "LL", "N" (normal), "A" (abnormal) */
  abnormalFlags: string;
  /** OBX.9 — probability of the result (rarely used) */
  probability: string;
  /** OBX.10 — nature of abnormal test (rarely used) */
  nature: string;
  /** OBX.11 — result status: "F" (final), "P" (preliminary), "C" (corrected) */
  resultStatus: string;
  /** OBX.14 — observation timestamp */
  dateOfObservation: string;
}

/** A complete ORU^R01 message (observation result — unsolicited) */
export interface ORUMessage {
  /** Parsed message header */
  msh: MSHSegment;
  /** Parsed patient info — may be null if analyzer didn't include it */
  pid: PIDSegment | null;
  /** Parsed observation request (test order) */
  obr: OBRSegment;
  /** Parsed observation results — one entry per test value */
  obx: OBXSegment[];
  /** Original full message text (for audit trail) */
  rawMessage: string;
  /** ISO timestamp when the middleware received this message */
  receivedAt: string;
}
