/**
 * Tests for resultMapper — the "universal translator" that converts
 * protocol-specific parsed output (ASTM, HL7v2, Combilyzer) into
 * a standard LabResult format, regardless of which analyzer sent it.
 *
 * Covers:
 * - ASTM message with multiple R records
 * - HL7v2 ORU with multiple OBX segments
 * - Combilyzer output with multiple parameters
 * - Missing barcode (should not crash)
 * - Unknown test code (still included, raw code preserved)
 * - Known test code (LOINC code applied from mapping)
 * - Abnormal flag mapping (H, L, HH, LL, N, empty)
 * - Empty message (no results) → empty array
 */

import { describe, it, expect } from 'vitest';
import {
  mapASTMToLabResults,
  mapHL7v2ToLabResults,
  mapCombilyzerToLabResults,
} from './resultMapper.js';
import type { ASTMMessage, ASTMHeader, ASTMPatient, ASTMOrder, ASTMResult } from '../types/astm.js';
import type { ORUMessage, MSHSegment, PIDSegment, OBRSegment, OBXSegment } from '../protocols/hl7v2/types.js';
import type { CombilyzerResult, CombilyzerParameter } from '../protocols/combilyzer/types.js';

// ---------------------------------------------------------------------------
// Helpers — build minimal valid protocol messages
// ---------------------------------------------------------------------------

function buildASTMHeader(overrides: Partial<ASTMHeader> = {}): ASTMHeader {
  return {
    type: 'H',
    delimiter: '|',
    senderId: 'XN-550',
    senderName: 'Sysmex XN-550',
    receiverId: 'LIS',
    processingId: 'P',
    versionNumber: '1',
    timestamp: '20240315120000',
    ...overrides,
  };
}

function buildASTMPatient(overrides: Partial<ASTMPatient> = {}): ASTMPatient {
  return {
    type: 'P',
    sequenceNumber: 1,
    patientId: 'PAT001',
    laboratoryPatientId: 'LAB001',
    patientName: 'Doe^John',
    dateOfBirth: '19800101',
    sex: 'M',
    ...overrides,
  };
}

function buildASTMOrder(overrides: Partial<ASTMOrder> = {}): ASTMOrder {
  return {
    type: 'O',
    sequenceNumber: 1,
    specimenId: '12345678',
    instrumentSpecimenId: 'INST001',
    universalTestId: 'CBC',
    priority: 'R',
    requestedDateTime: '20240315100000',
    collectionDateTime: '20240315110000',
    specimenType: 'Blood',
    ...overrides,
  };
}

function buildASTMResult(overrides: Partial<ASTMResult> = {}): ASTMResult {
  return {
    type: 'R',
    sequenceNumber: 1,
    universalTestId: '^^^WBC',
    testCode: 'WBC',
    testName: 'WBC',
    value: '7.5',
    unit: 'x10^3/uL',
    referenceRange: '4.5-11.0',
    abnormalFlag: 'N',
    resultStatus: 'F',
    dateTimeOfTest: '20240315120000',
    instrumentId: 'XN-550',
    ...overrides,
  };
}

function buildASTMMessage(overrides: {
  header?: Partial<ASTMHeader>;
  patient?: Partial<ASTMPatient>;
  order?: Partial<ASTMOrder>;
  results?: Partial<ASTMResult>[];
  receivedAt?: string;
} = {}): ASTMMessage {
  const results = overrides.results
    ? overrides.results.map((r) => buildASTMResult(r))
    : [buildASTMResult()];

  return {
    header: buildASTMHeader(overrides.header),
    patients: [
      {
        patient: buildASTMPatient(overrides.patient),
        orders: [
          {
            order: buildASTMOrder(overrides.order),
            results,
          },
        ],
      },
    ],
    rawFrames: ['H|...', 'P|...', 'O|...', 'R|...', 'L|1'],
    receivedAt: overrides.receivedAt ?? '2024-03-15T12:00:00.000Z',
  };
}

