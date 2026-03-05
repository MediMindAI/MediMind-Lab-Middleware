/**
 * Tosoh AIA-360 analyzer mapping — compact immunoassay (FEIA).
 *
 * The AIA-360 uses unit-dose test cups and reports results via standard ASTM.
 * Test codes are assay abbreviations (e.g., "TSH", "FT4") in the ASTM result
 * record's Universal Test ID field.
 *
 * Keys are the assay abbreviation as they appear in ASTM ^^^CODE format.
 */
import type { AnalyzerMapping } from './types.js';

export const tosohAia360Mapping: AnalyzerMapping = {
  // -- Thyroid --
  'TSH':  { loinc: '11579-0', display: 'TSH [Units/volume] in Serum or Plasma', unit: 'uIU/mL', defaultReferenceRange: '0.35-4.94' },
  'FT4':  { loinc: '3024-7',  display: 'Free T4 [Mass/volume] in Serum or Plasma', unit: 'ng/dL', defaultReferenceRange: '0.70-1.48' },
  'FT3':  { loinc: '3051-0',  display: 'Free T3 [Mass/volume] in Serum or Plasma', unit: 'pg/mL', defaultReferenceRange: '1.71-3.71' },
  'T4':   { loinc: '3026-2',  display: 'Total T4 [Mass/volume] in Serum or Plasma', unit: 'ug/dL', defaultReferenceRange: '4.87-11.72' },
  'TT3':  { loinc: '3053-6',  display: 'Total T3 [Mass/volume] in Serum or Plasma', unit: 'ng/dL', defaultReferenceRange: '58.5-170.4' },
  'TU':   { loinc: '3050-2',  display: 'T-Uptake [Relative] in Serum or Plasma', unit: '%', defaultReferenceRange: '22.5-37.0' },

  // -- Cardiac markers --
  'CKMB': { loinc: '49551-5', display: 'CK-MB [Mass/volume] in Serum or Plasma', unit: 'ng/mL', defaultReferenceRange: '<5.0' },
  'MYO':  { loinc: '30088-9', display: 'Myoglobin [Mass/volume] in Serum or Plasma', unit: 'ng/mL', defaultReferenceRange: '<100' },
  'CTNI': { loinc: '49563-0', display: 'Troponin I [Mass/volume] in Serum or Plasma', unit: 'ng/mL', defaultReferenceRange: '<0.04' },

  // -- Tumor markers --
  'CEA':   { loinc: '2039-6',  display: 'CEA [Mass/volume] in Serum or Plasma', unit: 'ng/mL', defaultReferenceRange: '<5.0' },
  'AFP':   { loinc: '1834-1',  display: 'AFP [Mass/volume] in Serum or Plasma', unit: 'ng/mL', defaultReferenceRange: '<10' },
  'CA125': { loinc: '10334-1', display: 'CA 125 [Units/volume] in Serum or Plasma', unit: 'U/mL', defaultReferenceRange: '<35' },
  'CA199': { loinc: '24108-3', display: 'CA 19-9 [Units/volume] in Serum or Plasma', unit: 'U/mL', defaultReferenceRange: '<37' },
  'PA':    { loinc: '2578-3',  display: 'Prostatic acid phosphatase [Mass/volume] in Serum', unit: 'ng/mL', defaultReferenceRange: '<3.0' },

  // -- Reproductive hormones --
  'LH':    { loinc: '10501-5', display: 'LH [Units/volume] in Serum or Plasma', unit: 'mIU/mL' },
  'FSH':   { loinc: '15067-2', display: 'FSH [Units/volume] in Serum or Plasma', unit: 'mIU/mL' },
  'PRL':   { loinc: '2842-3',  display: 'Prolactin [Mass/volume] in Serum or Plasma', unit: 'ng/mL' },
  'E2':    { loinc: '2243-4',  display: 'Estradiol [Mass/volume] in Serum or Plasma', unit: 'pg/mL' },
  'PROG':  { loinc: '2839-9',  display: 'Progesterone [Mass/volume] in Serum or Plasma', unit: 'ng/mL' },
  'TESTO': { loinc: '2986-8',  display: 'Testosterone [Mass/volume] in Serum or Plasma', unit: 'ng/dL' },

  // -- Anemia --
  'FERR': { loinc: '2276-4', display: 'Ferritin [Mass/volume] in Serum or Plasma', unit: 'ng/mL' },

  // -- Metabolic / Endocrine --
  'CORT': { loinc: '2143-6', display: 'Cortisol [Mass/volume] in Serum or Plasma', unit: 'ug/dL', defaultReferenceRange: '6.2-19.4' },
  'HGH':  { loinc: '2963-7', display: 'Growth Hormone [Mass/volume] in Serum or Plasma', unit: 'ng/mL', defaultReferenceRange: '<5.0' },
  'IRI':  { loinc: '2484-4', display: 'Insulin [Units/volume] in Serum or Plasma', unit: 'uU/mL', defaultReferenceRange: '2.6-24.9' },
  'CPEP': { loinc: '1986-9', display: 'C-Peptide [Mass/volume] in Serum or Plasma', unit: 'ng/mL', defaultReferenceRange: '1.1-4.4' },
  'ACTH': { loinc: '2141-0', display: 'ACTH [Mass/volume] in Plasma', unit: 'pg/mL', defaultReferenceRange: '7.2-63.3' },

  // -- Kidney --
  'CYSTC': { loinc: '33863-2', display: 'Cystatin C [Mass/volume] in Serum or Plasma', unit: 'mg/L' },
  'B2M':   { loinc: '54356-8', display: 'Beta-2 Microglobulin [Mass/volume] in Serum or Plasma', unit: 'mg/L' },
  'IPTH':  { loinc: '2731-8',  display: 'Intact PTH [Mass/volume] in Serum or Plasma', unit: 'pg/mL', defaultReferenceRange: '15-65' },

  // -- Other --
  'HOMO': { loinc: '13965-9', display: 'Homocysteine [Moles/volume] in Serum or Plasma', unit: 'umol/L' },
  'IGE':  { loinc: '19113-0', display: 'Total IgE [Units/volume] in Serum', unit: 'IU/mL' },
};
