/**
 * FHIR mapper — converts a standard LabResult into FHIR R4 resources.
 *
 * Think of this as a "document printer": it takes raw lab values (like "WBC = 7.5")
 * and packages them into official medical documents that any hospital system in the
 * world can read. Each test value becomes an Observation, and they all get bundled
 * into one DiagnosticReport envelope.
 */
import type { Observation, DiagnosticReport, Extension } from '@medplum/fhirtypes';
import type { LabResult, ComponentResult, ResultFlag } from '../types/result.js';
import { LIS_EXTENSIONS } from '../fhir/types.js';

/** The result of mapping one LabResult into FHIR resources */
export interface FHIRMappingResult {
  observations: Observation[];
  diagnosticReport: DiagnosticReport;
}

// ─── Constants ─────────────────────────────────────────────────

const OBSERVATION_CATEGORY_SYSTEM = 'http://terminology.hl7.org/CodeSystem/observation-category';
const DIAGNOSTIC_CATEGORY_SYSTEM = 'http://terminology.hl7.org/CodeSystem/v2-0074';
const INTERPRETATION_SYSTEM = 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation';
const UCUM_SYSTEM = 'http://unitsofmeasure.org';

const INTERPRETATION_DISPLAY: Record<string, string> = {
  N: 'Normal',
  L: 'Low',
  H: 'High',
  LL: 'Critical low',
  HH: 'Critical high',
  A: 'Abnormal',
};

// ─── Main export ───────────────────────────────────────────────

/**
 * Convert a LabResult into FHIR Observation resources + a DiagnosticReport.
 *
 * @param labResult - The standard lab result from the protocol parser
 * @param specimenRef - Optional FHIR reference (e.g., "Specimen/abc123")
 * @param serviceRequestRef - Optional FHIR reference (e.g., "ServiceRequest/def456")
 */
export function mapLabResultToFHIR(
  labResult: LabResult,
  specimenRef?: string,
  serviceRequestRef?: string
): FHIRMappingResult {
  const observations = labResult.components.map((comp) =>
    buildObservation(comp, labResult, specimenRef, serviceRequestRef)
  );

  const diagnosticReport = buildDiagnosticReport(
    labResult,
    observations,
    specimenRef,
    serviceRequestRef
  );

  return { observations, diagnosticReport };
}

// ─── Observation builder ───────────────────────────────────────

function buildObservation(
  comp: ComponentResult,
  lab: LabResult,
  specimenRef?: string,
  serviceRequestRef?: string
): Observation {
  const obs: Observation = {
    resourceType: 'Observation',
    id: generateUUID(),
    status: 'preliminary',
    category: [
      {
        coding: [{ system: OBSERVATION_CATEGORY_SYSTEM, code: 'laboratory', display: 'Laboratory' }],
        text: 'Laboratory',
      },
    ],
    code: {
      coding: [{ code: comp.testCode, display: comp.testName }],
      text: comp.testName,
    },
    effectiveDateTime: lab.testDateTime,
    issued: lab.receivedAt,
    extension: buildExtensions(lab),
  };

  // Value: numeric → valueQuantity, otherwise → valueString
  const numVal = parseFloat(comp.value);
  if (!isNaN(numVal) && comp.value.trim() !== '') {
    obs.valueQuantity = { value: numVal, unit: comp.unit, system: UCUM_SYSTEM };
  } else {
    obs.valueString = comp.value;
  }

  // Reference range
  const range = parseReferenceRange(comp.referenceRange, comp.unit);
  if (range) {
    obs.referenceRange = [range];
  }

  // Interpretation (abnormal flags)
  const interp = buildInterpretation(comp.flag);
  if (interp) {
    obs.interpretation = interp;
  }

  // Optional references
  if (specimenRef) {
    obs.specimen = { reference: specimenRef };
  }
  if (serviceRequestRef) {
    obs.basedOn = [{ reference: serviceRequestRef }];
  }

  return obs;
}