function buildMSH(overrides: Partial<MSHSegment> = {}): MSHSegment {
  return {
    fieldSeparator: '|',
    encodingCharacters: '^~\\&',
    sendingApplication: 'BC-3510',
    sendingFacility: 'Lab',
    receivingApplication: 'Middleware',
    receivingFacility: 'Hospital',
    dateTime: '20240315120000',
    messageType: 'ORU^R01',
    messageControlId: 'MSG001',
    processingId: 'P',
    versionId: '2.3.1',
    ...overrides,
  };
}

function buildPID(overrides: Partial<PIDSegment> = {}): PIDSegment {
  return {
    patientId: 'PAT001',
    patientName: 'Doe^John',
    dateOfBirth: '19800101',
    sex: 'M',
    ...overrides,
  };
}

function buildOBR(overrides: Partial<OBRSegment> = {}): OBRSegment {
  return {
    setId: 1,
    placerOrderNumber: 'ORD001',
    fillerOrderNumber: 'LAB001',
    universalServiceId: 'CBC',
    specimenId: '12345678',
    requestedDateTime: '20240315100000',
    observationDateTime: '20240315120000',
    resultStatus: 'F',
    ...overrides,
  };
}

function buildOBX(overrides: Partial<OBXSegment> = {}): OBXSegment {
  return {
    setId: 1,
    valueType: 'NM',
    observationId: 'WBC^White Blood Cell Count',
    observationSubId: '',
    value: '7.5',
    units: 'x10^3/uL',
    referenceRange: '4.5-11.0',
    abnormalFlags: 'N',
    probability: '',
    nature: '',
    resultStatus: 'F',
    dateOfObservation: '20240315120000',
    ...overrides,
  };
}

function buildORUMessage(overrides: {
  msh?: Partial<MSHSegment>;
  pid?: Partial<PIDSegment> | null;
  obr?: Partial<OBRSegment>;
  obx?: Partial<OBXSegment>[];
  receivedAt?: string;
} = {}): ORUMessage {
  const obxList = overrides.obx
    ? overrides.obx.map((o) => buildOBX(o))
    : [buildOBX()];

  return {
    msh: buildMSH(overrides.msh),
    pid: overrides.pid === null ? null : buildPID(overrides.pid),
    obr: buildOBR(overrides.obr),
    obx: obxList,
    rawMessage: 'MSH|^~\\&|BC-3510|...',
    receivedAt: overrides.receivedAt ?? '2024-03-15T12:00:00.000Z',
  };
}

function buildCombilyzerResult(overrides: {
  specimenId?: string;
  dateTime?: string;
  parameters?: CombilyzerParameter[];
  receivedAt?: string;
} = {}): CombilyzerResult {
  return {
    specimenId: overrides.specimenId ?? '12345678',
    dateTime: overrides.dateTime ?? '20240315120000',
    parameters: overrides.parameters ?? [
      { code: 'GLU', name: 'Glucose', value: 'Negative', unit: '', abnormal: false },
      { code: 'PRO', name: 'Protein', value: '1+', unit: '', abnormal: true },
    ],
    rawOutput: 'GLU:Negative PRO:1+',
    receivedAt: overrides.receivedAt ?? '2024-03-15T12:00:00.000Z',
  };
}

// ===========================================================================
// mapASTMToLabResults()
// ===========================================================================

