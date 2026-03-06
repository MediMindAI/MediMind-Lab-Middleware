/**
 * Tests for the HL7v2 ORU^R01 parser.
 *
 * Uses a realistic Mindray BC-3510 CBC message fixture plus hand-crafted
 * messages to verify segment parsing, edge cases, and missing data handling.
 */
import { describe, it, expect } from 'vitest';
import { parseORU } from './parser.js';

/** Minimal ORU message for focused tests — segments separated by \r */
const MINIMAL_ORU =
  'MSH|^~\\&|BC-3510|Lab|Middleware|Hospital|20240315||ORU^R01|MSG001|P|2.3.1\r' +
  'PID|1||PAT001||Doe^John||19800101|M\r' +
  'OBR|1|ORD001|12345678|CBC^Complete Blood Count|||20240315120000||||||||||||||||HM|F\r' +
  'OBX|1|NM|WBC^White Blood Cell Count|1|7.5|x10^3/uL|4.5-11.0|N|||F|||20240315120000\r';

/** Fixture-like message matching the Mindray BC-3510 CBC format */
const MINDRAY_ORU =
  'MSH|^~\\&|BC-3510|MAIN_LAB|MediMind|HOSPITAL|20260305103000||ORU^R01|BC3510-00042|P|2.3.1\r' +
  'PID|1||PAT001^^^HOSP||BERIDZE^GIORGI||19850315|M\r' +
  'OBR|1|12345678|12345678|CBC^Complete Blood Count^L|||20260305102800|||||||||||||||20260305103000||HM|F\r' +
  'OBX|1|NM|WBC^WBC^L|1|12.8|10^9/L|4.0-10.0|H|||F|||20260305103000\r' +
  'OBX|2|NM|Lymph#^Lymphocyte Count^L|1|2.3|10^9/L|0.8-4.0|N|||F|||20260305103000\r' +
  'OBX|3|NM|RBC^RBC^L|1|4.65|10^12/L|3.80-5.80|N|||F|||20260305103000\r' +
  'OBX|4|NM|HGB^Hemoglobin^L|1|11.2|g/dL|12.0-17.0|L|||F|||20260305103000\r' +
  'OBX|5|NM|PLT^Platelets^L|1|195|10^9/L|100-400|N|||F|||20260305103000\r';