// ─── DiagnosticReport builder ──────────────────────────────────

function buildDiagnosticReport(
  lab: LabResult,
  observations: Observation[],
  specimenRef?: string,
  serviceRequestRef?: string
): DiagnosticReport {
  const report: DiagnosticReport = {
    resourceType: 'DiagnosticReport',
    status: 'preliminary',
    category: [
      {
        coding: [{ system: DIAGNOSTIC_CATEGORY_SYSTEM, code: 'LAB', display: 'Laboratory' }],
      },
    ],
    code: { text: lab.analyzerId || 'Laboratory Results' },
    result: observations.map((obs) => ({ reference: `urn:uuid:${obs.id}` })),
    effectiveDateTime: lab.testDateTime,
    issued: lab.receivedAt,
  };

  if (specimenRef) {
    report.specimen = [{ reference: specimenRef }];
  }
  if (serviceRequestRef) {
    report.basedOn = [{ reference: serviceRequestRef }];
  }

  return report;
}

// ─── Helpers ───────────────────────────────────────────────────

/** Build MediMind LIS extensions for an Observation */
function buildExtensions(lab: LabResult): Extension[] {
  const extensions: Extension[] = [
    { url: LIS_EXTENSIONS.IMPORTED, valueBoolean: true },
    { url: LIS_EXTENSIONS.IMPORT_TIME, valueDateTime: new Date().toISOString() },
    { url: LIS_EXTENSIONS.PROTOCOL, valueString: lab.analyzerId },
    { url: LIS_EXTENSIONS.BARCODE, valueString: lab.specimenBarcode },
  ];

  if (lab.messageId) {
    extensions.push({ url: LIS_EXTENSIONS.MESSAGE_ID, valueString: lab.messageId });
  }

  return extensions;
}

/** Map a ResultFlag to FHIR interpretation, or undefined if no flag */
function buildInterpretation(flag: ResultFlag): Observation['interpretation'] {
  if (!flag) return undefined;

  const display = INTERPRETATION_DISPLAY[flag] ?? flag;
  return [
    {
      coding: [{ system: INTERPRETATION_SYSTEM, code: flag, display }],
      text: display,
    },
  ];
}

/**
 * Parse a reference range string into FHIR referenceRange format.
 *
 * Handles: "4.5-11.0", "4.5 - 11.0", "<200", "< 200", ">40", "> 40",
 * and fallback to text-only for unparseable strings.
 */
function parseReferenceRange(
  raw: string,
  unit: string
): NonNullable<Observation['referenceRange']>[number] | undefined {
  if (!raw) return undefined;

  const trimmed = raw.trim();

  // Try "X-Y" pattern (e.g., "4.5-11.0" or "4.5 - 11.0")
  const rangeMatch = trimmed.match(/^([\d.]+)\s*-\s*([\d.]+)$/);
  if (rangeMatch) {
    const low = parseFloat(rangeMatch[1]);
    const high = parseFloat(rangeMatch[2]);
    return {
      low: { value: low, unit, system: UCUM_SYSTEM },
      high: { value: high, unit, system: UCUM_SYSTEM },
      text: raw,
    };
  }

  // Try "<X" pattern (e.g., "<200" or "< 200")
  const ltMatch = trimmed.match(/^<\s*([\d.]+)$/);
  if (ltMatch) {
    return {
      high: { value: parseFloat(ltMatch[1]), unit, system: UCUM_SYSTEM },
      text: raw,
    };
  }

  // Try ">X" pattern (e.g., ">40" or "> 40")
  const gtMatch = trimmed.match(/^>\s*([\d.]+)$/);
  if (gtMatch) {
    return {
      low: { value: parseFloat(gtMatch[1]), unit, system: UCUM_SYSTEM },
      text: raw,
    };
  }

  // Unparseable — keep raw text only
  return { text: raw };
}

/** Generate a simple UUID v4 for Observation IDs */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