describe('mapASTMToLabResults()', () => {
  it('converts ASTM message with multiple R records to LabResult with components', () => {
    const msg = buildASTMMessage({
      results: [
        { testCode: 'WBC', value: '7.5', unit: 'x10^3/uL', referenceRange: '4.5-11.0', abnormalFlag: 'N' },
        { testCode: 'RBC', value: '4.8', unit: 'x10^6/uL', referenceRange: '4.6-6.2', abnormalFlag: '' },
        { testCode: 'HGB', value: '14.2', unit: 'g/dL', referenceRange: '13.0-18.0', abnormalFlag: 'N' },
      ],
    });

    const results = mapASTMToLabResults(msg, 'sysmex-xn550');

    expect(results).toHaveLength(1);
    const lab = results[0];
    expect(lab.analyzerId).toBe('sysmex-xn550');
    expect(lab.specimenBarcode).toBe('12345678');
    expect(lab.patientId).toBe('PAT001');
    expect(lab.patientName).toBe('Doe^John');
    expect(lab.components).toHaveLength(3);
    expect(lab.processingStatus).toBe('mapped');
    expect(lab.messageId).toBeTruthy();

    // First component — WBC with LOINC mapping
    expect(lab.components[0].testCode).toBe('WBC');
    expect(lab.components[0].testName).toBe('Leukocytes [#/volume] in Blood by Automated count');
    expect(lab.components[0].value).toBe('7.5');
    expect(lab.components[0].unit).toBe('10*3/uL'); // UCUM unit from mapping
    expect(lab.components[0].referenceRange).toBe('4.5-11.0');
    expect(lab.components[0].flag).toBe('N');

    // Second component — RBC
    expect(lab.components[1].testCode).toBe('RBC');
    expect(lab.components[1].value).toBe('4.8');
  });

  it('returns empty array when ASTM message has no patients', () => {
    const msg: ASTMMessage = {
      header: buildASTMHeader(),
      patients: [],
      rawFrames: ['H|...', 'L|1'],
      receivedAt: '2024-03-15T12:00:00.000Z',
    };

    const results = mapASTMToLabResults(msg, 'sysmex-xn550');
    expect(results).toEqual([]);
  });

  it('handles missing barcode gracefully', () => {
    const msg = buildASTMMessage({
      order: { specimenId: '' },
    });

    const results = mapASTMToLabResults(msg, 'sysmex-xn550');

    expect(results).toHaveLength(1);
    expect(results[0].specimenBarcode).toBe('');
  });

  it('preserves raw test code when mapping is not found', () => {
    const msg = buildASTMMessage({
      results: [
        { testCode: 'UNKNOWN_CODE_XYZ', value: '42', unit: 'mg/dL', referenceRange: '10-50', abnormalFlag: '' },
      ],
    });

    const results = mapASTMToLabResults(msg, 'sysmex-xn550');

    expect(results).toHaveLength(1);
    const comp = results[0].components[0];
    expect(comp.testCode).toBe('UNKNOWN_CODE_XYZ');
    expect(comp.testName).toBe('UNKNOWN_CODE_XYZ'); // raw code used as name
    expect(comp.unit).toBe('mg/dL'); // raw unit preserved
  });

  it('uses LOINC mapping when test code is known', () => {
    const msg = buildASTMMessage({
      results: [
        { testCode: 'PLT', value: '250', unit: '10^3/uL', referenceRange: '150-400', abnormalFlag: 'N' },
      ],
    });

    const results = mapASTMToLabResults(msg, 'sysmex-xn550');

    const comp = results[0].components[0];
    expect(comp.testCode).toBe('PLT');
    expect(comp.testName).toBe('Platelets [#/volume] in Blood by Automated count');
    expect(comp.unit).toBe('10*3/uL'); // UCUM unit from mapping, not raw
  });

  it('populates loincCode from analyzer mapping when test code is known', () => {
    const msg = buildASTMMessage({
      results: [
        { testCode: 'WBC', value: '7.5', unit: 'x10^3/uL', abnormalFlag: 'N' },
      ],
    });

    const results = mapASTMToLabResults(msg, 'sysmex-xn550');

    expect(results[0].components[0].loincCode).toBe('6690-2');
  });

  it('leaves loincCode undefined when test code has no mapping', () => {
    const msg = buildASTMMessage({
      results: [
        { testCode: 'UNKNOWN_XYZ', value: '42', unit: 'mg/dL', abnormalFlag: '' },
      ],
    });

    const results = mapASTMToLabResults(msg, 'sysmex-xn550');

    expect(results[0].components[0].loincCode).toBeUndefined();
  });

  it('handles unknown analyzer ID (no mapping file)', () => {
    const msg = buildASTMMessage({
      results: [
        { testCode: 'WBC', value: '7.5', unit: 'x10^3/uL', referenceRange: '4.5-11.0', abnormalFlag: 'N' },
      ],
    });

    const results = mapASTMToLabResults(msg, 'nonexistent-analyzer');

    expect(results).toHaveLength(1);
    // Should still work — just uses raw codes
    const comp = results[0].components[0];
    expect(comp.testCode).toBe('WBC');
    expect(comp.testName).toBe('WBC');
    expect(comp.unit).toBe('x10^3/uL'); // raw unit since no mapping
  });

  it('maps result status correctly', () => {
    const msg = buildASTMMessage({
      results: [
        { testCode: 'WBC', resultStatus: 'F', value: '7.5' },
        { testCode: 'RBC', resultStatus: 'P', value: '4.8' },
        { testCode: 'HGB', resultStatus: 'C', value: '14.2' },
      ],
    });

    const results = mapASTMToLabResults(msg, 'sysmex-xn550');

    expect(results[0].components[0].status).toBe('final');
    expect(results[0].components[1].status).toBe('preliminary');
    expect(results[0].components[2].status).toBe('corrected');
  });

  it('creates multiple LabResults for multiple orders', () => {
    const msg: ASTMMessage = {
      header: buildASTMHeader(),
      patients: [
        {
          patient: buildASTMPatient(),
          orders: [
            {
              order: buildASTMOrder({ specimenId: '11111111' }),
              results: [buildASTMResult({ testCode: 'WBC', value: '7.5' })],
            },
            {
              order: buildASTMOrder({ specimenId: '22222222' }),
              results: [buildASTMResult({ testCode: 'HGB', value: '14.2' })],
            },
          ],
        },
      ],
      rawFrames: ['H|...', 'L|1'],
      receivedAt: '2024-03-15T12:00:00.000Z',
    };

    const results = mapASTMToLabResults(msg, 'sysmex-xn550');

    expect(results).toHaveLength(2);
    expect(results[0].specimenBarcode).toBe('11111111');
    expect(results[1].specimenBarcode).toBe('22222222');
  });

  it('skips orders with empty results array', () => {
    const msg: ASTMMessage = {
      header: buildASTMHeader(),
      patients: [
        {
          patient: buildASTMPatient(),
          orders: [
            {
              order: buildASTMOrder(),
              results: [], // empty — should be skipped
            },
          ],
        },
      ],
      rawFrames: ['H|...', 'L|1'],
      receivedAt: '2024-03-15T12:00:00.000Z',
    };

    const results = mapASTMToLabResults(msg, 'sysmex-xn550');
    expect(results).toEqual([]);
  });

  it('falls back to receivedAt when dateTimeOfTest is empty', () => {
    const msg = buildASTMMessage({
      results: [{ testCode: 'WBC', value: '7.5', dateTimeOfTest: '' }],
      receivedAt: '2024-03-15T12:00:00.000Z',
    });

    const results = mapASTMToLabResults(msg, 'sysmex-xn550');
    expect(results[0].testDateTime).toBe('2024-03-15T12:00:00.000Z');
  });
});