describe('parseORU', () => {
  describe('MSH segment', () => {
    it('parses MSH fields correctly', () => {
      const result = parseORU(MINIMAL_ORU);

      expect(result.msh.fieldSeparator).toBe('|');
      expect(result.msh.encodingCharacters).toBe('^~\\&');
      expect(result.msh.sendingApplication).toBe('BC-3510');
      expect(result.msh.sendingFacility).toBe('Lab');
      expect(result.msh.receivingApplication).toBe('Middleware');
      expect(result.msh.receivingFacility).toBe('Hospital');
      expect(result.msh.dateTime).toBe('20240315');
      expect(result.msh.messageType).toBe('ORU^R01');
      expect(result.msh.messageControlId).toBe('MSG001');
      expect(result.msh.processingId).toBe('P');
      expect(result.msh.versionId).toBe('2.3.1');
    });

    it('parses Mindray-specific MSH fields', () => {
      const result = parseORU(MINDRAY_ORU);

      expect(result.msh.sendingApplication).toBe('BC-3510');
      expect(result.msh.sendingFacility).toBe('MAIN_LAB');
      expect(result.msh.receivingApplication).toBe('MediMind');
      expect(result.msh.messageControlId).toBe('BC3510-00042');
    });
  });

  describe('PID segment', () => {
    it('parses PID fields correctly', () => {
      const result = parseORU(MINIMAL_ORU);

      expect(result.pid).not.toBeNull();
      expect(result.pid!.patientId).toBe('PAT001');
      expect(result.pid!.patientName).toBe('Doe^John');
      expect(result.pid!.dateOfBirth).toBe('19800101');
      expect(result.pid!.sex).toBe('M');
    });

    it('parses PID with component separators in patient ID', () => {
      const result = parseORU(MINDRAY_ORU);

      // PID.3 = "PAT001^^^HOSP" — the full field including components
      expect(result.pid!.patientId).toBe('PAT001^^^HOSP');
      expect(result.pid!.patientName).toBe('BERIDZE^GIORGI');
    });

    it('returns null pid when PID segment is missing', () => {
      const noPid =
        'MSH|^~\\&|BC-3510|Lab|Middleware|Hospital|20240315||ORU^R01|MSG001|P|2.3.1\r' +
        'OBR|1|ORD001|12345678|CBC|||20240315120000||||||||||||||||HM|F\r' +
        'OBX|1|NM|WBC^WBC|1|7.5|x10^3/uL|4.5-11.0|N|||F\r';

      const result = parseORU(noPid);
      expect(result.pid).toBeNull();
    });
  });

  describe('OBR segment', () => {
    it('parses OBR fields correctly', () => {
      const result = parseORU(MINIMAL_ORU);

      expect(result.obr.setId).toBe(1);
      expect(result.obr.placerOrderNumber).toBe('ORD001');
      expect(result.obr.fillerOrderNumber).toBe('12345678');
      expect(result.obr.universalServiceId).toBe('CBC^Complete Blood Count');
      expect(result.obr.specimenId).toBe('12345678');
      expect(result.obr.requestedDateTime).toBe('');
      expect(result.obr.observationDateTime).toBe('20240315120000');
    });

    it('extracts specimen barcode from filler order number', () => {
      const result = parseORU(MINDRAY_ORU);

      // OBR.3 = "12345678" — this is the specimen barcode
      expect(result.obr.specimenId).toBe('12345678');
    });

    it('parses result status from OBR.25', () => {
      const result = parseORU(MINDRAY_ORU);
      expect(result.obr.resultStatus).toBe('F');
    });
  });

  describe('OBX segment', () => {
    it('parses a numeric OBX correctly', () => {
      const result = parseORU(MINIMAL_ORU);

      expect(result.obx).toHaveLength(1);
      const obx = result.obx[0];
      expect(obx.setId).toBe(1);
      expect(obx.valueType).toBe('NM');
      expect(obx.observationId).toBe('WBC^White Blood Cell Count');
      expect(obx.observationSubId).toBe('1');
      expect(obx.value).toBe('7.5');
      expect(obx.units).toBe('x10^3/uL');
      expect(obx.referenceRange).toBe('4.5-11.0');
      expect(obx.abnormalFlags).toBe('N');
      expect(obx.resultStatus).toBe('F');
      expect(obx.dateOfObservation).toBe('20240315120000');
    });

    it('parses multiple OBX segments', () => {
      const result = parseORU(MINDRAY_ORU);

      expect(result.obx).toHaveLength(5);
      expect(result.obx[0].observationId).toBe('WBC^WBC^L');
      expect(result.obx[0].value).toBe('12.8');
      expect(result.obx[0].abnormalFlags).toBe('H');

      expect(result.obx[3].observationId).toBe('HGB^Hemoglobin^L');
      expect(result.obx[3].value).toBe('11.2');
      expect(result.obx[3].abnormalFlags).toBe('L');

      expect(result.obx[4].observationId).toBe('PLT^Platelets^L');
      expect(result.obx[4].value).toBe('195');
      expect(result.obx[4].abnormalFlags).toBe('N');
    });
  });

  describe('full ORU^R01 parsing', () => {
    it('returns all segments with raw message preserved', () => {
      const result = parseORU(MINDRAY_ORU);

      expect(result.msh).toBeDefined();
      expect(result.pid).not.toBeNull();
      expect(result.obr).toBeDefined();
      expect(result.obx.length).toBeGreaterThan(0);
      expect(result.rawMessage).toBe(MINDRAY_ORU);
      expect(result.receivedAt).toBeTruthy();
    });

    it('includes ISO timestamp in receivedAt', () => {
      const result = parseORU(MINIMAL_ORU);

      // Should be a valid ISO date string
      expect(() => new Date(result.receivedAt)).not.toThrow();
      expect(new Date(result.receivedAt).getTime()).not.toBeNaN();
    });
  });

  describe('edge cases', () => {
    it('throws when MSH segment is missing', () => {
      const noMsh =
        'PID|1||PAT001||Doe^John||19800101|M\r' +
        'OBR|1|ORD001|LAB001|CBC\r' +
        'OBX|1|NM|WBC|1|7.5|x10^3/uL|4.5-11.0|N|||F\r';

      expect(() => parseORU(noMsh)).toThrow('missing MSH');
    });

    it('throws when OBR segment is missing', () => {
      const noObr =
        'MSH|^~\\&|BC-3510|Lab|Middleware|Hospital|20240315||ORU^R01|MSG001|P|2.3.1\r' +
        'OBX|1|NM|WBC|1|7.5|x10^3/uL|4.5-11.0|N|||F\r';

      expect(() => parseORU(noObr)).toThrow('missing OBR');
    });

    it('handles empty/missing fields gracefully', () => {
      const sparse =
        'MSH|^~\\&|||||||ORU^R01|M99|P|2.3.1\r' +
        'OBR|1||||||\r' +
        'OBX|1|NM|WBC||7.5||||||\r';

      const result = parseORU(sparse);

      expect(result.msh.sendingApplication).toBe('');
      expect(result.msh.sendingFacility).toBe('');
      expect(result.obr.placerOrderNumber).toBe('');
      expect(result.obr.fillerOrderNumber).toBe('');
      expect(result.obx[0].referenceRange).toBe('');
      expect(result.obx[0].abnormalFlags).toBe('');
    });

    it('handles messages with newline separators instead of carriage returns', () => {
      const newlineSep =
        'MSH|^~\\&|BC-3510|Lab|Middleware|Hospital|20240315||ORU^R01|MSG001|P|2.3.1\n' +
        'OBR|1|ORD001|12345678|CBC|||20240315120000\n' +
        'OBX|1|NM|WBC|1|7.5|x10^3/uL|4.5-11.0|N|||F\n';

      const result = parseORU(newlineSep);
      expect(result.msh.messageControlId).toBe('MSG001');
      expect(result.obx).toHaveLength(1);
    });

    it('handles OBR with very few fields', () => {
      const msg =
        'MSH|^~\\&|App|Fac|Recv|RFac|20260305||ORU^R01|M1|P|2.3.1\r' +
        'OBR|1\r' +
        'OBX|1|NM|WBC||7.5\r';

      const result = parseORU(msg);
      expect(result.obr.placerOrderNumber).toBe('');
      expect(result.obr.fillerOrderNumber).toBe('');
      expect(result.obr.universalServiceId).toBe('');
      expect(result.obr.specimenId).toBe('');
      expect(result.obr.requestedDateTime).toBe('');
      expect(result.obr.observationDateTime).toBe('');
      expect(result.obr.resultStatus).toBe('');
    });

    it('handles OBX with very few fields', () => {
      const msg =
        'MSH|^~\\&|App|Fac|Recv|RFac|20260305||ORU^R01|M1|P|2.3.1\r' +
        'OBR|1|O1|F1|SVC\r' +
        'OBX|1\r';

      const result = parseORU(msg);
      expect(result.obx).toHaveLength(1);
      expect(result.obx[0].valueType).toBe('');
      expect(result.obx[0].observationId).toBe('');
      expect(result.obx[0].value).toBe('');
      expect(result.obx[0].units).toBe('');
      expect(result.obx[0].referenceRange).toBe('');
      expect(result.obx[0].abnormalFlags).toBe('');
      expect(result.obx[0].resultStatus).toBe('');
      expect(result.obx[0].dateOfObservation).toBe('');
    });
  });
});
