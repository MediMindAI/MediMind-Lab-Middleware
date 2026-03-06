/**
 * Mindray BC-7600 analyzer mapping — hematology (5-part differential, 32 parameters).
 *
 * The BC-7600 is a large automated hematology line with 5-part white cell
 * differential (neutrophils, lymphocytes, monocytes, eosinophils, basophils),
 * plus reticulocyte analysis, NRBC counting, and optional CRP module.
 *
 * Communicates via HL7v2 (ORU^R01) through Mindray LabXpert middleware.
 * LOINC codes sourced from the LabXpertEncodeSysV11.xml encoder file.
 *
 * Keys match the test codes from the analyzer's HL7v2 OBX segments.
 */
import type { AnalyzerMapping } from './types.js';

export const mindrayBC7600Mapping: AnalyzerMapping = {
  // ─── White Blood Cells ───────────────────────────────────
  WBC: {
    loinc: '6690-2',
    display: 'White Blood Cells',
    unit: '10*9/L',
    defaultReferenceRange: '4.0-10.0',
  },
  'NEU#': {
    loinc: '751-8',
    display: 'Neutrophils',
    unit: '10*9/L',
    defaultReferenceRange: '2.0-7.0',
  },
  'NEU%': {
    loinc: '770-8',
    display: 'Neutrophils %',
    unit: '%',
    defaultReferenceRange: '40-70',
  },
  'LYM#': {
    loinc: '731-0',
    display: 'Lymphocytes',
    unit: '10*9/L',
    defaultReferenceRange: '1.0-3.0',
  },
  'LYM%': {
    loinc: '736-9',
    display: 'Lymphocytes %',
    unit: '%',
    defaultReferenceRange: '20-40',
  },
  'MON#': {
    loinc: '742-7',
    display: 'Monocytes',
    unit: '10*9/L',
    defaultReferenceRange: '0.2-1.0',
  },
  'MON%': {
    loinc: '5905-5',
    display: 'Monocytes %',
    unit: '%',
    defaultReferenceRange: '3-10',
  },
  'EOS#': {
    loinc: '711-2',
    display: 'Eosinophils',
    unit: '10*9/L',
    defaultReferenceRange: '0.0-0.5',
  },
  'EOS%': {
    loinc: '713-8',
    display: 'Eosinophils %',
    unit: '%',
    defaultReferenceRange: '0-5',
  },
  'BAS#': {
    loinc: '704-7',
    display: 'Basophils',
    unit: '10*9/L',
    defaultReferenceRange: '0.0-0.1',
  },
  'BAS%': {
    loinc: '706-2',
    display: 'Basophils %',
    unit: '%',
    defaultReferenceRange: '0-1',
  },

  // ─── Red Blood Cells ────────────────────────────────────
  RBC: {
    loinc: '789-8',
    display: 'Red Blood Cells',
    unit: '10*12/L',
    defaultReferenceRange: '4.0-5.5',
  },
  HGB: {
    loinc: '718-7',
    display: 'Hemoglobin',
    unit: 'g/L',
    defaultReferenceRange: '120-170',
  },
  HCT: {
    loinc: '4544-3',
    display: 'Hematocrit',
    unit: '%',
    defaultReferenceRange: '36-50',
  },
  MCV: {
    loinc: '787-2',
    display: 'Mean Corpuscular Volume',
    unit: 'fL',
    defaultReferenceRange: '80-100',
  },
  MCH: {
    loinc: '785-6',
    display: 'Mean Corpuscular Hemoglobin',
    unit: 'pg',
    defaultReferenceRange: '27-34',
  },
  MCHC: {
    loinc: '786-4',
    display: 'MCHC',
    unit: 'g/L',
    defaultReferenceRange: '320-360',
  },
  'RDW-CV': {
    loinc: '788-0',
    display: 'RDW-CV',
    unit: '%',
    defaultReferenceRange: '11.5-14.5',
  },
  'RDW-SD': {
    loinc: '21000-5',
    display: 'RDW-SD',
    unit: 'fL',
    defaultReferenceRange: '35.0-56.0',
  },

  // ─── Platelets ──────────────────────────────────────────
  PLT: {
    loinc: '777-3',
    display: 'Platelets',
    unit: '10*9/L',
    defaultReferenceRange: '150-400',
  },
  MPV: {
    loinc: '32623-1',
    display: 'Mean Platelet Volume',
    unit: 'fL',
    defaultReferenceRange: '7.4-10.4',
  },
  PDW: {
    loinc: '32207-3',
    display: 'Platelet Distribution Width',
    unit: 'fL',
    defaultReferenceRange: '9.0-17.0',
  },
  PCT: {
    loinc: '51637-7',
    display: 'Plateletcrit',
    unit: '%',
    defaultReferenceRange: '0.10-0.28',
  },

  // ─── NRBC (Nucleated Red Blood Cells) ───────────────────
  'NRBC#': {
    loinc: '30392-5',
    display: 'Nucleated RBCs',
    unit: '10*9/L',
    defaultReferenceRange: '0.00-0.00',
  },
  'NRBC%': {
    loinc: '26461-4',
    display: 'NRBC %',
    unit: '/100WBC',
    defaultReferenceRange: '0.0-0.0',
  },

  // ─── Reticulocytes ─────────────────────────────────────
  'RET#': {
    loinc: '14196-0',
    display: 'Reticulocytes',
    unit: '10*12/L',
    defaultReferenceRange: '0.02-0.10',
  },
  'RET%': {
    loinc: '4679-7',
    display: 'Reticulocytes %',
    unit: '%',
    defaultReferenceRange: '0.5-2.5',
  },
  IRF: {
    loinc: '33516-6',
    display: 'Immature Reticulocyte Fraction',
    unit: '%',
    defaultReferenceRange: '2.0-17.0',
  },

  // ─── Immature Granulocytes ─────────────────────────────
  'IMG#': {
    loinc: '51584-1',
    display: 'Immature Granulocytes',
    unit: '10*9/L',
    defaultReferenceRange: '0.00-0.10',
  },
  'IMG%': {
    loinc: '38518-7',
    display: 'Immature Granulocytes %',
    unit: '%',
    defaultReferenceRange: '0.0-0.5',
  },

  // ─── CRP Module (optional, if CRP cartridge installed) ──
  CRP: {
    loinc: '1988-5',
    display: 'C-Reactive Protein',
    unit: 'mg/L',
    defaultReferenceRange: '0.0-5.0',
  },
  'HS-CRP': {
    loinc: '30522-7',
    display: 'High-Sensitivity CRP',
    unit: 'mg/L',
    defaultReferenceRange: '0.0-3.0',
  },
};