// ===========================================================================
// mapHL7v2ToLabResults()
// ===========================================================================

describe('mapHL7v2ToLabResults()', () => {
  it('converts HL7v2 ORU with multiple OBX to LabResult with components', () => {
    const msg = buildORUMessage({
      obx: [
        { observationId: 'WBC^White Blood Cell Count', value: '7.5', units: 'x10^3/uL', referenceRange: '4.5-11.0', abnormalFlags: 'N', resultStatus: 'F' },
        { observationId: 'RBC^Red Blood Cell Count', value: '4.8', units: 'x10^6/uL', referenceRange: '4.6-6.2', abnormalFlags: '', resultStatus: 'F' },
      ],
    });

    const results = mapHL7v2ToLabResults(msg, 'mindray-bc3510');

    expect(results).toHaveLength(1);
    const lab = results[0];
    expect(lab.analyzerId).toBe('mindray-bc3510');
    expect(lab.specimenBarcode).toBe('12345678');
    expect(lab.patientId).toBe('PAT001');
    expect(lab.patientName).toBe('Doe^John');
    expect(lab.components).toHaveLength(2);
    expect(lab.processingStatus).toBe('mapped');

    expect(lab.components[0].testCode).toBe('WBC');
    expect(lab.components[0].testName).toBe('Leukocytes [#/volume] in Blood by Automated count');
    expect(lab.components[0].value).toBe('7.5');
    expect(lab.components[0].flag).toBe('N');

    expect(lab.components[1].testCode).toBe('RBC');
    expect(lab.components[1].value).toBe('4.8');
    expect(lab.components[1].flag).toBe('');
  });

  it('returns empty array when ORU has no OBX segments', () => {
    const msg = buildORUMessage({ obx: [] });

    const results = mapHL7v2ToLabResults(msg, 'mindray-bc3510');
    expect(results).toEqual([]);
  });

  it('handles null PID segment', () => {
    const msg = buildORUMessage({ pid: null });

    const results = mapHL7v2ToLabResults(msg, 'mindray-bc3510');

    expect(results).toHaveLength(1);
    expect(results[0].patientId).toBe('');
    expect(results[0].patientName).toBe('');
  });

  it('handles missing barcode in OBR', () => {
    const msg = buildORUMessage({
      obr: { specimenId: '' },
    });

    const results = mapHL7v2ToLabResults(msg, 'mindray-bc3510');

    expect(results).toHaveLength(1);
    expect(results[0].specimenBarcode).toBe('');
  });

  it('falls back to receivedAt when observationDateTime is empty', () => {
    const msg = buildORUMessage({
      obr: { observationDateTime: '' },
      receivedAt: '2024-03-15T12:00:00.000Z',
    });

    const results = mapHL7v2ToLabResults(msg, 'mindray-bc3510');
    expect(results[0].testDateTime).toBe('2024-03-15T12:00:00.000Z');
  });

  it('preserves unknown test codes from OBX', () => {
    const msg = buildORUMessage({
      obx: [
        { observationId: 'MYSTERY^Unknown Test', value: '99', units: 'U/L', referenceRange: '0-40', abnormalFlags: 'H' },
      ],
    });

    const results = mapHL7v2ToLabResults(msg, 'mindray-bc3510');

    const comp = results[0].components[0];
    expect(comp.testCode).toBe('MYSTERY');
    expect(comp.testName).toBe('MYSTERY');
    expect(comp.unit).toBe('U/L');
    expect(comp.flag).toBe('H');
  });

  it('maps OBX result status codes', () => {
    const msg = buildORUMessage({
      obx: [
        { observationId: 'WBC^WBC', value: '7.5', resultStatus: 'F' },
        { observationId: 'RBC^RBC', value: '4.8', resultStatus: 'P' },
        { observationId: 'HGB^HGB', value: '14', resultStatus: 'C' },
      ],
    });

    const results = mapHL7v2ToLabResults(msg, 'mindray-bc3510');

    expect(results[0].components[0].status).toBe('final');
    expect(results[0].components[1].status).toBe('preliminary');
    expect(results[0].components[2].status).toBe('corrected');
  });
});

