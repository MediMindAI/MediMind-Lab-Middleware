/**
 * Tests for Mindray BC-7600 analyzer mapping (5-part diff, 32 parameters).
 */
import { describe, it, expect } from 'vitest';
import { mindrayBC7600Mapping } from './mindray-bc7600.js';

describe('mindray-bc7600 mapping', () => {
  it('should have 32 entries', () => {
    expect(Object.keys(mindrayBC7600Mapping)).toHaveLength(32);
  });

  it('should map WBC to LOINC 6690-2', () => {
    expect(mindrayBC7600Mapping['WBC'].loinc).toBe('6690-2');
  });

  it('should map 5-part differential (NEU, LYM, MON, EOS, BAS)', () => {
    expect(mindrayBC7600Mapping['NEU#'].loinc).toBe('751-8');
    expect(mindrayBC7600Mapping['LYM#'].loinc).toBe('731-0');
    expect(mindrayBC7600Mapping['MON#'].loinc).toBe('742-7');
    expect(mindrayBC7600Mapping['EOS#'].loinc).toBe('711-2');
    expect(mindrayBC7600Mapping['BAS#'].loinc).toBe('704-7');
  });

  it('should map reticulocyte parameters', () => {
    expect(mindrayBC7600Mapping['RET#'].loinc).toBe('14196-0');
    expect(mindrayBC7600Mapping['RET%'].loinc).toBe('4679-7');
    expect(mindrayBC7600Mapping['IRF'].loinc).toBe('33516-6');
  });

  it('should map CRP parameters', () => {
    expect(mindrayBC7600Mapping['CRP'].loinc).toBe('1988-5');
    expect(mindrayBC7600Mapping['HS-CRP'].loinc).toBe('30522-7');
  });

  it('should have loinc, display, and unit on every entry', () => {
    for (const [key, entry] of Object.entries(mindrayBC7600Mapping)) {
      expect(entry.loinc, `${key} missing loinc`).toBeTruthy();
      expect(entry.display, `${key} missing display`).toBeTruthy();
      expect(entry.unit, `${key} missing unit`).toBeTruthy();
    }
  });
});
