/**
 * Snibe Maglumi X3 analyzer mapping — chemiluminescence immunoassay (CLIA).
 *
 * The Maglumi X3 uses numeric test codes organized by category:
 *   01xx=Thyroid, 02xx=Fertility, 03xx=Tumor, 04xx=Cardiac,
 *   05xx=Anemia, 06xx=Bone, 07xx=Diabetes, 08xx=Inflammation, 09xx=Endocrine
 *
 * Keys are Snibe code numbers (as strings) from ASTM ^^^code format.
 */
import type { AnalyzerMapping } from './types.js';

export const snibeMaglumiX3Mapping: AnalyzerMapping = {
  // -- Thyroid (01xx) --
  '0101': { loinc: '11579-0', display: 'TSH [Units/volume] in Serum or Plasma', unit: 'uIU/mL', defaultReferenceRange: '0.27-4.20' },
  '0102': { loinc: '3053-6',  display: 'Total T3 [Mass/volume] in Serum or Plasma', unit: 'ng/mL', defaultReferenceRange: '0.8-2.0' },
  '0103': { loinc: '3026-2',  display: 'Total T4 [Mass/volume] in Serum or Plasma', unit: 'ug/dL', defaultReferenceRange: '5.1-14.1' },
  '0104': { loinc: '3051-0',  display: 'Free T3 [Mass/volume] in Serum or Plasma', unit: 'pg/mL', defaultReferenceRange: '2.0-4.4' },
  '0105': { loinc: '3024-7',  display: 'Free T4 [Mass/volume] in Serum or Plasma', unit: 'ng/dL', defaultReferenceRange: '0.93-1.70' },
  '0106': { loinc: '8099-4',  display: 'Anti-TPO [Units/volume] in Serum', unit: 'IU/mL', defaultReferenceRange: '<34' },
  '0107': { loinc: '8098-6',  display: 'Anti-Thyroglobulin [Units/volume] in Serum', unit: 'IU/mL', defaultReferenceRange: '<115' },
  '0108': { loinc: '3013-0',  display: 'Thyroglobulin [Mass/volume] in Serum or Plasma', unit: 'ng/mL', defaultReferenceRange: '<77' },
  '0109': { loinc: '11210-2', display: 'TRAb [Units/volume] in Serum', unit: 'IU/L', defaultReferenceRange: '<1.75' },

  // -- Reproductive / Fertility (02xx) --
  '0201': { loinc: '15067-2', display: 'FSH [Units/volume] in Serum or Plasma', unit: 'mIU/mL' },
  '0202': { loinc: '10501-5', display: 'LH [Units/volume] in Serum or Plasma', unit: 'mIU/mL' },
  '0203': { loinc: '2842-3',  display: 'Prolactin [Mass/volume] in Serum or Plasma', unit: 'ng/mL' },
  '0204': { loinc: '2243-4',  display: 'Estradiol [Mass/volume] in Serum or Plasma', unit: 'pg/mL' },
  '0205': { loinc: '2839-9',  display: 'Progesterone [Mass/volume] in Serum or Plasma', unit: 'ng/mL' },
  '0206': { loinc: '2986-8',  display: 'Testosterone [Mass/volume] in Serum or Plasma', unit: 'ng/dL' },
  '0207': { loinc: '21198-7', display: 'Total beta-HCG [Units/volume] in Serum or Plasma', unit: 'mIU/mL', defaultReferenceRange: '<5.0' },
  '0208': { loinc: '2191-5',  display: 'DHEA-S [Mass/volume] in Serum or Plasma', unit: 'ug/dL' },

  // -- Tumor markers (03xx) --
  '0301': { loinc: '1834-1',  display: 'AFP [Mass/volume] in Serum or Plasma', unit: 'ng/mL', defaultReferenceRange: '<7.0' },
  '0302': { loinc: '2039-6',  display: 'CEA [Mass/volume] in Serum or Plasma', unit: 'ng/mL', defaultReferenceRange: '<5.0' },
  '0303': { loinc: '10334-1', display: 'CA 125 [Units/volume] in Serum or Plasma', unit: 'U/mL', defaultReferenceRange: '<35' },
  '0304': { loinc: '6875-9',  display: 'CA 15-3 [Units/volume] in Serum or Plasma', unit: 'U/mL', defaultReferenceRange: '<25' },
  '0305': { loinc: '24108-3', display: 'CA 19-9 [Units/volume] in Serum or Plasma', unit: 'U/mL', defaultReferenceRange: '<37' },
  '0306': { loinc: '2857-1',  display: 'Total PSA [Mass/volume] in Serum or Plasma', unit: 'ng/mL', defaultReferenceRange: '<4.0' },
  '0307': { loinc: '10886-0', display: 'Free PSA [Mass/volume] in Serum or Plasma', unit: 'ng/mL' },
  '0308': { loinc: '10454-7', display: 'CA 72-4 [Units/volume] in Serum or Plasma', unit: 'U/mL', defaultReferenceRange: '<6.9' },
  '0310': { loinc: '17453-4', display: 'NSE [Mass/volume] in Serum or Plasma', unit: 'ng/mL', defaultReferenceRange: '<16.3' },
  '0311': { loinc: '33717-0', display: 'Cyfra 21-1 [Mass/volume] in Serum or Plasma', unit: 'ng/mL', defaultReferenceRange: '<3.3' },
  '0312': { loinc: '56927-9', display: 'SCC [Mass/volume] in Serum or Plasma', unit: 'ng/mL', defaultReferenceRange: '<1.5' },

  // -- Cardiac markers (04xx) --
  '0401': { loinc: '89579-7', display: 'hs-Troponin I [Mass/volume] in Serum or Plasma', unit: 'pg/mL', defaultReferenceRange: '<26.2' },
  '0402': { loinc: '49551-5', display: 'CK-MB [Mass/volume] in Serum or Plasma', unit: 'ng/mL', defaultReferenceRange: '<4.94' },
  '0403': { loinc: '30088-9', display: 'Myoglobin [Mass/volume] in Serum or Plasma', unit: 'ng/mL', defaultReferenceRange: '<100' },
  '0404': { loinc: '33762-6', display: 'NT-proBNP [Mass/volume] in Serum or Plasma', unit: 'pg/mL' },
  '0405': { loinc: '42637-9', display: 'BNP [Mass/volume] in Plasma', unit: 'pg/mL', defaultReferenceRange: '<100' },
  '0406': { loinc: '48058-2', display: 'D-Dimer [Mass/volume] in Plasma', unit: 'ug/mL FEU', defaultReferenceRange: '<0.5' },

  // -- Anemia / Metabolic (05xx) --
  '0501': { loinc: '2276-4', display: 'Ferritin [Mass/volume] in Serum or Plasma', unit: 'ng/mL' },
  '0502': { loinc: '2132-9', display: 'Vitamin B12 [Mass/volume] in Serum or Plasma', unit: 'pg/mL', defaultReferenceRange: '197-771' },
  '0503': { loinc: '2284-8', display: 'Folate [Mass/volume] in Serum or Plasma', unit: 'ng/mL', defaultReferenceRange: '>3.0' },
  '0504': { loinc: '2637-8', display: 'EPO [Units/volume] in Serum or Plasma', unit: 'mIU/mL', defaultReferenceRange: '4.3-29.0' },

  // -- Bone Metabolism (06xx) --
  '0601': { loinc: '62292-8', display: '25-OH Vitamin D [Mass/volume] in Serum or Plasma', unit: 'ng/mL', defaultReferenceRange: '30-100' },
  '0602': { loinc: '2731-8',  display: 'Intact PTH [Mass/volume] in Serum or Plasma', unit: 'pg/mL', defaultReferenceRange: '15-65' },
  '0603': { loinc: '2722-7',  display: 'Osteocalcin [Mass/volume] in Serum or Plasma', unit: 'ng/mL' },
  '0604': { loinc: '1992-7',  display: 'Calcitonin [Mass/volume] in Serum or Plasma', unit: 'pg/mL', defaultReferenceRange: '<10' },

  // -- Diabetes (07xx) --
  '0701': { loinc: '2484-4', display: 'Insulin [Units/volume] in Serum or Plasma', unit: 'uU/mL', defaultReferenceRange: '2.6-24.9' },
  '0702': { loinc: '1986-9', display: 'C-Peptide [Mass/volume] in Serum or Plasma', unit: 'ng/mL', defaultReferenceRange: '1.1-4.4' },

  // -- Inflammation / Infection (08xx) --
  '0801': { loinc: '75241-0', display: 'Procalcitonin [Mass/volume] in Serum or Plasma', unit: 'ng/mL', defaultReferenceRange: '<0.5' },
  '0802': { loinc: '26881-3', display: 'IL-6 [Mass/volume] in Serum or Plasma', unit: 'pg/mL', defaultReferenceRange: '<7.0' },
  '0803': { loinc: '30522-7', display: 'CRP [Mass/volume] in Serum or Plasma by High sensitivity method', unit: 'mg/L', defaultReferenceRange: '<3.0' },
  '0804': { loinc: '48803-1', display: 'SAA [Mass/volume] in Serum or Plasma', unit: 'mg/L', defaultReferenceRange: '<10' },

  // -- Endocrine (09xx) --
  '0901': { loinc: '2143-6', display: 'Cortisol [Mass/volume] in Serum or Plasma', unit: 'ug/dL' },
  '0902': { loinc: '2963-7', display: 'Growth Hormone [Mass/volume] in Serum or Plasma', unit: 'ng/mL' },
  '0903': { loinc: '2141-0', display: 'ACTH [Mass/volume] in Plasma', unit: 'pg/mL' },
  '0904': { loinc: '1763-2', display: 'Aldosterone [Mass/volume] in Serum or Plasma', unit: 'ng/dL' },
  '0905': { loinc: '2915-5', display: 'Renin [Units/volume] in Plasma', unit: 'uU/mL' },
};
