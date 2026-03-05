/**
 * Tests for Roche Hitachi 917/7180 analyzer mapping.
 */
import { describe, it, expect } from 'vitest';
import { rocheHitachiMapping } from './roche-hitachi.js';

describe('roche-hitachi mapping', () => {
  it('should have 29 entries', () => {
    expect(Object.keys(rocheHitachiMapping)).toHaveLength(29);
  });

  it('should map channel 1 (Glucose) to LOINC 2345-7', () => {
    expect(rocheHitachiMapping['1'].loinc).toBe('2345-7');
  });

  it('should map electrolytes by name', () => {
    expect(rocheHitachiMapping['Na'].loinc).toBe('2951-2');
    expect(rocheHitachiMapping['K'].loinc).toBe('2823-3');
  });

  it('should have loinc, display, and unit on every entry', () => {
    for (const [key, entry] of Object.entries(rocheHitachiMapping)) {
      expect(entry.loinc, `${key} missing loinc`).toBeTruthy();
      expect(entry.display, `${key} missing display`).toBeTruthy();
      expect(entry.unit, `${key} missing unit`).toBeTruthy();
    }
  });
});
