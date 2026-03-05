/**
 * Tests for Tosoh AIA-360 analyzer mapping.
 */
import { describe, it, expect } from 'vitest';
import { tosohAia360Mapping } from './tosoh-aia360.js';

describe('tosoh-aia360 mapping', () => {
  it('should have 31 entries', () => {
    expect(Object.keys(tosohAia360Mapping)).toHaveLength(31);
  });

  it('should map TSH to LOINC 11579-0', () => {
    expect(tosohAia360Mapping['TSH'].loinc).toBe('11579-0');
    expect(tosohAia360Mapping['TSH'].unit).toBe('uIU/mL');
  });

  it('should map cardiac markers', () => {
    expect(tosohAia360Mapping['CTNI'].loinc).toBe('49563-0');
    expect(tosohAia360Mapping['MYO'].loinc).toBe('30088-9');
  });

  it('should have loinc and display on every entry', () => {
    for (const [key, entry] of Object.entries(tosohAia360Mapping)) {
      expect(entry.loinc, `${key} missing loinc`).toBeTruthy();
      expect(entry.display, `${key} missing display`).toBeTruthy();
    }
  });
});
