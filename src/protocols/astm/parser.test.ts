/**
 * Tests for the ASTM E1394 record-layer parser.
 *
 * Verifies that pipe-delimited ASTM records (H, P, O, R, L) are parsed
 * into typed objects correctly, and that a full message from a Sysmex
 * XN-550 hematology analyzer assembles into the right nested structure.
 */

import { describe, it, expect } from 'vitest';
import { parseRecord, parseASTMMessage } from './parser.js';

describe('parseRecord', () => {
  it('parses an H (header) record', () => {
    const record = parseRecord('H|\\^&|||XN-550^Sysmex|||||LIS2-A2|P|1|20260305143000');
    expect(record.type).toBe('H');
    if (record.type !== 'H') return;
    expect(record.delimiter).toBe('\\^&');
    expect(record.senderId).toBe('XN-550^Sysmex');
    expect(record.processingId).toBe('P');
    expect(record.versionNumber).toBe('1');
    expect(record.timestamp).toBe('20260305143000');
  });

  it('parses a P (patient) record', () => {
    const record = parseRecord('P|1||||SMITH^JOHN^A||19850315|M');
    expect(record.type).toBe('P');
    if (record.type !== 'P') return;
    expect(record.sequenceNumber).toBe(1);
    expect(record.patientName).toBe('SMITH^JOHN^A');
    expect(record.dateOfBirth).toBe('19850315');
    expect(record.sex).toBe('M');
  });

  it('parses an O (order) record with specimen barcode', () => {
    const record = parseRecord('O|1|12345678||^^^WBC|R|20260305142500||20260305142800');
    expect(record.type).toBe('O');
    if (record.type !== 'O') return;
    expect(record.sequenceNumber).toBe(1);
    expect(record.specimenId).toBe('12345678');
    expect(record.universalTestId).toBe('^^^WBC');
    expect(record.priority).toBe('R');
    expect(record.requestedDateTime).toBe('20260305142500');
    expect(record.collectionDateTime).toBe('20260305142800');
  });

  it('parses an R (result) record with test code, value, unit, and flag', () => {
    const record = parseRecord('R|1|^^^WBC|7.45|10*3/uL|4.5-11.0|N||F||LAB01||20260305143000|XN-550');
    expect(record.type).toBe('R');
    if (record.type !== 'R') return;
    expect(record.sequenceNumber).toBe(1);
    expect(record.testCode).toBe('WBC');
    expect(record.universalTestId).toBe('^^^WBC');
    expect(record.value).toBe('7.45');
    expect(record.unit).toBe('10*3/uL');
    expect(record.referenceRange).toBe('4.5-11.0');
    expect(record.abnormalFlag).toBe('N');
    expect(record.resultStatus).toBe('F');
    expect(record.dateTimeOfTest).toBe('20260305143000');
    expect(record.instrumentId).toBe('XN-550');
  });

  it('parses an L (terminator) record', () => {
    const record = parseRecord('L|1|N');
    expect(record.type).toBe('L');
    if (record.type !== 'L') return;
    expect(record.sequenceNumber).toBe(1);
    expect(record.terminationCode).toBe('N');
  });

  it('handles missing/empty fields gracefully', () => {
    const record = parseRecord('R|1|^^^GLU|5.2|||');
    expect(record.type).toBe('R');
    if (record.type !== 'R') return;
    expect(record.testCode).toBe('GLU');
    expect(record.value).toBe('5.2');
    expect(record.unit).toBe('');
    expect(record.referenceRange).toBe('');
    expect(record.abnormalFlag).toBe('');
  });

  it('strips trailing CR from frame data', () => {
    const record = parseRecord('L|1|N\r');
    expect(record.type).toBe('L');
    if (record.type !== 'L') return;
    expect(record.terminationCode).toBe('N');
  });
});

