/**
 * Integration test: BC-7600 pipeline.
 *
 * Feeds the Mindray BC-7600 fixture (5-part diff, 32 params) through the full chain:
 *   HL7v2 parser -> result mapper (with mindray-bc7600 mapping) -> FHIR mapper
 *
 * Verifies that all 32 parameters come through with correct LOINC codes, values,
 * flags, and that the FHIR output is properly structured.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseORU } from '../../src/protocols/hl7v2/parser.js';
import { mapHL7v2ToLabResults } from '../../src/mappers/resultMapper.js';
import { mapLabResultToFHIR } from '../../src/mappers/fhirMapper.js';
import { ResultPipeline, type PipelineDeps } from '../../src/pipeline/resultPipeline.js';
import type { LabResult } from '../../src/types/result.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Load the BC-7600 fixture (strip comments, join with CR) */
function loadBC7600Fixture(): string {
  const raw = readFileSync(
    resolve(__dirname, '../../src/simulators/fixtures/hl7v2/mindray-bc7600-cbc.hl7'),
    'utf-8',
  );
  return raw
    .split('\n')
    .filter((l) => l.length > 0 && !l.startsWith('#'))
    .join('\r');
}

describe('BC-7600 Pipeline Integration', () => {
  const rawMessage = loadBC7600Fixture();
  const parsed = parseORU(rawMessage);
  const labResults = mapHL7v2ToLabResults(parsed, 'mindray-bc7600');

  // ── Parser ────────────────────────────────────────────────

  it('parser extracts MSH, PID, OBR, and 32 OBX segments', () => {
    expect(parsed.msh).toBeDefined();
    expect(parsed.pid).toBeDefined();
    expect(parsed.obr).toBeDefined();
    expect(parsed.obx.length).toBe(32);
  });

  it('MSH identifies BC-7600 sending application', () => {
    expect(parsed.msh.sendingApplication).toBe('BC-7600');
  });

  // ── Result Mapper ─────────────────────────────────────────

  it('result mapper produces one LabResult with 32 components', () => {
    expect(labResults).toHaveLength(1);
    expect(labResults[0].components).toHaveLength(32);
  });

  it('specimen barcode is extracted (87654321)', () => {
    expect(labResults[0].specimenBarcode).toBe('87654321');
  });

  it('patient info is extracted from PID', () => {
    expect(labResults[0].patientId).toContain('PAT002');
    expect(labResults[0].patientName).toContain('KAPANADZE');
  });

  it('analyzer ID is mindray-bc7600', () => {
    expect(labResults[0].analyzerId).toBe('mindray-bc7600');
  });

  // ── 5-Part Differential Values ────────────────────────────

  it('WBC is HIGH (13.2)', () => {
    const wbc = labResults[0].components.find((c) => c.testCode === 'WBC');
    expect(wbc).toBeDefined();
    expect(wbc!.value).toBe('13.2');
    expect(wbc!.flag).toBe('H');
  });

  it('5-part differential: NEU, LYM, MON, EOS, BAS all present', () => {
    const codes = labResults[0].components.map((c) => c.testCode);
    expect(codes).toContain('NEU#');
    expect(codes).toContain('NEU%');
    expect(codes).toContain('LYM#');
    expect(codes).toContain('LYM%');
    expect(codes).toContain('MON#');
    expect(codes).toContain('MON%');
    expect(codes).toContain('EOS#');
    expect(codes).toContain('EOS%');
    expect(codes).toContain('BAS#');
    expect(codes).toContain('BAS%');
  });

  it('NEU# is HIGH (8.9, ref 2.0-7.0)', () => {
    const neu = labResults[0].components.find((c) => c.testCode === 'NEU#');
    expect(neu!.value).toBe('8.9');
    expect(neu!.flag).toBe('H');
  });

  it('EOS# is HIGH (0.7, ref 0.0-0.5)', () => {
    const eos = labResults[0].components.find((c) => c.testCode === 'EOS#');
    expect(eos!.value).toBe('0.7');
    expect(eos!.flag).toBe('H');
  });

  // ── Reticulocytes + NRBC + IMG ────────────────────────────

  it('reticulocyte parameters are present', () => {
    const codes = labResults[0].components.map((c) => c.testCode);
    expect(codes).toContain('RET#');
    expect(codes).toContain('RET%');
    expect(codes).toContain('IRF');
    expect(codes).toContain('NRBC#');
    expect(codes).toContain('NRBC%');
    expect(codes).toContain('IMG#');
    expect(codes).toContain('IMG%');
  });

  // ── CRP Module ────────────────────────────────────────────

  it('CRP is HIGH (12.4, ref 0.0-5.0)', () => {
    const crp = labResults[0].components.find((c) => c.testCode === 'CRP');
    expect(crp).toBeDefined();
    expect(crp!.value).toBe('12.4');
    expect(crp!.flag).toBe('H');
  });

  it('HS-CRP is present', () => {
    const hscrp = labResults[0].components.find((c) => c.testCode === 'HS-CRP');
    expect(hscrp).toBeDefined();
    expect(hscrp!.value).toBe('12.4');
  });

  // ── FHIR Mapper ───────────────────────────────────────────

  describe('FHIR mapper output', () => {
    const fhir = mapLabResultToFHIR(labResults[0]);

    it('creates 32 Observations', () => {
      expect(fhir.observations).toHaveLength(32);
    });

    it('DiagnosticReport references all 32 Observations', () => {
      expect(fhir.diagnosticReport.result).toHaveLength(32);
    });

    it('WBC Observation has LOINC 6690-2 and HIGH interpretation', () => {
      const wbcObs = fhir.observations.find(
        (o) => o.code?.coding?.[0]?.code === 'WBC',
      );
      expect(wbcObs).toBeDefined();
      // LOINC code is in the second coding entry (first is the proprietary code)
      const loinc = wbcObs!.code?.coding?.find((c) => c.code === '6690-2');
      expect(loinc).toBeDefined();
      const interp = wbcObs!.interpretation?.[0]?.coding?.[0];
      expect(interp?.code).toBe('H');
    });

    it('HGB Observation has LOW interpretation and value 105', () => {
      const hgbObs = fhir.observations.find(
        (o) => o.code?.coding?.[0]?.code === 'HGB',
      );
      expect(hgbObs!.valueQuantity?.value).toBe(105);
      const interp = hgbObs!.interpretation?.[0]?.coding?.[0];
      expect(interp?.code).toBe('L');
    });

    it('PLT Observation has NORMAL interpretation', () => {
      const pltObs = fhir.observations.find(
        (o) => o.code?.coding?.[0]?.code === 'PLT',
      );
      const interp = pltObs!.interpretation?.[0]?.coding?.[0];
      expect(interp?.code).toBe('N');
    });

    it('all Observations have LIS imported extension', () => {
      for (const obs of fhir.observations) {
        const ext = obs.extension?.find((e) => e.url.includes('lis-imported'));
        expect(ext?.valueBoolean).toBe(true);
      }
    });

    it('CRP Observation has LOINC 1988-5', () => {
      const crpObs = fhir.observations.find(
        (o) => o.code?.coding?.[0]?.code === 'CRP',
      );
      expect(crpObs).toBeDefined();
      const loinc = crpObs!.code?.coding?.find((c) => c.system?.includes('loinc'));
      expect(loinc?.code).toBe('1988-5');
    });
  });

  // ── Full Pipeline ─────────────────────────────────────────

  describe('through ResultPipeline', () => {
    let deps: PipelineDeps;
    let pipeline: ResultPipeline;
    let captured: LabResult[];

    beforeEach(() => {
      captured = [];
      deps = {
        resultSender: {
          sendLabResult: vi.fn(async (lr: LabResult) => {
            captured.push(lr);
            return { success: true, resourceIds: ['Observation/bc7600-1'] };
          }),
        },
        queue: { enqueue: vi.fn().mockReturnValue(1), markSent: vi.fn() },
        messageLogger: { logMessage: vi.fn().mockReturnValue(1) },
      };
      pipeline = new ResultPipeline(deps);
    });

    it('processes BC-7600 HL7v2 message end-to-end', async () => {
      await pipeline.processHL7v2('mindray-bc7600', rawMessage);

      expect(deps.resultSender.sendLabResult).toHaveBeenCalledOnce();
      expect(captured).toHaveLength(1);
      expect(captured[0].analyzerId).toBe('mindray-bc7600');
      expect(captured[0].components).toHaveLength(32);
    });

    it('queues result on sender failure', async () => {
      (deps.resultSender.sendLabResult as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: false,
        error: 'Medplum offline',
      });

      await pipeline.processHL7v2('mindray-bc7600', rawMessage);

      expect(deps.queue.enqueue).toHaveBeenCalled();
    });

    it('logs the message', async () => {
      await pipeline.processHL7v2('mindray-bc7600', rawMessage);

      expect(deps.messageLogger.logMessage).toHaveBeenCalled();
    });
  });
});
