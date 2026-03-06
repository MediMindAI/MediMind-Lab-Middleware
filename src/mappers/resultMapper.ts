/**
 * Result mapper — the "universal translator" for lab results.
 *
 * No matter which analyzer sent data (Sysmex via ASTM, Mindray via HL7v2,
 * or Combilyzer via its proprietary format), this module converts the
 * protocol-specific parsed output into a standard LabResult.
 *
 * It also enriches results by looking up test codes in the analyzer's
 * mapping dictionary — translating proprietary codes like "WBC" into
 * universal LOINC codes like "6690-2" with proper display names.
 */

import { randomUUID } from 'node:crypto';
import type { ASTMMessage, ASTMResult } from '../types/astm.js';
import type { ORUMessage, OBXSegment } from '../protocols/hl7v2/types.js';
import type { CombilyzerResult } from '../protocols/combilyzer/types.js';
import type { LabResult, ComponentResult, ResultFlag } from '../types/result.js';
import type { AnalyzerMapping } from './analyzerMappings/types.js';
import { getMappingForAnalyzer } from './analyzerMappings/index.js';

// ---------------------------------------------------------------------------
// Flag mapping — translate analyzer flags to our standard ResultFlag type
// ---------------------------------------------------------------------------

const KNOWN_FLAGS: Record<string, ResultFlag> = {
  'N': 'N',
  'H': 'H',
  'L': 'L',
  'HH': 'HH',
  'LL': 'LL',
  'A': 'A',
  '': '',
};

/** Map a raw abnormal flag string to a standard ResultFlag. */
function mapFlag(raw: string): ResultFlag {
  return KNOWN_FLAGS[raw] ?? 'A';
}

// ---------------------------------------------------------------------------
// Result status mapping — F/P/C to final/preliminary/corrected
// ---------------------------------------------------------------------------

function mapResultStatus(raw: string): ComponentResult['status'] {
  if (raw === 'C') return 'corrected';
  if (raw === 'P') return 'preliminary';
  return 'final'; // default to final (F or anything else)
}

// ---------------------------------------------------------------------------
// Component building — shared logic for mapping a single test result
// ---------------------------------------------------------------------------

function buildComponent(
  testCode: string,
  value: string,
  rawUnit: string,
  referenceRange: string,
  flag: ResultFlag,
  status: ComponentResult['status'],
  mapping: AnalyzerMapping | null,
): ComponentResult {
  const entry = mapping?.[testCode] ?? null;

  return {
    testCode,
    testName: entry?.display ?? testCode,
    value,
    unit: entry?.unit ?? rawUnit,
    referenceRange: referenceRange || entry?.defaultReferenceRange || '',
    flag,
    status,
    loincCode: entry?.loinc,
  };
}

// ---------------------------------------------------------------------------
// ASTM → LabResult
// ---------------------------------------------------------------------------

/**
 * Convert an ASTM parsed message into standard LabResult(s).
 *
 * One LabResult per order (an ASTM message can contain multiple patients
 * with multiple orders, each having multiple R records).
 */
export function mapASTMToLabResults(message: ASTMMessage, analyzerId: string): LabResult[] {
  const mapping = getMappingForAnalyzer(analyzerId);
  const results: LabResult[] = [];

  for (const patientEntry of message.patients) {
    for (const orderEntry of patientEntry.orders) {
      if (orderEntry.results.length === 0) continue;

      const components = orderEntry.results.map((r: ASTMResult) =>
        buildComponent(
          r.testCode,
          r.value,
          r.unit,
          r.referenceRange,
          mapFlag(r.abnormalFlag),
          mapResultStatus(r.resultStatus),
          mapping,
        ),
      );

      results.push({
        messageId: randomUUID(),
        analyzerId,
        specimenBarcode: orderEntry.order.specimenId,
        patientId: patientEntry.patient.patientId,
        patientName: patientEntry.patient.patientName,
        testDateTime: orderEntry.results[0].dateTimeOfTest || message.receivedAt,
        receivedAt: message.receivedAt,
        components,
        rawMessage: message.rawFrames.join('\n'),
        processingStatus: 'mapped',
      });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// HL7v2 → LabResult
// ---------------------------------------------------------------------------

/**
 * Convert an HL7v2 ORU^R01 message into standard LabResult(s).
 *
 * Extracts the test code from OBX.3 (observationId) by taking the part
 * before the "^" separator. Returns one LabResult (or empty if no OBX).
 */
export function mapHL7v2ToLabResults(message: ORUMessage, analyzerId: string): LabResult[] {
  if (message.obx.length === 0) return [];

  const mapping = getMappingForAnalyzer(analyzerId);

  const components = message.obx.map((obx: OBXSegment) => {
    const testCode = obx.observationId.split('^')[0];
    return buildComponent(
      testCode,
      obx.value,
      obx.units,
      obx.referenceRange,
      mapFlag(obx.abnormalFlags),
      mapResultStatus(obx.resultStatus),
      mapping,
    );
  });

  return [{
    messageId: randomUUID(),
    analyzerId,
    specimenBarcode: message.obr.specimenId,
    patientId: message.pid?.patientId ?? '',
    patientName: message.pid?.patientName ?? '',
    testDateTime: message.obr.observationDateTime || message.receivedAt,
    receivedAt: message.receivedAt,
    components,
    rawMessage: message.rawMessage,
    processingStatus: 'mapped',
  }];
}

// ---------------------------------------------------------------------------
// Combilyzer → LabResult
// ---------------------------------------------------------------------------

/**
 * Convert a Combilyzer urinalysis result into standard LabResult(s).
 *
 * The Combilyzer uses a simple boolean `abnormal` flag per parameter.
 * We map true → 'A' (abnormal) and false → '' (no flag).
 */
export function mapCombilyzerToLabResults(result: CombilyzerResult, analyzerId: string): LabResult[] {
  if (result.parameters.length === 0) return [];

  const mapping = getMappingForAnalyzer(analyzerId);

  const components = result.parameters.map((param) =>
    buildComponent(
      param.code,
      param.value,
      param.unit,
      '', // Combilyzer doesn't provide reference ranges
      param.abnormal ? 'A' : '',
      'final', // Combilyzer results are always final
      mapping,
    ),
  );

  return [{
    messageId: randomUUID(),
    analyzerId,
    specimenBarcode: result.specimenId,
    patientId: '',
    patientName: '',
    testDateTime: result.dateTime || result.receivedAt,
    receivedAt: result.receivedAt,
    components,
    rawMessage: result.rawOutput,
    processingStatus: 'mapped',
  }];
}
