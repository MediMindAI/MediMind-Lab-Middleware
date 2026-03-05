/**
 * Integration test: HL7v2 pipeline.
 *
 * Feeds the Mindray CBC fixture through the full chain:
 *   HL7v2 parser -> result mapper (with mindray-bc3510 mapping) -> FHIR mapper
 *
 * Verifies that the output FHIR resources have correct codes, values, flags,
 * and that abnormal flags (H, L) are properly translated to FHIR interpretations.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseORU } from '../../src/protocols/hl7v2/parser.js';
import { mapHL7v2ToLabResults } from '../../src/mappers/resultMapper.js';
import { mapLabResultToFHIR } from '../../src/mappers/fhirMapper.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Load the Mindray CBC fixture (strip comments, join with CR) */
function loadMindrayFixture(): string {
  const raw = readFileSync(
    resolve(__dirname, '../../src/simulators/fixtures/hl7v2/mindray-cbc.hl7'),
    'utf-8'
  );
  return raw
    .split('\n')
    .filter((l) => l.length > 0 && !l.startsWith('#'))
    .join('\r');
}

describe('HL7v2 Pipeline Integration', () => {
  const rawMessage = loadMindrayFixture();
  const parsed = parseORU(rawMessage);
  const labResults = mapHL7v2ToLabResults(parsed, 'mindray-bc3510');

  it('parser extracts MSH, PID, OBR, and OBX segments', () => {
    expect(parsed.msh).toBeDefined();
    expect(parsed.pid).toBeDefined();
    expect(parsed.obr).toBeDefined();
    expect(parsed.obx.length).toBe(19);
  });

  it('result mapper produces exactly one LabResult with 19 components', () => {
    expect(labResults).toHaveLength(1);
    expect(labResults[0].components).toHaveLength(19);
  });

  it('specimen barcode is extracted from OBR filler order number', () => {
    expect(labResults[0].specimenBarcode).toBe('12345678');
  });

  it('patient info is extracted from PID segment', () => {
    expect(labResults[0].patientId).toContain('PAT001');
    expect(labResults[0].patientName).toContain('BERIDZE');
  });

  it('WBC has HIGH flag and correct value', () => {
    const wbc = labResults[0].components.find((c) => c.testCode === 'WBC');
    expect(wbc).toBeDefined();
    expect(wbc!.value).toBe('12.8');
    expect(wbc!.flag).toBe('H');
  });

  it('HGB has LOW flag', () => {
    const hgb = labResults[0].components.find((c) => c.testCode === 'HGB');
    expect(hgb).toBeDefined();
    expect(hgb!.value).toBe('11.2');
    expect(hgb!.flag).toBe('L');
  });

  it('PLT has NORMAL flag', () => {
    const plt = labResults[0].components.find((c) => c.testCode === 'PLT');
    expect(plt).toBeDefined();
    expect(plt!.value).toBe('195');
    expect(plt!.flag).toBe('N');
  });

  // ── FHIR mapping ──────────────────────────────────────────────

  describe('FHIR mapper output', () => {
    const fhir = mapLabResultToFHIR(labResults[0]);

    it('creates 19 Observations', () => {
      expect(fhir.observations).toHaveLength(19);
    });

    it('DiagnosticReport references all 19 Observations', () => {
      expect(fhir.diagnosticReport.result).toHaveLength(19);
    });

    it('WBC Observation has HIGH interpretation', () => {
      const wbcObs = fhir.observations.find(
        (o) => o.code?.coding?.[0]?.code === 'WBC'
      );
      expect(wbcObs).toBeDefined();
      const interp = wbcObs!.interpretation?.[0]?.coding?.[0];
      expect(interp?.code).toBe('H');
      expect(interp?.display).toBe('High');
    });

    it('HGB Observation has LOW interpretation', () => {
      const hgbObs = fhir.observations.find(
        (o) => o.code?.coding?.[0]?.code === 'HGB'
      );
      expect(hgbObs).toBeDefined();
      const interp = hgbObs!.interpretation?.[0]?.coding?.[0];
      expect(interp?.code).toBe('L');
    });

    it('PLT Observation has NORMAL interpretation', () => {
      const pltObs = fhir.observations.find(
        (o) => o.code?.coding?.[0]?.code === 'PLT'
      );
      expect(pltObs).toBeDefined();
      const interp = pltObs!.interpretation?.[0]?.coding?.[0];
      expect(interp?.code).toBe('N');
    });

    it('WBC Observation has valueQuantity = 12.8', () => {
      const wbcObs = fhir.observations.find(
        (o) => o.code?.coding?.[0]?.code === 'WBC'
      );
      expect(wbcObs!.valueQuantity?.value).toBe(12.8);
    });

    it('all Observations have LIS imported extension', () => {
      for (const obs of fhir.observations) {
        const ext = obs.extension?.find((e) => e.url.includes('lis-imported'));
        expect(ext?.valueBoolean).toBe(true);
      }
    });
  });
});
