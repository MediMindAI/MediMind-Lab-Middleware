/**
 * Tests for the Combilyzer 13 proprietary output parser.
 *
 * Covers: complete fixture parsing, missing specimen IDs, malformed lines,
 * abnormal value detection, empty input, and numeric parameter parsing.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseCombilyzerOutput } from './parser.js';

/** Load the real Combilyzer fixture file. */
const FIXTURE_PATH = resolve('src/simulators/fixtures/combilyzer/urinalysis.txt');
const FIXTURE = readFileSync(FIXTURE_PATH, 'utf-8');

describe('parseCombilyzerOutput', () => {
  it('parses a complete urinalysis result from the fixture', () => {
    const result = parseCombilyzerOutput(FIXTURE);

    expect(result.specimenId).toBe('78901234');
    expect(result.dateTime).toBe('2026-03-05T14:45:00');
    expect(result.parameters).toHaveLength(13);
    expect(result.rawOutput).toBe(FIXTURE);
    expect(result.receivedAt).toBeTruthy();

    // Spot-check specific parameters
    const glu = result.parameters.find((p) => p.code === 'GLU');
    expect(glu).toEqual({
      code: 'GLU',
      name: 'Glucose',
      value: 'Normal',
      unit: 'mg/dL',
      abnormal: false,
    });

    const sg = result.parameters.find((p) => p.code === 'SG');
    expect(sg).toEqual({
      code: 'SG',
      name: 'Specific Gravity',
      value: '1.018',
      unit: '',
      abnormal: false,
    });

    const ph = result.parameters.find((p) => p.code === 'pH');
    expect(ph).toEqual({
      code: 'pH',
      name: 'pH',
      value: '6.0',
      unit: '',
      abnormal: false,
    });

    const cre = result.parameters.find((p) => p.code === 'CRE');
    expect(cre).toEqual({
      code: 'CRE',
      name: 'Creatinine',
      value: '100',
      unit: 'mg/dL',
      abnormal: false,
    });
  });

  it('extracts all 13 parameter codes', () => {
    const result = parseCombilyzerOutput(FIXTURE);
    const codes = result.parameters.map((p) => p.code);

    expect(codes).toEqual([
      'BIL', 'URO', 'KET', 'BLD', 'PRO', 'NIT', 'LEU',
      'GLU', 'SG', 'pH', 'ASC', 'CRE', 'ALB',
    ]);
  });

  it('handles missing specimen ID', () => {
    const input = [
      'H|\\^&|||Combilyzer13|||||||P|1|20260305120000',
      'P|1',
      'O|1|||^^^UA|R|||||A',
      'R|1|^^^GLU|Negative||mg/dL||N||F',
      'L|1|N',
    ].join('\n');

    const result = parseCombilyzerOutput(input);

    expect(result.specimenId).toBe('');
    expect(result.parameters).toHaveLength(1);
    expect(result.parameters[0].code).toBe('GLU');
  });

  it('skips malformed lines and continues parsing', () => {
    const input = [
      'H|\\^&|||Combilyzer13|||||||P|1|20260305120000',
      'P|1',
      'O|1|99887766||^^^UA|R|||||A',
      'R|1|^^^GLU|Negative||mg/dL||N||F',
      'THIS_IS_GARBAGE',
      'ALSO|||GARBAGE|||WITH||PIPES',
      'R|2|^^^PRO|1+||mg/dL||A||F',
      'R|3|BROKEN_TEST_ID|value||unit||N||F',
      'L|1|N',
    ].join('\n');

    const result = parseCombilyzerOutput(input);

    expect(result.specimenId).toBe('99887766');
    // GLU parsed, garbage skipped, PRO parsed, broken R skipped (no ^^^CODE format)
    expect(result.parameters).toHaveLength(2);
    expect(result.parameters[0].code).toBe('GLU');
    expect(result.parameters[1].code).toBe('PRO');
  });

  it('correctly identifies abnormal values', () => {
    const input = [
      'H|\\^&|||Combilyzer13|||||||P|1|20260305120000',
      'P|1',
      'O|1|11223344||^^^UA|R|||||A',
      'R|1|^^^GLU|2+||mg/dL||A||F',
      'R|2|^^^PRO|Trace||mg/dL||A||F',
      'R|3|^^^BLD|1+||Ery/uL||A||F',
      'R|4|^^^NIT|Positive||||A||F',
      'R|5|^^^NIT|Negative||||N||F',
      'R|6|^^^KET|3+||mg/dL||A||F',
      'R|7|^^^UBG|2+||mg/dL||A||F',
      'R|8|^^^BIL|1+||mg/dL||A||F',
      'R|9|^^^LEU|2+||WBC/uL||A||F',
      'R|10|^^^pH|4.5||||||F',
      'R|11|^^^pH|8.5||||||F',
      'R|12|^^^pH|6.5||||||F',
      'R|13|^^^SG|1.002||||||F',
      'R|14|^^^SG|1.035||||||F',
      'R|15|^^^SG|1.020||||||F',
      'R|16|^^^ALB|1+||mg/dL||A||F',
      'L|1|N',
    ].join('\n');

    const result = parseCombilyzerOutput(input);

    const findParam = (code: string, index: number) =>
      result.parameters.filter((p) => p.code === code)[index] ?? null;

    // Abnormal: GLU anything other than Negative/Normal
    expect(findParam('GLU', 0)?.abnormal).toBe(true);
    // Abnormal: PRO anything other than Negative
    expect(findParam('PRO', 0)?.abnormal).toBe(true);
    // Abnormal: BLD anything other than Negative
    expect(findParam('BLD', 0)?.abnormal).toBe(true);
    // Abnormal: NIT Positive
    expect(findParam('NIT', 0)?.abnormal).toBe(true);
    // Normal: NIT Negative
    expect(findParam('NIT', 1)?.abnormal).toBe(false);
    // Abnormal: KET anything other than Negative
    expect(findParam('KET', 0)?.abnormal).toBe(true);
    // Abnormal: UBG anything other than Normal/0.2
    expect(findParam('UBG', 0)?.abnormal).toBe(true);
    // Abnormal: BIL anything other than Negative
    expect(findParam('BIL', 0)?.abnormal).toBe(true);
    // Abnormal: LEU anything other than Negative
    expect(findParam('LEU', 0)?.abnormal).toBe(true);
    // Abnormal: pH < 5.0
    expect(findParam('pH', 0)?.abnormal).toBe(true);
    // Abnormal: pH > 8.0
    expect(findParam('pH', 1)?.abnormal).toBe(true);
    // Normal: pH 6.5
    expect(findParam('pH', 2)?.abnormal).toBe(false);
    // Abnormal: SG < 1.005
    expect(findParam('SG', 0)?.abnormal).toBe(true);
    // Abnormal: SG > 1.030
    expect(findParam('SG', 1)?.abnormal).toBe(true);
    // Normal: SG 1.020
    expect(findParam('SG', 2)?.abnormal).toBe(false);
    // Abnormal: ALB anything other than Negative
    expect(findParam('ALB', 0)?.abnormal).toBe(true);
  });

  it('handles empty input', () => {
    const result = parseCombilyzerOutput('');

    expect(result.specimenId).toBe('');
    expect(result.dateTime).toBe('');
    expect(result.parameters).toHaveLength(0);
    expect(result.rawOutput).toBe('');
    expect(result.receivedAt).toBeTruthy();
  });

  it('handles whitespace-only input', () => {
    const result = parseCombilyzerOutput('   \n  \n  ');

    expect(result.specimenId).toBe('');
    expect(result.parameters).toHaveLength(0);
  });

  it('parses numeric values (pH and SG) correctly', () => {
    const input = [
      'H|\\^&|||Combilyzer13|||||||P|1|20260305120000',
      'P|1',
      'O|1|55667788||^^^UA|R|||||A',
      'R|1|^^^pH|5.0||||||F',
      'R|2|^^^SG|1.005||||||F',
      'R|3|^^^pH|8.0||||||F',
      'R|4|^^^SG|1.030||||||F',
      'L|1|N',
    ].join('\n');

    const result = parseCombilyzerOutput(input);

    // pH 5.0 — exactly at lower boundary, should be normal
    expect(result.parameters[0].value).toBe('5.0');
    expect(result.parameters[0].abnormal).toBe(false);

    // SG 1.005 — exactly at lower boundary, should be normal
    expect(result.parameters[1].value).toBe('1.005');
    expect(result.parameters[1].abnormal).toBe(false);

    // pH 8.0 — exactly at upper boundary, should be normal
    expect(result.parameters[2].value).toBe('8.0');
    expect(result.parameters[2].abnormal).toBe(false);

    // SG 1.030 — exactly at upper boundary, should be normal
    expect(result.parameters[3].value).toBe('1.030');
    expect(result.parameters[3].abnormal).toBe(false);
  });

  it('handles R records with empty value field', () => {
    const input = [
      'H|\\^&|||Combilyzer13|||||||P|1|20260305120000',
      'P|1',
      'O|1|12345678||^^^UA|R|||||A',
      'R|1|^^^GLU|||mg/dL||N||F',
      'R|2|^^^PRO|Negative||mg/dL||N||F',
      'L|1|N',
    ].join('\n');

    const result = parseCombilyzerOutput(input);

    // GLU has empty value — should be skipped
    // PRO has value — should be kept
    expect(result.parameters).toHaveLength(1);
    expect(result.parameters[0].code).toBe('PRO');
  });

  it('maps all known parameter codes to human-readable names', () => {
    const input = [
      'H|\\^&|||Combilyzer13|||||||P|1|20260305120000',
      'P|1',
      'O|1|12345678||^^^UA|R|||||A',
      'R|1|^^^GLU|Negative||mg/dL||N||F',
      'R|2|^^^PRO|Negative||mg/dL||N||F',
      'R|3|^^^BLD|Negative||Ery/uL||N||F',
      'R|4|^^^LEU|Negative||WBC/uL||N||F',
      'R|5|^^^NIT|Negative||||N||F',
      'R|6|^^^KET|Negative||mg/dL||N||F',
      'R|7|^^^UBG|Normal|0.2|mg/dL||N||F',
      'R|8|^^^BIL|Negative||mg/dL||N||F',
      'R|9|^^^pH|6.0||||||F',
      'R|10|^^^SG|1.015||||||F',
      'R|11|^^^ASC|Negative||mg/dL||N||F',
      'R|12|^^^CRE|100||mg/dL||N||F',
      'R|13|^^^ALB|Negative||mg/dL||N||F',
      'L|1|N',
    ].join('\n');

    const result = parseCombilyzerOutput(input);
    const nameMap = Object.fromEntries(result.parameters.map((p) => [p.code, p.name]));

    expect(nameMap['GLU']).toBe('Glucose');
    expect(nameMap['PRO']).toBe('Protein');
    expect(nameMap['BLD']).toBe('Blood');
    expect(nameMap['LEU']).toBe('Leukocytes');
    expect(nameMap['NIT']).toBe('Nitrite');
    expect(nameMap['KET']).toBe('Ketone');
    expect(nameMap['UBG']).toBe('Urobilinogen');
    expect(nameMap['BIL']).toBe('Bilirubin');
    expect(nameMap['pH']).toBe('pH');
    expect(nameMap['SG']).toBe('Specific Gravity');
    expect(nameMap['ASC']).toBe('Ascorbic Acid');
    expect(nameMap['CRE']).toBe('Creatinine');
    expect(nameMap['ALB']).toBe('Albumin');
  });

  it('handles unknown parameter codes gracefully', () => {
    const input = [
      'H|\\^&|||Combilyzer13|||||||P|1|20260305120000',
      'P|1',
      'O|1|12345678||^^^UA|R|||||A',
      'R|1|^^^XYZ|SomeValue||units||N||F',
      'L|1|N',
    ].join('\n');

    const result = parseCombilyzerOutput(input);

    expect(result.parameters).toHaveLength(1);
    // Unknown code — name falls back to the code itself
    expect(result.parameters[0].code).toBe('XYZ');
    expect(result.parameters[0].name).toBe('XYZ');
    expect(result.parameters[0].abnormal).toBe(false);
  });

  it('fixture result has all normal values', () => {
    const result = parseCombilyzerOutput(FIXTURE);

    // The fixture is a "normal" urinalysis — every parameter should be non-abnormal
    for (const param of result.parameters) {
      expect(param.abnormal).toBe(false);
    }
  });

  it('stores raw output for audit trail', () => {
    const input = 'H|\\^&|||Combilyzer13|||||||P|1|20260305120000\nL|1|N';
    const result = parseCombilyzerOutput(input);

    expect(result.rawOutput).toBe(input);
  });

  it('handles UBG value of 0.2 as normal', () => {
    const input = [
      'H|\\^&|||Combilyzer13|||||||P|1|20260305120000',
      'P|1',
      'O|1|12345678||^^^UA|R|||||A',
      'R|1|^^^UBG|0.2|0.2|mg/dL|0.1-1.0|N||F',
      'L|1|N',
    ].join('\n');

    const result = parseCombilyzerOutput(input);

    expect(result.parameters[0].code).toBe('UBG');
    expect(result.parameters[0].abnormal).toBe(false);
  });
});
