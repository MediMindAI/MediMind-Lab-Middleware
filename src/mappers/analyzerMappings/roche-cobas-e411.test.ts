/**
 * Tests for Roche Cobas e 411 analyzer mapping.
 */
import { describe, it, expect } from 'vitest';
import { rocheCobasE411Mapping } from './roche-cobas-e411.js';

describe('roche-cobas-e411 mapping', () => {
  it('should have 38 entries', () => {
    expect(Object.keys(rocheCobasE411Mapping)).toHaveLength(38);
  });

  it('should map code 146 (TSH) to LOINC 11579-0', () => {
    expect(rocheCobasE411Mapping['146'].loinc).toBe('11579-0');
    expect(rocheCobasE411Mapping['146'].unit).toBe('uIU/mL');
  });

  it('should map cardiac markers', () => {
    expect(rocheCobasE411Mapping['163'].loinc).toBe('67151-1'); // hs-Troponin T
    expect(rocheCobasE411Mapping['165'].loinc).toBe('33762-6'); // NT-proBNP
  });

  it('should map tumor markers', () => {
    expect(rocheCobasE411Mapping['130'].loinc).toBe('2857-1'); // PSA
    expect(rocheCobasE411Mapping['113'].loinc).toBe('2039-6'); // CEA
  });

  it('should have loinc and display on every entry', () => {
    for (const [key, entry] of Object.entries(rocheCobasE411Mapping)) {
      expect(entry.loinc, `${key} missing loinc`).toBeTruthy();
      expect(entry.display, `${key} missing display`).toBeTruthy();
    }
  });
});
