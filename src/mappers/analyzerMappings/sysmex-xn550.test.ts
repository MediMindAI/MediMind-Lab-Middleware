/**
 * Tests for Sysmex XN-550 analyzer mapping.
 *
 * Verifies the mapping has the expected number of entries,
 * that key parameters map to the correct LOINC codes,
 * and that every entry has the required fields.
 */
import { describe, it, expect } from 'vitest';
import { sysmexXN550Mapping } from './sysmex-xn550.js';

describe('sysmex-xn550 mapping', () => {
  it('should have exactly 23 entries', () => {
    expect(Object.keys(sysmexXN550Mapping)).toHaveLength(23);
  });

  it('should map WBC to LOINC 6690-2', () => {
    const wbc = sysmexXN550Mapping['WBC'];
    expect(wbc).toBeDefined();
    expect(wbc.loinc).toBe('6690-2');
    expect(wbc.display).toContain('Leukocytes');
    expect(wbc.unit).toBe('10*3/uL');
    expect(wbc.defaultReferenceRange).toBe('4.5-11.0');
  });

  it('should map HGB to LOINC 718-7', () => {
    const hgb = sysmexXN550Mapping['HGB'];
    expect(hgb).toBeDefined();
    expect(hgb.loinc).toBe('718-7');
    expect(hgb.display).toContain('Hemoglobin');
  });

  it('should map PLT to LOINC 777-3', () => {
    const plt = sysmexXN550Mapping['PLT'];
    expect(plt).toBeDefined();
    expect(plt.loinc).toBe('777-3');
    expect(plt.display).toContain('Platelets');
  });

  it('should handle keys with special characters (NEUT%, NEUT#)', () => {
    expect(sysmexXN550Mapping['NEUT%']).toBeDefined();
    expect(sysmexXN550Mapping['NEUT%'].loinc).toBe('770-8');
    expect(sysmexXN550Mapping['NEUT#']).toBeDefined();
    expect(sysmexXN550Mapping['NEUT#'].loinc).toBe('751-8');
  });

  it('should have loinc, display, and unit on every entry', () => {
    for (const [key, entry] of Object.entries(sysmexXN550Mapping)) {
      expect(entry.loinc, `${key} missing loinc`).toBeTruthy();
      expect(entry.display, `${key} missing display`).toBeTruthy();
      expect(entry.unit, `${key} missing unit`).toBeTruthy();
    }
  });

  it('should have unique LOINC codes (no duplicates)', () => {
    const loincs = Object.values(sysmexXN550Mapping).map((e) => e.loinc);
    const unique = new Set(loincs);
    expect(unique.size).toBe(loincs.length);
  });
});
