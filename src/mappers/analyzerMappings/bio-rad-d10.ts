/**
 * Bio-Rad D-10 analyzer mapping — HbA1c and hemoglobin variants.
 *
 * The D-10 is a dedicated HPLC system for hemoglobin analysis. It reports
 * results as chromatographic peaks. Test codes use named peak identifiers
 * in ASTM format like ^^^A1c^AREA, ^^^A2^AREA, ^^^F^AREA.
 *
 * Keys are peak names as they appear in the ASTM test ID (after stripping ^^^).
 */
import type { AnalyzerMapping } from './types.js';

export const bioRadD10Mapping: AnalyzerMapping = {
  'A1c':   { loinc: '4548-4', display: 'Hemoglobin A1c/Hemoglobin.total in Blood', unit: '%', defaultReferenceRange: '4.0-6.0' },
  'A1c_IFCC': { loinc: '59261-8', display: 'Hemoglobin A1c/Hemoglobin.total in Blood by IFCC', unit: 'mmol/mol', defaultReferenceRange: '20-42' },
  'A2':    { loinc: '4551-8', display: 'Hemoglobin A2/Hemoglobin.total in Blood', unit: '%', defaultReferenceRange: '2.0-3.3' },
  'F':     { loinc: '4576-5', display: 'Hemoglobin F/Hemoglobin.total in Blood', unit: '%', defaultReferenceRange: '<1.0' },
  'S':     { loinc: '35499-4', display: 'Hemoglobin S/Hemoglobin.total in Blood', unit: '%', defaultReferenceRange: '0' },
  'C':     { loinc: '30350-3', display: 'Hemoglobin C/Hemoglobin.total in Blood', unit: '%', defaultReferenceRange: '0' },
};
