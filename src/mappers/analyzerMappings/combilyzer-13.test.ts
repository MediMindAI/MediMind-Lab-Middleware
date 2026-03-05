/**
 * Tests for Combilyzer 13 analyzer mapping.
 */
import { describe, it, expect } from 'vitest';
import { combilyzer13Mapping } from './combilyzer-13.js';

describe('combilyzer-13 mapping', () => {
  it('should have 13 entries', () => {
    expect(Object.keys(combilyzer13Mapping)).toHaveLength(13);
  });

  it('should map GLU (Glucose) to LOINC 5792-7', () => {
    expect(combilyzer13Mapping['GLU'].loinc).toBe('5792-7');
    expect(combilyzer13Mapping['GLU'].display).toContain('Glucose');
  });

  it('should map pH to LOINC 5803-2', () => {
    expect(combilyzer13Mapping['pH'].loinc).toBe('5803-2');
  });

  it('should map SG (Specific Gravity) to LOINC 5811-5', () => {
    expect(combilyzer13Mapping['SG'].loinc).toBe('5811-5');
  });

  it('should have loinc and display on every entry', () => {
    for (const [key, entry] of Object.entries(combilyzer13Mapping)) {
      expect(entry.loinc, `${key} missing loinc`).toBeTruthy();
      expect(entry.display, `${key} missing display`).toBeTruthy();
    }
  });
});
