/**
 * Tests for Bio-Rad D-10 analyzer mapping.
 */
import { describe, it, expect } from 'vitest';
import { bioRadD10Mapping } from './bio-rad-d10.js';

describe('bio-rad-d10 mapping', () => {
  it('should have 6 entries', () => {
    expect(Object.keys(bioRadD10Mapping)).toHaveLength(6);
  });

  it('should map A1c to LOINC 4548-4', () => {
    expect(bioRadD10Mapping['A1c'].loinc).toBe('4548-4');
    expect(bioRadD10Mapping['A1c'].unit).toBe('%');
  });

  it('should map A1c_IFCC with mmol/mol unit', () => {
    expect(bioRadD10Mapping['A1c_IFCC'].loinc).toBe('59261-8');
    expect(bioRadD10Mapping['A1c_IFCC'].unit).toBe('mmol/mol');
  });

  it('should have loinc, display, and unit on every entry', () => {
    for (const [key, entry] of Object.entries(bioRadD10Mapping)) {
      expect(entry.loinc, `${key} missing loinc`).toBeTruthy();
      expect(entry.display, `${key} missing display`).toBeTruthy();
      expect(entry.unit, `${key} missing unit`).toBeTruthy();
    }
  });
});
