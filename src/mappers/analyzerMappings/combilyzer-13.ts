/**
 * Combilyzer 13 analyzer mapping — urine strip reader (13 parameters).
 *
 * The Combilyzer 13 uses short parameter codes (GLU, PRO, pH, etc.) as test
 * identifiers in its proprietary output format. Results are semi-quantitative
 * (Negative, Trace, 1+, 2+, 3+) for most parameters, with numeric values
 * for pH and specific gravity.
 *
 * Keys are parameter codes matching the Combilyzer parser output.
 */
import type { AnalyzerMapping } from './types.js';

export const combilyzer13Mapping: AnalyzerMapping = {
  'GLU': { loinc: '5792-7',  display: 'Glucose [Presence] in Urine by Test strip', unit: '' },
  'PRO': { loinc: '5804-0',  display: 'Protein [Presence] in Urine by Test strip', unit: '' },
  'BLD': { loinc: '5794-3',  display: 'Hemoglobin [Presence] in Urine by Test strip', unit: '' },
  'LEU': { loinc: '5799-2',  display: 'Leukocytes [Presence] in Urine by Test strip', unit: '' },
  'NIT': { loinc: '5802-4',  display: 'Nitrite [Presence] in Urine by Test strip', unit: '' },
  'KET': { loinc: '5797-6',  display: 'Ketones [Presence] in Urine by Test strip', unit: '' },
  'UBG': { loinc: '5818-0',  display: 'Urobilinogen [Presence] in Urine by Test strip', unit: '' },
  'BIL': { loinc: '5770-3',  display: 'Bilirubin [Presence] in Urine by Test strip', unit: '' },
  'pH':  { loinc: '5803-2',  display: 'pH of Urine by Test strip', unit: '' },
  'SG':  { loinc: '5811-5',  display: 'Specific gravity of Urine by Test strip', unit: '' },
  'ASC': { loinc: '5778-6',  display: 'Ascorbate [Presence] in Urine by Test strip', unit: '' },
  'CRE': { loinc: '30004-6', display: 'Creatinine [Mass/volume] in Urine by Test strip', unit: 'mg/dL' },
  'ALB': { loinc: '14957-5', display: 'Microalbumin [Mass/volume] in Urine', unit: 'mg/L' },
};