// ===========================================================================
// mapCombilyzerToLabResults()
// ===========================================================================

describe('mapCombilyzerToLabResults()', () => {
  it('converts Combilyzer output with multiple parameters', () => {
    const result = buildCombilyzerResult({
      parameters: [
        { code: 'GLU', name: 'Glucose', value: 'Negative', unit: '', abnormal: false },
        { code: 'PRO', name: 'Protein', value: '1+', unit: '', abnormal: true },
        { code: 'pH', name: 'pH', value: '6.0', unit: '', abnormal: false },
      ],
    });

    const results = mapCombilyzerToLabResults(result, 'combilyzer-13');

    expect(results).toHaveLength(1);
    const lab = results[0];
    expect(lab.analyzerId).toBe('combilyzer-13');
    expect(lab.specimenBarcode).toBe('12345678');
    expect(lab.components).toHaveLength(3);
    expect(lab.processingStatus).toBe('mapped');

    // GLU should be mapped to LOINC
    expect(lab.components[0].testCode).toBe('GLU');
    expect(lab.components[0].testName).toBe('Glucose [Presence] in Urine by Test strip');
    expect(lab.components[0].value).toBe('Negative');
    expect(lab.components[0].flag).toBe('');

    // PRO is abnormal
    expect(lab.components[1].testCode).toBe('PRO');
    expect(lab.components[1].flag).toBe('A');
  });

  it('returns empty array when Combilyzer output has no parameters', () => {
    const result = buildCombilyzerResult({ parameters: [] });

    const results = mapCombilyzerToLabResults(result, 'combilyzer-13');
    expect(results).toEqual([]);
  });

  it('handles missing specimen ID', () => {
    const result = buildCombilyzerResult({ specimenId: '' });

    const results = mapCombilyzerToLabResults(result, 'combilyzer-13');

    expect(results).toHaveLength(1);
    expect(results[0].specimenBarcode).toBe('');
  });

  it('preserves unknown parameter codes', () => {
    const result = buildCombilyzerResult({
      parameters: [
        { code: 'XYZ', name: 'Unknown Param', value: '42', unit: 'mg/dL', abnormal: false },
      ],
    });

    const results = mapCombilyzerToLabResults(result, 'combilyzer-13');

    const comp = results[0].components[0];
    expect(comp.testCode).toBe('XYZ');
    expect(comp.testName).toBe('XYZ');
    expect(comp.unit).toBe('mg/dL');
  });

  it('falls back to receivedAt when dateTime is empty', () => {
    const result = buildCombilyzerResult({
      dateTime: '',
      receivedAt: '2024-03-15T12:00:00.000Z',
    });

    const results = mapCombilyzerToLabResults(result, 'combilyzer-13');
    expect(results[0].testDateTime).toBe('2024-03-15T12:00:00.000Z');
  });
});

