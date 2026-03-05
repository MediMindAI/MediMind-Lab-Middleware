/**
 * Tests for Mindray BC-3510 analyzer mapping.
 */
import { describe, it, expect } from 'vitest';
import { mindrayBC3510Mapping } from './mindray-bc3510.js';

describe('mindray-bc3510 mapping', () => {
  it('should have 19 entries', () => {
    expect(Object.keys(mindrayBC3510Mapping)).toHaveLength(19);
  });

  it('should map WBC to LOINC 6690-2', () => {
    expect(mindrayBC3510Mapping['WBC'].loinc).toBe('6690-2');
  });

  it('should map HGB to LOINC 718-7', () => {
    expect(mindrayBC3510Mapping['HGB'].loinc).toBe('718-7');
  });

  it('should have loinc, display, and unit on every entry', () => {
    for (const [key, entry] of Object.entries(mindrayBC3510Mapping)) {
      expect(entry.loinc, `${key} missing loinc`).toBeTruthy();
      expect(entry.display, `${key} missing display`).toBeTruthy();
      expect(entry.unit, `${key} missing unit`).toBeTruthy();
    }
  });
});
