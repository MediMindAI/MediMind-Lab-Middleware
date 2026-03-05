/**
 * Roche Hitachi 917/7180 analyzer mapping — clinical chemistry.
 *
 * The Hitachi uses channel numbers (1-120) as test identifiers instead of
 * Roche ACN codes. Channel assignments are set during installation and
 * may vary between instruments. These are the common default assignments.
 *
 * Keys are channel numbers (as strings) matching ASTM ^^^channel format.
 */
import type { AnalyzerMapping } from './types.js';

export const rocheHitachiMapping: AnalyzerMapping = {
  '1':  { loinc: '2345-7', display: 'Glucose [Mass/volume] in Serum or Plasma', unit: 'mg/dL', defaultReferenceRange: '70-100' },
  '2':  { loinc: '3094-0', display: 'Urea nitrogen [Mass/volume] in Serum or Plasma', unit: 'mg/dL', defaultReferenceRange: '6-24' },
  '3':  { loinc: '2160-0', display: 'Creatinine [Mass/volume] in Serum or Plasma', unit: 'mg/dL', defaultReferenceRange: '0.74-1.35' },
  '4':  { loinc: '3084-1', display: 'Uric acid [Mass/volume] in Serum or Plasma', unit: 'mg/dL', defaultReferenceRange: '3.4-7.0' },
  '5':  { loinc: '2885-2', display: 'Total protein [Mass/volume] in Serum or Plasma', unit: 'g/dL', defaultReferenceRange: '6.0-8.3' },
  '6':  { loinc: '1751-7', display: 'Albumin [Mass/volume] in Serum or Plasma', unit: 'g/dL', defaultReferenceRange: '3.4-5.4' },
  '7':  { loinc: '1975-2', display: 'Bilirubin.total [Mass/volume] in Serum or Plasma', unit: 'mg/dL', defaultReferenceRange: '0.1-1.2' },
  '8':  { loinc: '1968-7', display: 'Bilirubin.direct [Mass/volume] in Serum or Plasma', unit: 'mg/dL', defaultReferenceRange: '0.0-0.3' },
  '9':  { loinc: '1742-6', display: 'ALT [Enzymatic activity/volume] in Serum or Plasma', unit: 'U/L', defaultReferenceRange: '7-56' },
  '10': { loinc: '1920-8', display: 'AST [Enzymatic activity/volume] in Serum or Plasma', unit: 'U/L', defaultReferenceRange: '10-40' },
  '11': { loinc: '6768-6', display: 'Alkaline phosphatase [Enzymatic activity/volume] in Serum or Plasma', unit: 'U/L', defaultReferenceRange: '44-147' },
  '12': { loinc: '2324-2', display: 'GGT [Enzymatic activity/volume] in Serum or Plasma', unit: 'U/L', defaultReferenceRange: '8-61' },
  '13': { loinc: '2532-0', display: 'LDH [Enzymatic activity/volume] in Serum or Plasma', unit: 'U/L', defaultReferenceRange: '120-246' },
  '14': { loinc: '2157-6', display: 'Creatine kinase [Enzymatic activity/volume] in Serum or Plasma', unit: 'U/L', defaultReferenceRange: '39-308' },
  '15': { loinc: '1798-8', display: 'Amylase [Enzymatic activity/volume] in Serum or Plasma', unit: 'U/L', defaultReferenceRange: '13-53' },
  '16': { loinc: '3040-3', display: 'Lipase [Enzymatic activity/volume] in Serum or Plasma', unit: 'U/L', defaultReferenceRange: '13-60' },
  '17': { loinc: '2093-3', display: 'Cholesterol [Mass/volume] in Serum or Plasma', unit: 'mg/dL', defaultReferenceRange: '<200' },
  '18': { loinc: '2571-8', display: 'Triglycerides [Mass/volume] in Serum or Plasma', unit: 'mg/dL', defaultReferenceRange: '<150' },
  '19': { loinc: '2085-9', display: 'HDL Cholesterol [Mass/volume] in Serum or Plasma', unit: 'mg/dL', defaultReferenceRange: '>40' },
  '20': { loinc: '2089-1', display: 'LDL Cholesterol [Mass/volume] in Serum or Plasma', unit: 'mg/dL', defaultReferenceRange: '<100' },
  '21': { loinc: '17861-6', display: 'Calcium [Mass/volume] in Serum or Plasma', unit: 'mg/dL', defaultReferenceRange: '8.6-10.2' },
  '22': { loinc: '2777-1', display: 'Phosphorus [Mass/volume] in Serum or Plasma', unit: 'mg/dL', defaultReferenceRange: '2.5-4.5' },
  '23': { loinc: '19123-9', display: 'Magnesium [Mass/volume] in Serum or Plasma', unit: 'mg/dL', defaultReferenceRange: '1.7-2.2' },
  '24': { loinc: '2498-4', display: 'Iron [Mass/volume] in Serum or Plasma', unit: 'ug/dL', defaultReferenceRange: '65-175' },
  '25': { loinc: '2500-7', display: 'TIBC [Mass/volume] in Serum or Plasma', unit: 'ug/dL', defaultReferenceRange: '250-400' },
  '26': { loinc: '1988-5', display: 'CRP [Mass/volume] in Serum or Plasma', unit: 'mg/L', defaultReferenceRange: '<10' },
  'Na': { loinc: '2951-2', display: 'Sodium [Moles/volume] in Serum or Plasma', unit: 'mmol/L', defaultReferenceRange: '136-145' },
  'K':  { loinc: '2823-3', display: 'Potassium [Moles/volume] in Serum or Plasma', unit: 'mmol/L', defaultReferenceRange: '3.5-5.1' },
  'Cl': { loinc: '2075-0', display: 'Chloride [Moles/volume] in Serum or Plasma', unit: 'mmol/L', defaultReferenceRange: '98-106' },
};
