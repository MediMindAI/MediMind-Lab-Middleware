/**
 * Integration test: ASTM pipeline.
 *
 * Feeds the Sysmex CBC fixture through the full chain:
 *   ASTM parser -> result mapper (with sysmex-xn550 mapping) -> FHIR mapper
 *
 * Verifies that the output FHIR resources (Observations + DiagnosticReport)
 * have correct LOINC codes, values, reference ranges, and structure.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseASTMMessage } from '../../src/protocols/astm/parser.js';
import { mapASTMToLabResults } from '../../src/mappers/resultMapper.js';
import { mapLabResultToFHIR } from '../../src/mappers/fhirMapper.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Load the Sysmex CBC fixture (strip comments, split into frame lines) */
function loadSysmexFixture(): string[] {
  const raw = readFileSync(
    resolve(__dirname, '../../src/simulators/fixtures/astm/sysmex-cbc.txt'),
    'utf-8'
  );
  return raw
    .split('\n')
    .filter((l) => l.length > 0 && !l.startsWith('#'));
}

describe('ASTM Pipeline Integration', () => {
  const frames = loadSysmexFixture();
  const parsed = parseASTMMessage(frames);
  const labResults = mapASTMToLabResults(parsed, 'sysmex-xn550');

  it('parser produces one patient with one order', () => {
    expect(parsed.patients).toHaveLength(1);
    expect(parsed.patients[0].orders).toHaveLength(1);
  });

  it('result mapper produces exactly one LabResult with 20 components', () => {
    expect(labResults).toHaveLength(1);
    expect(labResults[0].components).toHaveLength(20);
  });

  it('specimen barcode is extracted correctly', () => {
    expect(labResults[0].specimenBarcode).toBe('12345678');
  });

  it('patient info is extracted', () => {
    expect(labResults[0].patientId).toContain('');
    // Patient name from ASTM P record
    expect(labResults[0].patientName).toBeTruthy();
  });

  it('WBC component has correct value and enriched display name', () => {
    const wbc = labResults[0].components.find((c) => c.testCode === 'WBC');
    expect(wbc).toBeDefined();
    expect(wbc!.value).toBe('7.45');
    expect(wbc!.unit).toBe('10*3/uL');
    expect(wbc!.referenceRange).toBe('4.5-11.0');
    expect(wbc!.flag).toBe('N');
    // Enriched from sysmex-xn550 mapping
    expect(wbc!.testName).toContain('Leukocytes');
  });

  it('PLT component has correct value', () => {
    const plt = labResults[0].components.find((c) => c.testCode === 'PLT');
    expect(plt).toBeDefined();
    expect(plt!.value).toBe('238');
    expect(plt!.unit).toBe('10*3/uL');
  });

  // ── FHIR mapping ──────────────────────────────────────────────

  describe('FHIR mapper output', () => {
    const fhir = mapLabResultToFHIR(labResults[0]);

    it('creates 20 Observations (one per component)', () => {
      expect(fhir.observations).toHaveLength(20);
    });

    it('creates one DiagnosticReport', () => {
      expect(fhir.diagnosticReport).toBeDefined();
      expect(fhir.diagnosticReport.resourceType).toBe('DiagnosticReport');
    });

    it('DiagnosticReport references all 20 Observations', () => {
      expect(fhir.diagnosticReport.result).toHaveLength(20);
    });

    it('WBC Observation has valueQuantity with correct numeric value', () => {
      const wbcObs = fhir.observations.find(
        (o) => o.code?.coding?.[0]?.code === 'WBC'
      );
      expect(wbcObs).toBeDefined();
      expect(wbcObs!.valueQuantity?.value).toBe(7.45);
      expect(wbcObs!.valueQuantity?.unit).toBe('10*3/uL');
    });

    it('WBC Observation has parsed reference range with low and high', () => {
      const wbcObs = fhir.observations.find(
        (o) => o.code?.coding?.[0]?.code === 'WBC'
      );
      expect(wbcObs!.referenceRange).toHaveLength(1);
      expect(wbcObs!.referenceRange![0].low?.value).toBe(4.5);
      expect(wbcObs!.referenceRange![0].high?.value).toBe(11.0);
    });

    it('Observations have LIS extension for imported=true', () => {
      const obs = fhir.observations[0];
      const imported = obs.extension?.find((e) =>
        e.url.includes('lis-imported')
      );
      expect(imported).toBeDefined();
      expect(imported!.valueBoolean).toBe(true);
    });

    it('Observations have LIS barcode extension', () => {
      const obs = fhir.observations[0];
      const barcode = obs.extension?.find((e) =>
        e.url.includes('lis-barcode')
      );
      expect(barcode).toBeDefined();
      expect(barcode!.valueString).toBe('12345678');
    });

    it('all Observations have status preliminary', () => {
      for (const obs of fhir.observations) {
        expect(obs.status).toBe('preliminary');
      }
    });

    it('all Observations have laboratory category', () => {
      for (const obs of fhir.observations) {
        const cat = obs.category?.[0]?.coding?.[0];
        expect(cat?.code).toBe('laboratory');
      }
    });
  });
});