// ===========================================================================
// Abnormal flag mapping (shared across all protocols)
// ===========================================================================

describe('abnormal flag mapping', () => {
  it('maps H to H (High)', () => {
    const msg = buildASTMMessage({
      results: [{ testCode: 'WBC', value: '15.0', abnormalFlag: 'H' }],
    });
    const results = mapASTMToLabResults(msg, 'sysmex-xn550');
    expect(results[0].components[0].flag).toBe('H');
  });

  it('maps L to L (Low)', () => {
    const msg = buildASTMMessage({
      results: [{ testCode: 'WBC', value: '2.0', abnormalFlag: 'L' }],
    });
    const results = mapASTMToLabResults(msg, 'sysmex-xn550');
    expect(results[0].components[0].flag).toBe('L');
  });

  it('maps HH to HH (Critical High)', () => {
    const msg = buildASTMMessage({
      results: [{ testCode: 'WBC', value: '30.0', abnormalFlag: 'HH' }],
    });
    const results = mapASTMToLabResults(msg, 'sysmex-xn550');
    expect(results[0].components[0].flag).toBe('HH');
  });

  it('maps LL to LL (Critical Low)', () => {
    const msg = buildASTMMessage({
      results: [{ testCode: 'WBC', value: '0.5', abnormalFlag: 'LL' }],
    });
    const results = mapASTMToLabResults(msg, 'sysmex-xn550');
    expect(results[0].components[0].flag).toBe('LL');
  });

  it('maps N to N (Normal)', () => {
    const msg = buildASTMMessage({
      results: [{ testCode: 'WBC', value: '7.5', abnormalFlag: 'N' }],
    });
    const results = mapASTMToLabResults(msg, 'sysmex-xn550');
    expect(results[0].components[0].flag).toBe('N');
  });

  it('maps empty string to empty string', () => {
    const msg = buildASTMMessage({
      results: [{ testCode: 'WBC', value: '7.5', abnormalFlag: '' }],
    });
    const results = mapASTMToLabResults(msg, 'sysmex-xn550');
    expect(results[0].components[0].flag).toBe('');
  });

  it('maps unrecognized flag to A (Abnormal)', () => {
    const msg = buildASTMMessage({
      results: [{ testCode: 'WBC', value: '7.5', abnormalFlag: 'X' }],
    });
    const results = mapASTMToLabResults(msg, 'sysmex-xn550');
    expect(results[0].components[0].flag).toBe('A');
  });
});
