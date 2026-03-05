/**
 * Roche Cobas e 411 analyzer mapping — immunoassay with 40 parameters.
 *
 * The cobas e411 uses electrochemiluminescence (ECL) to measure hormones,
 * tumor markers, cardiac markers, and infectious disease antibodies.
 * Test codes are Roche "Elecsys test numbers" in ASTM ^^^number format.
 */
import type { AnalyzerMapping } from './types.js';

export const rocheCobasE411Mapping: AnalyzerMapping = {
  // -- Thyroid --
  '146': { loinc: '11579-0', display: 'TSH [Units/volume] in Serum or Plasma', unit: 'uIU/mL', defaultReferenceRange: '0.27-4.20' },
  '142': { loinc: '3024-7', display: 'Free T4 [Mass/volume] in Serum or Plasma', unit: 'ng/dL', defaultReferenceRange: '0.93-1.70' },
  '143': { loinc: '3051-0', display: 'Free T3 [Mass/volume] in Serum or Plasma', unit: 'pg/mL', defaultReferenceRange: '2.0-4.4' },
  '144': { loinc: '3026-2', display: 'Total T4 [Mass/volume] in Serum or Plasma', unit: 'ug/dL', defaultReferenceRange: '5.1-14.1' },
  '145': { loinc: '3053-6', display: 'Total T3 [Mass/volume] in Serum or Plasma', unit: 'ng/mL', defaultReferenceRange: '0.8-2.0' },
  '147': { loinc: '8099-4', display: 'Anti-TPO [Units/volume] in Serum', unit: 'IU/mL', defaultReferenceRange: '<34' },
  '148': { loinc: '8098-6', display: 'Anti-Thyroglobulin [Units/volume] in Serum', unit: 'IU/mL', defaultReferenceRange: '<115' },

  // -- Cardiac markers --
  '163': { loinc: '67151-1', display: 'hs-Troponin T [Mass/volume] in Serum or Plasma', unit: 'pg/mL', defaultReferenceRange: '<14' },
  '164': { loinc: '49551-5', display: 'CK-MB [Mass/volume] in Serum or Plasma', unit: 'ng/mL', defaultReferenceRange: '<4.94' },
  '170': { loinc: '30088-9', display: 'Myoglobin [Mass/volume] in Serum or Plasma', unit: 'ng/mL' },
  '165': { loinc: '33762-6', display: 'NT-proBNP [Mass/volume] in Serum or Plasma', unit: 'pg/mL' },

  // -- Anemia / vitamins --
  '171': { loinc: '2276-4', display: 'Ferritin [Mass/volume] in Serum or Plasma', unit: 'ng/mL' },
  '172': { loinc: '2132-9', display: 'Vitamin B12 [Mass/volume] in Serum or Plasma', unit: 'pg/mL', defaultReferenceRange: '197-771' },
  '173': { loinc: '2284-8', display: 'Folate [Mass/volume] in Serum or Plasma', unit: 'ng/mL', defaultReferenceRange: '>3.0' },
  '122': { loinc: '62292-8', display: '25-OH Vitamin D [Mass/volume] in Serum or Plasma', unit: 'ng/mL', defaultReferenceRange: '30-100' },

  // -- Reproductive hormones --
  '150': { loinc: '2842-3', display: 'Prolactin [Mass/volume] in Serum or Plasma', unit: 'ng/mL' },
  '151': { loinc: '10501-5', display: 'LH [Units/volume] in Serum or Plasma', unit: 'mIU/mL' },
  '152': { loinc: '15067-2', display: 'FSH [Units/volume] in Serum or Plasma', unit: 'mIU/mL' },
  '153': { loinc: '2243-4', display: 'Estradiol [Mass/volume] in Serum or Plasma', unit: 'pg/mL' },
  '154': { loinc: '2839-9', display: 'Progesterone [Mass/volume] in Serum or Plasma', unit: 'ng/mL' },
  '155': { loinc: '2143-6', display: 'Cortisol [Mass/volume] in Serum or Plasma', unit: 'ug/dL', defaultReferenceRange: '6.2-19.4' },
  '156': { loinc: '2986-8', display: 'Testosterone [Mass/volume] in Serum or Plasma', unit: 'ng/dL' },
  '157': { loinc: '2191-5', display: 'DHEA-S [Mass/volume] in Serum or Plasma', unit: 'ug/dL' },
  '690': { loinc: '21198-7', display: 'Total beta-HCG [Units/volume] in Serum or Plasma', unit: 'mIU/mL', defaultReferenceRange: '<5.0' },

  // -- Endocrine --
  '160': { loinc: '2731-8', display: 'Intact PTH [Mass/volume] in Serum or Plasma', unit: 'pg/mL', defaultReferenceRange: '15-65' },
  '161': { loinc: '2484-4', display: 'Insulin [Units/volume] in Serum or Plasma', unit: 'uU/mL', defaultReferenceRange: '2.6-24.9' },
  '162': { loinc: '1986-9', display: 'C-Peptide [Mass/volume] in Serum or Plasma', unit: 'ng/mL', defaultReferenceRange: '1.1-4.4' },

  // -- Tumor markers --
  '113': { loinc: '2039-6', display: 'CEA [Mass/volume] in Serum or Plasma', unit: 'ng/mL', defaultReferenceRange: '<3.4' },
  '114': { loinc: '1834-1', display: 'AFP [Mass/volume] in Serum or Plasma', unit: 'ng/mL', defaultReferenceRange: '<7.0' },
  '115': { loinc: '10334-1', display: 'CA 125 [Units/volume] in Serum or Plasma', unit: 'U/mL', defaultReferenceRange: '<35' },
  '116': { loinc: '24108-3', display: 'CA 19-9 [Units/volume] in Serum or Plasma', unit: 'U/mL', defaultReferenceRange: '<37' },
  '117': { loinc: '6875-9', display: 'CA 15-3 [Units/volume] in Serum or Plasma', unit: 'U/mL', defaultReferenceRange: '<25' },
  '118': { loinc: '10454-7', display: 'CA 72-4 [Units/volume] in Serum or Plasma', unit: 'U/mL', defaultReferenceRange: '<6.9' },
  '130': { loinc: '2857-1', display: 'Total PSA [Mass/volume] in Serum or Plasma', unit: 'ng/mL', defaultReferenceRange: '<4.0' },
  '131': { loinc: '10886-0', display: 'Free PSA [Mass/volume] in Serum or Plasma', unit: 'ng/mL' },
  '120': { loinc: '17453-4', display: 'NSE [Mass/volume] in Serum or Plasma', unit: 'ng/mL', defaultReferenceRange: '<16.3' },

  // -- Inflammation --
  '126': { loinc: '75241-0', display: 'Procalcitonin [Mass/volume] in Serum or Plasma', unit: 'ng/mL', defaultReferenceRange: '<0.5' },
  '127': { loinc: '26881-3', display: 'IL-6 [Mass/volume] in Serum or Plasma', unit: 'pg/mL', defaultReferenceRange: '<7.0' },
};
