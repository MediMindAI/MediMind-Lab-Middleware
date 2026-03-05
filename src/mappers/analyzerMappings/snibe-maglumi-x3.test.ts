/**
 * Tests for Snibe Maglumi X3 analyzer mapping.
 */
import { describe, it, expect } from 'vitest';
import { snibeMaglumiX3Mapping } from './snibe-maglumi-x3.js';

describe('snibe-maglumi-x3 mapping', () => {
  it('should have 53 entries', () => {
    expect(Object.keys(snibeMaglumiX3Mapping)).toHaveLength(53);
  });

  it('should map thyroid codes (01xx)', () => {
    expect(snibeMaglumiX3Mapping['0101'].loinc).toBe('11579-0'); // TSH
    expect(snibeMaglumiX3Mapping['0105'].loinc).toBe('3024-7');  // FT4
  });

  it('should map tumor marker codes (03xx)', () => {
    expect(snibeMaglumiX3Mapping['0302'].loinc).toBe('2039-6'); // CEA
    expect(snibeMaglumiX3Mapping['0306'].loinc).toBe('2857-1'); // PSA
  });

  it('should map cardiac marker codes (04xx)', () => {
    expect(snibeMaglumiX3Mapping['0401'].loinc).toBe('89579-7'); // hs-TnI
    expect(snibeMaglumiX3Mapping['0406'].loinc).toBe('48058-2'); // D-Dimer
  });

  it('should have loinc and display on every entry', () => {
    for (const [key, entry] of Object.entries(snibeMaglumiX3Mapping)) {
      expect(entry.loinc, `${key} missing loinc`).toBeTruthy();
      expect(entry.display, `${key} missing display`).toBeTruthy();
    }
  });
});
