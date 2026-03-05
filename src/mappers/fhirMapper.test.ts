/**
 * Tests for FHIR mapper — converting LabResult into FHIR Observations + DiagnosticReport.
 *
 * Covers: value parsing (numeric/text), reference range parsing ("X-Y", "<X", ">X"),
 * flag interpretation mapping, LIS extensions, optional refs, and multi-component results.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mapLabResultToFHIR } from './fhirMapper.js';
import type { LabResult, ComponentResult } from '../types/result.js';
import { LIS_EXTENSIONS } from '../fhir/types.js';

/** Helper to build a minimal valid LabResult for testing */
function makeLabResult(overrides: Partial<LabResult> = {}): LabResult {
  return {
    messageId: 'MSG-001',
    analyzerId: 'sysmex-xn550',
    specimenBarcode: '14829365',
    patientId: '',
    patientName: '',
    testDateTime: '2026-03-05T10:30:00Z',
    receivedAt: '2026-03-05T10:30:05Z',
    components: [
      {
        testCode: 'WBC',
        testName: 'White Blood Cell Count',
        value: '7.5',
        unit: '10*3/uL',
        referenceRange: '4.5-11.0',
        flag: 'N',
        status: 'preliminary',
      },
    ],
    rawMessage: 'raw-data-here',
    processingStatus: 'parsed',
    ...overrides,
  };
}

function makeComponent(overrides: Partial<ComponentResult> = {}): ComponentResult {
  return {
    testCode: 'WBC',
    testName: 'White Blood Cell Count',
    value: '7.5',
    unit: '10*3/uL',
    referenceRange: '4.5-11.0',
    flag: 'N',
    status: 'preliminary',
    ...overrides,
  };
}

