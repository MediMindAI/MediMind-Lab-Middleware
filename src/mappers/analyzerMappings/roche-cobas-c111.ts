/**
 * Roche Cobas c 111 analyzer mapping -- clinical chemistry with 30 parameters.
 *
 * The cobas c111 is a compact chemistry analyzer that measures blood sugar,
 * kidney function, liver enzymes, cholesterol, and electrolytes. It uses
 * Roche ACN (Application Code Number) as test identifiers in the ASTM
 * result record's Universal Test ID field (^^^ACN format).
 *
 * Keys are ACN codes (strings) as they appear in ASTM messages.
 */
import type { AnalyzerMapping } from './types.js';

export const rocheCobasC111Mapping: AnalyzerMapping = {
  // -- Metabolic --
  '401': { loinc: '2345-7', display: 'Glucose [Mass/volume] in Serum or Plasma', unit: 'mg/dL', defaultReferenceRange: '70-100' },
  '402': { loinc: '2160-0', display: 'Creatinine [Mass/volume] in Serum or Plasma', unit: 'mg/dL', defaultReferenceRange: '0.74-1.35' },
  '404': { loinc: '3094-0', display: 'Urea nitrogen [Mass/volume] in Serum or Plasma', unit: 'mg/dL', defaultReferenceRange: '6-24' },
  '405': { loinc: '3084-1', display: 'Uric acid [Mass/volume] in Serum or Plasma', unit: 'mg/dL', defaultReferenceRange: '3.4-7.0' },

  // -- Proteins --
  '407': { loinc: '2885-2', display: 'Total protein [Mass/volume] in Serum or Plasma', unit: 'g/dL', defaultReferenceRange: '6.0-8.3' },
  '413': { loinc: '1751-7', display: 'Albumin [Mass/volume] in Serum or Plasma', unit: 'g/L', defaultReferenceRange: '34-54' },

  // -- Liver enzymes --
  '416': { loinc: '1742-6', display: 'ALT [Enzymatic activity/volume] in Serum or Plasma', unit: 'U/L', defaultReferenceRange: '7-56' },
  '417': { loinc: '1920-8', display: 'AST [Enzymatic activity/volume] in Serum or Plasma', unit: 'U/L', defaultReferenceRange: '10-40' },
  '418': { loinc: '6768-6', display: 'Alkaline phosphatase [Enzymatic activity/volume] in Serum or Plasma', unit: 'U/L', defaultReferenceRange: '44-147' },
  '685': { loinc: '2324-2', display: 'GGT [Enzymatic activity/volume] in Serum or Plasma', unit: 'U/L', defaultReferenceRange: '8-61' },

  // -- Other enzymes --
  '426': { loinc: '2532-0', display: 'LDH [Enzymatic activity/volume] in Serum or Plasma', unit: 'U/L', defaultReferenceRange: '120-246' },
  '429': { loinc: '2157-6', display: 'Creatine kinase [Enzymatic activity/volume] in Serum or Plasma', unit: 'U/L', defaultReferenceRange: '39-308' },
  '434': { loinc: '1798-8', display: 'Amylase [Enzymatic activity/volume] in Serum or Plasma', unit: 'U/L', defaultReferenceRange: '13-53' },
  '436': { loinc: '3040-3', display: 'Lipase [Enzymatic activity/volume] in Serum or Plasma', unit: 'U/L', defaultReferenceRange: '13-60' },

  // -- Lipids --
  '450': { loinc: '2093-3', display: 'Cholesterol [Mass/volume] in Serum or Plasma', unit: 'mg/dL', defaultReferenceRange: '<200' },
  '452': { loinc: '2571-8', display: 'Triglycerides [Mass/volume] in Serum or Plasma', unit: 'mg/dL', defaultReferenceRange: '<150' },
  '454': { loinc: '2085-9', display: 'HDL Cholesterol [Mass/volume] in Serum or Plasma', unit: 'mg/dL', defaultReferenceRange: '>40' },
  '456': { loinc: '2089-1', display: 'LDL Cholesterol [Mass/volume] in Serum or Plasma', unit: 'mg/dL', defaultReferenceRange: '<100' },

  // -- Minerals --
  '460': { loinc: '17861-6', display: 'Calcium [Mass/volume] in Serum or Plasma', unit: 'mg/dL', defaultReferenceRange: '8.6-10.2' },
  '461': { loinc: '2777-1', display: 'Phosphorus [Mass/volume] in Serum or Plasma', unit: 'mg/dL', defaultReferenceRange: '2.5-4.5' },
  '464': { loinc: '19123-9', display: 'Magnesium [Mass/volume] in Serum or Plasma', unit: 'mg/dL', defaultReferenceRange: '1.7-2.2' },

  // -- Iron studies --
  '470': { loinc: '2498-4', display: 'Iron [Mass/volume] in Serum or Plasma', unit: 'ug/dL', defaultReferenceRange: '65-175' },
  '474': { loinc: '2500-7', display: 'TIBC [Mass/volume] in Serum or Plasma', unit: 'ug/dL', defaultReferenceRange: '250-400' },

  // -- Bilirubin --
  '480': { loinc: '1975-2', display: 'Bilirubin.total [Mass/volume] in Serum or Plasma', unit: 'mg/dL', defaultReferenceRange: '0.1-1.2' },
  '481': { loinc: '1968-7', display: 'Bilirubin.direct [Mass/volume] in Serum or Plasma', unit: 'mg/dL', defaultReferenceRange: '0.0-0.3' },

  // -- Inflammation --
  '687': { loinc: '30522-7', display: 'CRP [Mass/volume] in Serum or Plasma by High sensitivity method', unit: 'mg/L', defaultReferenceRange: '<3.0' },

  // -- Electrolytes (ISE module) --
  'Na': { loinc: '2951-2', display: 'Sodium [Moles/volume] in Serum or Plasma', unit: 'mmol/L', defaultReferenceRange: '136-145' },
  'K': { loinc: '2823-3', display: 'Potassium [Moles/volume] in Serum or Plasma', unit: 'mmol/L', defaultReferenceRange: '3.5-5.1' },
  'Cl': { loinc: '2075-0', display: 'Chloride [Moles/volume] in Serum or Plasma', unit: 'mmol/L', defaultReferenceRange: '98-106' },
};
