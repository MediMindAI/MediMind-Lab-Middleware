/**
 * HL7v2 ORU^R01 message parser.
 *
 * Takes a raw HL7v2 message (a multi-line text with segments separated by \r)
 * and breaks it into structured objects — like reading a structured medical form
 * and putting each value into a labeled box.
 *
 * Handles the MSH quirk: in MSH segments the first "|" IS the field separator,
 * not a regular delimiter, so field numbering is offset by one compared to
 * other segments.
 */

import type {
  ORUMessage,
  MSHSegment,
  PIDSegment,
  OBRSegment,
  OBXSegment,
} from './types.js';

/**
 * Parse a raw HL7v2 ORU^R01 message into structured data.
 *
 * @param rawMessage - The full HL7v2 message text (segments separated by \r or \n)
 * @returns Parsed ORUMessage with header, patient, order, and result segments
 */
export function parseORU(rawMessage: string): ORUMessage {
  // Split on \r (the HL7 standard separator) and also handle \n for flexibility
  const lines = rawMessage.split(/\r|\n/).filter((l) => l.length > 0);

  let msh: MSHSegment | undefined;
  let pid: PIDSegment | null = null;
  let obr: OBRSegment | undefined;
  const obxList: OBXSegment[] = [];

  for (const line of lines) {
    // Skip comment lines (used in fixture files)
    if (line.startsWith('#')) continue;

    const segmentName = line.substring(0, 3);

    switch (segmentName) {
      case 'MSH':
        msh = parseMSH(line);
        break;
      case 'PID':
        pid = parsePID(line);
        break;
      case 'OBR':
        obr = parseOBR(line);
        break;
      case 'OBX':
        obxList.push(parseOBX(line));
        break;
      // PV1 and other segments are ignored — we don't need them
    }
  }

  if (!msh) {
    throw new Error('HL7v2 message missing MSH segment');
  }
  if (!obr) {
    throw new Error('HL7v2 message missing OBR segment');
  }

  return {
    msh,
    pid,
    obr,
    obx: obxList,
    rawMessage,
    receivedAt: new Date().toISOString(),
  };
}

/**
 * Parse MSH (Message Header) segment.
 *
 * MSH is special: the character at position 3 (right after "MSH") IS the
 * field separator itself. So "MSH|" means "|" is the separator, and field
 * numbering starts differently than other segments.
 */
function parseMSH(line: string): MSHSegment {
  const separator = line.charAt(3); // Usually "|"
  // Split on separator, but MSH[0] = "MSH", and field positions shift
  const fields = line.split(separator);
  // fields[0] = "MSH"
  // fields[1] = encoding characters (e.g., "^~\&")
  // fields[2] = MSH.3 sending application ... etc.
  return {
    fieldSeparator: separator,
    encodingCharacters: fields[1] ?? '',
    sendingApplication: fields[2] ?? '',
    sendingFacility: fields[3] ?? '',
    receivingApplication: fields[4] ?? '',
    receivingFacility: fields[5] ?? '',
    dateTime: fields[6] ?? '',
    // fields[7] = security (MSH.8), skip
    messageType: fields[8] ?? '',
    messageControlId: fields[9] ?? '',
    processingId: fields[10] ?? '',
    versionId: fields[11] ?? '',
  };
}

/** Parse PID (Patient Identification) segment. */
function parsePID(line: string): PIDSegment {
  const fields = line.split('|');
  return {
    patientId: fields[3] ?? '',
    patientName: fields[5] ?? '',
    dateOfBirth: fields[7] ?? '',
    sex: fields[8] ?? '',
  };
}

/** Parse OBR (Observation Request) segment. */
function parseOBR(line: string): OBRSegment {
  const fields = line.split('|');
  const fillerOrderNumber = fields[3] ?? '';
  return {
    setId: parseInt(fields[1] ?? '0', 10) || 0,
    placerOrderNumber: fields[2] ?? '',
    fillerOrderNumber,
    universalServiceId: fields[4] ?? '',
    // Specimen barcode is often the filler order number or its first component
    specimenId: fillerOrderNumber.split('^')[0] ?? '',
    requestedDateTime: fields[6] ?? '',
    observationDateTime: fields[7] ?? '',
    resultStatus: fields[25] ?? '',
  };
}

/** Parse OBX (Observation Result) segment — one test value. */
function parseOBX(line: string): OBXSegment {
  const fields = line.split('|');
  return {
    setId: parseInt(fields[1] ?? '0', 10) || 0,
    valueType: fields[2] ?? '',
    observationId: fields[3] ?? '',
    observationSubId: fields[4] ?? '',
    value: fields[5] ?? '',
    units: fields[6] ?? '',
    referenceRange: fields[7] ?? '',
    abnormalFlags: fields[8] ?? '',
    probability: fields[9] ?? '',
    nature: fields[10] ?? '',
    resultStatus: fields[11] ?? '',
    dateOfObservation: fields[14] ?? '',
  };
}