describe('mapLabResultToFHIR', () => {
  beforeEach(() => {
    // Fix the clock so import-time extension is predictable
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-05T12:00:00Z'));
  });

  // ─── Basic structure ───────────────────────────────────────────

  it('should return one Observation per component and one DiagnosticReport', () => {
    const lab = makeLabResult({
      components: [
        makeComponent({ testCode: 'WBC', value: '7.5' }),
        makeComponent({ testCode: 'RBC', testName: 'Red Blood Cell Count', value: '4.8' }),
      ],
    });
    const result = mapLabResultToFHIR(lab);

    expect(result.observations).toHaveLength(2);
    expect(result.diagnosticReport.resourceType).toBe('DiagnosticReport');
  });

  it('should set Observation resourceType and status to preliminary', () => {
    const result = mapLabResultToFHIR(makeLabResult());
    const obs = result.observations[0];

    expect(obs.resourceType).toBe('Observation');
    expect(obs.status).toBe('preliminary');
  });

  // ─── Observation category ──────────────────────────────────────

  it('should set laboratory category on each Observation', () => {
    const result = mapLabResultToFHIR(makeLabResult());
    const obs = result.observations[0];

    expect(obs.category).toEqual([
      {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/observation-category',
            code: 'laboratory',
            display: 'Laboratory',
          },
        ],
        text: 'Laboratory',
      },
    ]);
  });

  // ─── Observation code ──────────────────────────────────────────

  it('should set code with testCode and testName', () => {
    const result = mapLabResultToFHIR(makeLabResult());
    const obs = result.observations[0];

    expect(obs.code.coding).toBeDefined();
    expect(obs.code.coding![0].code).toBe('WBC');
    expect(obs.code.text).toBe('White Blood Cell Count');
  });

  // ─── Value parsing ─────────────────────────────────────────────

  it('should parse numeric value "7.5" into valueQuantity', () => {
    const result = mapLabResultToFHIR(makeLabResult());
    const obs = result.observations[0];

    expect(obs.valueQuantity).toBeDefined();
    expect(obs.valueQuantity!.value).toBe(7.5);
    expect(obs.valueQuantity!.unit).toBe('10*3/uL');
    expect(obs.valueQuantity!.system).toBe('http://unitsofmeasure.org');
  });

  it('should parse integer value "150" into valueQuantity', () => {
    const lab = makeLabResult({
      components: [makeComponent({ value: '150', unit: '10*3/uL' })],
    });
    const result = mapLabResultToFHIR(lab);

    expect(result.observations[0].valueQuantity!.value).toBe(150);
  });

  it('should use valueString for non-numeric values like "Positive"', () => {
    const lab = makeLabResult({
      components: [makeComponent({ value: 'Positive', unit: '' })],
    });
    const result = mapLabResultToFHIR(lab);
    const obs = result.observations[0];

    expect(obs.valueString).toBe('Positive');
    expect(obs.valueQuantity).toBeUndefined();
  });

  it('should use valueString for empty value', () => {
    const lab = makeLabResult({
      components: [makeComponent({ value: '', unit: '' })],
    });
    const result = mapLabResultToFHIR(lab);

    expect(result.observations[0].valueString).toBe('');
    expect(result.observations[0].valueQuantity).toBeUndefined();
  });

  // ─── Reference range parsing ───────────────────────────────────

  it('should parse "4.5-11.0" into low and high', () => {
    const result = mapLabResultToFHIR(makeLabResult());
    const range = result.observations[0].referenceRange;

    expect(range).toHaveLength(1);
    expect(range![0].low!.value).toBe(4.5);
    expect(range![0].high!.value).toBe(11.0);
    expect(range![0].text).toBe('4.5-11.0');
  });

  it('should parse "<200" into high only', () => {
    const lab = makeLabResult({
      components: [makeComponent({ referenceRange: '<200' })],
    });
    const result = mapLabResultToFHIR(lab);
    const range = result.observations[0].referenceRange![0];

    expect(range.low).toBeUndefined();
    expect(range.high!.value).toBe(200);
    expect(range.text).toBe('<200');
  });

  it('should parse ">40" into low only', () => {
    const lab = makeLabResult({
      components: [makeComponent({ referenceRange: '>40' })],
    });
    const result = mapLabResultToFHIR(lab);
    const range = result.observations[0].referenceRange![0];

    expect(range.low!.value).toBe(40);
    expect(range.high).toBeUndefined();
    expect(range.text).toBe('>40');
  });

  it('should handle unparseable range as text only', () => {
    const lab = makeLabResult({
      components: [makeComponent({ referenceRange: 'Negative' })],
    });
    const result = mapLabResultToFHIR(lab);
    const range = result.observations[0].referenceRange![0];

    expect(range.text).toBe('Negative');
    expect(range.low).toBeUndefined();
    expect(range.high).toBeUndefined();
  });

  it('should omit referenceRange when empty string', () => {
    const lab = makeLabResult({
      components: [makeComponent({ referenceRange: '' })],
    });
    const result = mapLabResultToFHIR(lab);

    expect(result.observations[0].referenceRange).toBeUndefined();
  });

  // ─── Flag / interpretation mapping ─────────────────────────────

  const INTERP_SYSTEM = 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation';

  it('should map flag "H" to High interpretation', () => {
    const lab = makeLabResult({
      components: [makeComponent({ flag: 'H' })],
    });
    const result = mapLabResultToFHIR(lab);
    const interp = result.observations[0].interpretation;

    expect(interp).toHaveLength(1);
    expect(interp![0].coding![0].system).toBe(INTERP_SYSTEM);
    expect(interp![0].coding![0].code).toBe('H');
    expect(interp![0].coding![0].display).toBe('High');
  });

  it('should map flag "L" to Low interpretation', () => {
    const lab = makeLabResult({
      components: [makeComponent({ flag: 'L' })],
    });
    const interp = mapLabResultToFHIR(lab).observations[0].interpretation;

    expect(interp![0].coding![0].code).toBe('L');
    expect(interp![0].coding![0].display).toBe('Low');
  });

  it('should map flag "HH" to Critical high', () => {
    const lab = makeLabResult({
      components: [makeComponent({ flag: 'HH' })],
    });
    const interp = mapLabResultToFHIR(lab).observations[0].interpretation;

    expect(interp![0].coding![0].code).toBe('HH');
    expect(interp![0].coding![0].display).toBe('Critical high');
  });

  it('should map flag "LL" to Critical low', () => {
    const lab = makeLabResult({
      components: [makeComponent({ flag: 'LL' })],
    });
    const interp = mapLabResultToFHIR(lab).observations[0].interpretation;

    expect(interp![0].coding![0].code).toBe('LL');
    expect(interp![0].coding![0].display).toBe('Critical low');
  });

  it('should map flag "N" to Normal', () => {
    const interp = mapLabResultToFHIR(makeLabResult()).observations[0].interpretation;

    expect(interp![0].coding![0].code).toBe('N');
    expect(interp![0].coding![0].display).toBe('Normal');
  });

  it('should map flag "A" to Abnormal', () => {
    const lab = makeLabResult({
      components: [makeComponent({ flag: 'A' })],
    });
    const interp = mapLabResultToFHIR(lab).observations[0].interpretation;

    expect(interp![0].coding![0].code).toBe('A');
    expect(interp![0].coding![0].display).toBe('Abnormal');
  });

  it('should omit interpretation when flag is empty', () => {
    const lab = makeLabResult({
      components: [makeComponent({ flag: '' })],
    });
    const result = mapLabResultToFHIR(lab);

    expect(result.observations[0].interpretation).toBeUndefined();
  });

  // ─── Dates ─────────────────────────────────────────────────────

  it('should set effectiveDateTime from testDateTime and issued from receivedAt', () => {
    const result = mapLabResultToFHIR(makeLabResult());
    const obs = result.observations[0];

    expect(obs.effectiveDateTime).toBe('2026-03-05T10:30:00Z');
    expect(obs.issued).toBe('2026-03-05T10:30:05Z');
  });

  // ─── LIS Extensions ───────────────────────────────────────────

  it('should include lis-imported extension as true', () => {
    const result = mapLabResultToFHIR(makeLabResult());
    const ext = result.observations[0].extension!;
    const imported = ext.find((e) => e.url === LIS_EXTENSIONS.IMPORTED);

    expect(imported).toBeDefined();
    expect(imported!.valueBoolean).toBe(true);
  });

  it('should include lis-import-time extension with current ISO timestamp', () => {
    const result = mapLabResultToFHIR(makeLabResult());
    const ext = result.observations[0].extension!;
    const importTime = ext.find((e) => e.url === LIS_EXTENSIONS.IMPORT_TIME);

    expect(importTime).toBeDefined();
    expect(importTime!.valueDateTime).toBe('2026-03-05T12:00:00.000Z');
  });

  it('should include lis-protocol extension', () => {
    const lab = makeLabResult();
    const result = mapLabResultToFHIR(lab);
    const ext = result.observations[0].extension!;
    const protocol = ext.find((e) => e.url === LIS_EXTENSIONS.PROTOCOL);

    expect(protocol).toBeDefined();
    // Protocol comes from analyzerId mapping — the function uses "astm" as default
    expect(protocol!.valueString).toBeTruthy();
  });

  it('should include lis-barcode extension with specimen barcode', () => {
    const result = mapLabResultToFHIR(makeLabResult());
    const ext = result.observations[0].extension!;
    const barcode = ext.find((e) => e.url === LIS_EXTENSIONS.BARCODE);

    expect(barcode).toBeDefined();
    expect(barcode!.valueString).toBe('14829365');
  });

  it('should include lis-message-id extension', () => {
    const result = mapLabResultToFHIR(makeLabResult());
    const ext = result.observations[0].extension!;
    const msgId = ext.find((e) => e.url === LIS_EXTENSIONS.MESSAGE_ID);

    expect(msgId).toBeDefined();
    expect(msgId!.valueString).toBe('MSG-001');
  });

  // ─── Optional references (specimen, serviceRequest) ────────────

  it('should set specimen reference when specimenRef is provided', () => {
    const result = mapLabResultToFHIR(makeLabResult(), 'Specimen/abc123');
    const obs = result.observations[0];

    expect(obs.specimen).toEqual({ reference: 'Specimen/abc123' });
  });

  it('should omit specimen when specimenRef is not provided', () => {
    const result = mapLabResultToFHIR(makeLabResult());

    expect(result.observations[0].specimen).toBeUndefined();
  });

  it('should set basedOn when serviceRequestRef is provided', () => {
    const result = mapLabResultToFHIR(makeLabResult(), undefined, 'ServiceRequest/def456');
    const obs = result.observations[0];

    expect(obs.basedOn).toEqual([{ reference: 'ServiceRequest/def456' }]);
  });

  it('should omit basedOn when serviceRequestRef is not provided', () => {
    const result = mapLabResultToFHIR(makeLabResult());

    expect(result.observations[0].basedOn).toBeUndefined();
  });

  // ─── DiagnosticReport ──────────────────────────────────────────

  it('should create a DiagnosticReport with status preliminary', () => {
    const result = mapLabResultToFHIR(makeLabResult());

    expect(result.diagnosticReport.status).toBe('preliminary');
  });

  it('should set LAB category on DiagnosticReport', () => {
    const result = mapLabResultToFHIR(makeLabResult());

    expect(result.diagnosticReport.category).toEqual([
      {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/v2-0074',
            code: 'LAB',
            display: 'Laboratory',
          },
        ],
      },
    ]);
  });

  it('should set code.text on DiagnosticReport from analyzerId', () => {
    const result = mapLabResultToFHIR(makeLabResult());

    expect(result.diagnosticReport.code.text).toBeTruthy();
  });

  it('should reference all Observations in DiagnosticReport.result', () => {
    const lab = makeLabResult({
      components: [
        makeComponent({ testCode: 'WBC' }),
        makeComponent({ testCode: 'RBC', testName: 'Red Blood Cell Count' }),
        makeComponent({ testCode: 'HGB', testName: 'Hemoglobin' }),
      ],
    });
    const result = mapLabResultToFHIR(lab);

    expect(result.diagnosticReport.result).toHaveLength(3);
    // Each reference should be a urn:uuid: placeholder
    for (const ref of result.diagnosticReport.result!) {
      expect(ref.reference).toMatch(/^urn:uuid:/);
    }
  });

  it('should set specimen on DiagnosticReport when specimenRef is provided', () => {
    const result = mapLabResultToFHIR(makeLabResult(), 'Specimen/abc123');

    expect(result.diagnosticReport.specimen).toEqual([{ reference: 'Specimen/abc123' }]);
  });

  it('should omit specimen on DiagnosticReport when not provided', () => {
    const result = mapLabResultToFHIR(makeLabResult());

    expect(result.diagnosticReport.specimen).toBeUndefined();
  });

  it('should set basedOn on DiagnosticReport when serviceRequestRef is provided', () => {
    const result = mapLabResultToFHIR(makeLabResult(), undefined, 'ServiceRequest/def456');

    expect(result.diagnosticReport.basedOn).toEqual([{ reference: 'ServiceRequest/def456' }]);
  });

  it('should set effectiveDateTime and issued on DiagnosticReport', () => {
    const result = mapLabResultToFHIR(makeLabResult());

    expect(result.diagnosticReport.effectiveDateTime).toBe('2026-03-05T10:30:00Z');
    expect(result.diagnosticReport.issued).toBe('2026-03-05T10:30:05Z');
  });

  // ─── Edge cases ────────────────────────────────────────────────

  it('should handle a LabResult with zero components', () => {
    const lab = makeLabResult({ components: [] });
    const result = mapLabResultToFHIR(lab);

    expect(result.observations).toHaveLength(0);
    expect(result.diagnosticReport.result).toHaveLength(0);
  });

  it('should set both specimenRef and serviceRequestRef when both provided', () => {
    const result = mapLabResultToFHIR(
      makeLabResult(),
      'Specimen/abc123',
      'ServiceRequest/def456'
    );
    const obs = result.observations[0];

    expect(obs.specimen).toEqual({ reference: 'Specimen/abc123' });
    expect(obs.basedOn).toEqual([{ reference: 'ServiceRequest/def456' }]);
    expect(result.diagnosticReport.specimen).toEqual([{ reference: 'Specimen/abc123' }]);
    expect(result.diagnosticReport.basedOn).toEqual([{ reference: 'ServiceRequest/def456' }]);
  });

  it('should handle reference range with spaces like "4.5 - 11.0"', () => {
    const lab = makeLabResult({
      components: [makeComponent({ referenceRange: '4.5 - 11.0' })],
    });
    const result = mapLabResultToFHIR(lab);
    const range = result.observations[0].referenceRange![0];

    expect(range.low!.value).toBe(4.5);
    expect(range.high!.value).toBe(11.0);
  });

  it('should handle reference range "< 200" with space', () => {
    const lab = makeLabResult({
      components: [makeComponent({ referenceRange: '< 200' })],
    });
    const result = mapLabResultToFHIR(lab);
    const range = result.observations[0].referenceRange![0];

    expect(range.high!.value).toBe(200);
    expect(range.low).toBeUndefined();
  });

  it('should handle reference range "> 40" with space', () => {
    const lab = makeLabResult({
      components: [makeComponent({ referenceRange: '> 40' })],
    });
    const result = mapLabResultToFHIR(lab);
    const range = result.observations[0].referenceRange![0];

    expect(range.low!.value).toBe(40);
    expect(range.high).toBeUndefined();
  });

  it('should generate unique urn:uuid identifiers for each Observation', () => {
    const lab = makeLabResult({
      components: [
        makeComponent({ testCode: 'WBC' }),
        makeComponent({ testCode: 'RBC', testName: 'Red Blood Cell Count' }),
      ],
    });
    const result = mapLabResultToFHIR(lab);
    const ids = result.observations.map((o) => o.id);

    expect(new Set(ids).size).toBe(ids.length);
  });
});
