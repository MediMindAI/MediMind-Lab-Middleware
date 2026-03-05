/**
 * Tests for Roche Cobas c 111 analyzer mapping.
 */
import { describe, it, expect } from 'vitest';
import { rocheCobasC111Mapping } from './roche-cobas-c111.js';

describe('roche-cobas-c111 mapping', () => {
  it('should have 28 entries', () => {
    expect(Object.keys(rocheCobasC111Mapping)).toHaveLength(29);
  });

  it('should map ACN 401 (Glucose) to LOINC 2345-7', () => {
    expect(rocheCobasC111Mapping['401'].loinc).toBe('2345-7');
    expect(rocheCobasC111Mapping['401'].unit).toBe('mg/dL');
  });

  it('should map electrolytes by name (Na, K, Cl)', () => {
    expect(rocheCobasC111Mapping['Na'].loinc).toBe('2951-2');
    expect(rocheCobasC111Mapping['K'].loinc).toBe('2823-3');
    expect(rocheCobasC111Mapping['Cl'].loinc).toBe('2075-0');
  });

  it('should have loinc, display, and unit on every entry', () => {
    for (const [key, entry] of Object.entries(rocheCobasC111Mapping)) {
      expect(entry.loinc, `${key} missing loinc`).toBeTruthy();
      expect(entry.display, `${key} missing display`).toBeTruthy();
      expect(entry.unit, `${key} missing unit`).toBeTruthy();
    }
  });
});