describe('parseASTMMessage', () => {
  it('assembles a simple H -> P -> O -> R -> R -> L message', () => {
    const frames = [
      'H|\\^&|||Analyzer|||||||1|20260305143000',
      'P|1||||DOE^JANE||19900101|F',
      'O|1|87654321||^^^CBC|R|20260305142500||20260305142800',
      'R|1|^^^WBC|7.5|x10^3/uL|4.5-11.0|N||F||LAB01||20260305143000|AN-01',
      'R|2|^^^RBC|4.8|x10^6/uL|4.0-5.5|N||F||LAB01||20260305143000|AN-01',
      'L|1|N',
    ];

    const msg = parseASTMMessage(frames);

    expect(msg.header.type).toBe('H');
    expect(msg.patients).toHaveLength(1);
    expect(msg.patients[0].patient.patientName).toBe('DOE^JANE');
    expect(msg.patients[0].orders).toHaveLength(1);
    expect(msg.patients[0].orders[0].order.specimenId).toBe('87654321');
    expect(msg.patients[0].orders[0].results).toHaveLength(2);
    expect(msg.patients[0].orders[0].results[0].testCode).toBe('WBC');
    expect(msg.patients[0].orders[0].results[1].testCode).toBe('RBC');
    expect(msg.rawFrames).toEqual(frames);
  });

  it('parses a full Sysmex XN-550 CBC fixture (20 results)', () => {
    // These frames match the sysmex-cbc.txt fixture (record-layer content)
    const frames = [
      'H|\\^&|||XN-550^Sysmex^00-21^^^^XN-550 01^SN24001234|||||||LIS2-A2|P|1|20260305143000',
      'P|1||||SMITH^JOHN^A||19850315|M',
      'O|1|12345678||^^^WBC\\^^^RBC\\^^^HGB\\^^^HCT\\^^^MCV\\^^^MCH\\^^^MCHC\\^^^PLT\\^^^NEUT%\\^^^LYMPH%\\^^^MONO%\\^^^EO%\\^^^BASO%\\^^^NEUT#\\^^^LYMPH#\\^^^MONO#\\^^^EO#\\^^^BASO#\\^^^RDW-SD\\^^^RDW-CV|R|20260305142500|20260305142800||||A||||Whole Blood|||||||20260305143000||||F',
      'R|1|^^^WBC|7.45|10*3/uL|4.5-11.0|N||F||LAB01||20260305143000|XN-550',
      'R|2|^^^RBC|5.12|10*6/uL|4.6-6.2|N||F||LAB01||20260305143000|XN-550',
      'R|3|^^^HGB|15.2|g/dL|13.0-18.0|N||F||LAB01||20260305143000|XN-550',
      'R|4|^^^HCT|44.8|%|40-54|N||F||LAB01||20260305143000|XN-550',
      'R|5|^^^MCV|87.5|fL|80-100|N||F||LAB01||20260305143000|XN-550',
      'R|6|^^^MCH|29.7|pg|27-32|N||F||LAB01||20260305143000|XN-550',
      'R|7|^^^MCHC|33.9|g/dL|32-36|N||F||LAB01||20260305143000|XN-550',
      'R|8|^^^PLT|238|10*3/uL|150-400|N||F||LAB01||20260305143000|XN-550',
      'R|9|^^^RDW-SD|42.1|fL|35.0-46.0|N||F||LAB01||20260305143000|XN-550',
      'R|10|^^^RDW-CV|13.4|%|11.5-15.0|N||F||LAB01||20260305143000|XN-550',
      'R|11|^^^NEUT%|57.8|%|40-70|N||F||LAB01||20260305143000|XN-550',
      'R|12|^^^LYMPH%|29.3|%|20-40|N||F||LAB01||20260305143000|XN-550',
      'R|13|^^^MONO%|7.5|%|2-8|N||F||LAB01||20260305143000|XN-550',
      'R|14|^^^EO%|3.2|%|0-4|N||F||LAB01||20260305143000|XN-550',
      'R|15|^^^BASO%|0.4|%|0-1|N||F||LAB01||20260305143000|XN-550',
      'R|16|^^^NEUT#|4.31|10*3/uL|1.5-8.0|N||F||LAB01||20260305143000|XN-550',
      'R|17|^^^LYMPH#|2.18|10*3/uL|1.0-4.0|N||F||LAB01||20260305143000|XN-550',
      'R|18|^^^MONO#|0.56|10*3/uL|0.2-1.0|N||F||LAB01||20260305143000|XN-550',
      'R|19|^^^EO#|0.24|10*3/uL|0.0-0.5|N||F||LAB01||20260305143000|XN-550',
      'R|20|^^^BASO#|0.03|10*3/uL|0.0-0.2|N||F||LAB01||20260305143000|XN-550',
      'L|1|N',
    ];

    const msg = parseASTMMessage(frames);

    // Header
    expect(msg.header.senderId).toBe('XN-550^Sysmex^00-21^^^^XN-550 01^SN24001234');
    expect(msg.header.versionNumber).toBe('1');

    // Patient
    expect(msg.patients).toHaveLength(1);
    expect(msg.patients[0].patient.patientName).toBe('SMITH^JOHN^A');
    expect(msg.patients[0].patient.sex).toBe('M');

    // Order with barcode
    expect(msg.patients[0].orders).toHaveLength(1);
    expect(msg.patients[0].orders[0].order.specimenId).toBe('12345678');

    // All 20 results
    const results = msg.patients[0].orders[0].results;
    expect(results).toHaveLength(20);

    // Spot-check first and last results
    expect(results[0].testCode).toBe('WBC');
    expect(results[0].value).toBe('7.45');
    expect(results[0].unit).toBe('10*3/uL');
    expect(results[0].referenceRange).toBe('4.5-11.0');
    expect(results[0].abnormalFlag).toBe('N');
    expect(results[0].instrumentId).toBe('XN-550');

    expect(results[19].testCode).toBe('BASO#');
    expect(results[19].value).toBe('0.03');
  });

  it('handles O record without preceding P record', () => {
    const frames = [
      'H|\\^&|||Analyzer|||||||1|20260305',
      'O|1|99999999||^^^GLU|R|||',
      'R|1|^^^GLU|5.2|mmol/L|3.9-6.1|N||F',
      'L|1|N',
    ];

    const msg = parseASTMMessage(frames);

    // Should create an implicit patient
    expect(msg.patients).toHaveLength(1);
    expect(msg.patients[0].orders).toHaveLength(1);
    expect(msg.patients[0].orders[0].results[0].testCode).toBe('GLU');
  });
});
