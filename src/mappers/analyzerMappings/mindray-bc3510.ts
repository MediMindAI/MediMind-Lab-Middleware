/**
 * Mindray BC-3510 analyzer mapping — hematology (CBC) with 19 parameters.
 *
 * The BC-3510 is a 3-part differential hematology analyzer. Unlike the
 * Sysmex 5-part diff (neutrophils, lymphocytes, monocytes, eosinophils,
 * basophils), the BC-3510 groups white cells into just 3 categories:
 * Lymphocytes, Mid-cells (monocytes+eosinophils+basophils), and Granulocytes.
 *
 * Keys match the test codes from the analyzer's ASTM/HL7 output.
 */
import type { AnalyzerMapping } from './types.js';

export const mindrayBC3510Mapping: AnalyzerMapping = {
  WBC: {
    loinc: '6690-2',
    display: 'Leukocytes [#/volume] in Blood by Automated count',
    unit: '10*3/uL',
    defaultReferenceRange: '4.5-11.0',
  },
  RBC: {
    loinc: '789-8',
    display: 'Erythrocytes [#/volume] in Blood by Automated count',
    unit: '10*6/uL',
    defaultReferenceRange: '4.6-6.2',
  },
  HGB: {
    loinc: '718-7',
    display: 'Hemoglobin [Mass/volume] in Blood',
    unit: 'g/dL',
    defaultReferenceRange: '13.0-18.0',
  },
  HCT: {
    loinc: '4544-3',
    display: 'Hematocrit [Volume Fraction] of Blood by Automated count',
    unit: '%',
    defaultReferenceRange: '40-54',
  },
  MCV: {
    loinc: '787-2',
    display: 'MCV [Entitic volume] by Automated count',
    unit: 'fL',
    defaultReferenceRange: '80-100',
  },
  MCH: {
    loinc: '785-6',
    display: 'MCH [Entitic mass] by Automated count',
    unit: 'pg',
    defaultReferenceRange: '27-32',
  },
  MCHC: {
    loinc: '786-4',
    display: 'MCHC [Mass/volume] by Automated count',
    unit: 'g/dL',
    defaultReferenceRange: '32-36',
  },
  PLT: {
    loinc: '777-3',
    display: 'Platelets [#/volume] in Blood by Automated count',
    unit: '10*3/uL',
    defaultReferenceRange: '150-400',
  },
  'RDW-CV': {
    loinc: '788-0',
    display: 'Erythrocyte distribution width [Ratio] by Automated count',
    unit: '%',
    defaultReferenceRange: '11.5-15.0',
  },
  'RDW-SD': {
    loinc: '21000-5',
    display: 'Erythrocyte distribution width [Entitic volume] by Automated count',
    unit: 'fL',
    defaultReferenceRange: '35.0-46.0',
  },
  MPV: {
    loinc: '32623-1',
    display: 'Platelet mean volume [Entitic volume] by Automated count',
    unit: 'fL',
    defaultReferenceRange: '8.0-12.0',
  },
  PDW: {
    loinc: '32207-3',
    display: 'Platelet distribution width [Entitic volume] by Automated count',
    unit: 'fL',
    defaultReferenceRange: '9.0-17.0',
  },
  PCT: {
    loinc: '51637-7',
    display: 'Plateletcrit [Volume Fraction] in Blood',
    unit: '%',
    defaultReferenceRange: '0.15-0.40',
  },
  'Lymph%': {
    loinc: '736-9',
    display: 'Lymphocytes/100 leukocytes in Blood by Automated count',
    unit: '%',
    defaultReferenceRange: '20-40',
  },
  'Lymph#': {
    loinc: '731-0',
    display: 'Lymphocytes [#/volume] in Blood by Automated count',
    unit: '10*3/uL',
    defaultReferenceRange: '1.0-4.0',
  },
  'Mid%': {
    loinc: '5905-5',
    display: 'Monocytes/100 leukocytes in Blood by Automated count',
    unit: '%',
    defaultReferenceRange: '3-10',
  },
  'Mid#': {
    loinc: '742-7',
    display: 'Monocytes [#/volume] in Blood by Automated count',
    unit: '10*3/uL',
    defaultReferenceRange: '0.2-1.0',
  },
  'Gran%': {
    loinc: '770-8',
    display: 'Neutrophils/100 leukocytes in Blood by Automated count',
    unit: '%',
    defaultReferenceRange: '50-70',
  },
  'Gran#': {
    loinc: '751-8',
    display: 'Neutrophils [#/volume] in Blood by Automated count',
    unit: '10*3/uL',
    defaultReferenceRange: '1.5-8.0',
  },
};
