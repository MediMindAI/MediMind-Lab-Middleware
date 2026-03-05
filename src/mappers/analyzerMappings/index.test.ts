/**
 * Tests for the analyzer mapping registry.
 *
 * Verifies that all 9 analyzers are registered, that lookups work correctly,
 * and that unknown analyzer IDs return null.
 */
import { describe, it, expect } from 'vitest';
import { getMappingForAnalyzer, getRegisteredAnalyzerIds } from './index.js';

describe('analyzer mapping registry', () => {
  it('should have all 9 analyzers registered', () => {
    const ids = getRegisteredAnalyzerIds();
    expect(ids).toHaveLength(9);
    expect(ids).toContain('sysmex-xn550');
    expect(ids).toContain('mindray-bc3510');
    expect(ids).toContain('roche-cobas-c111');
    expect(ids).toContain('roche-cobas-e411');
    expect(ids).toContain('roche-hitachi');
    expect(ids).toContain('bio-rad-d10');
    expect(ids).toContain('tosoh-aia360');
    expect(ids).toContain('snibe-maglumi-x3');
    expect(ids).toContain('combilyzer-13');
  });

  it('should return mapping for known analyzer', () => {
    const mapping = getMappingForAnalyzer('sysmex-xn550');
    expect(mapping).not.toBeNull();
    expect(mapping!['WBC']).toBeDefined();
    expect(mapping!['WBC'].loinc).toBe('6690-2');
  });

  it('should return null for unknown analyzer', () => {
    expect(getMappingForAnalyzer('nonexistent')).toBeNull();
    expect(getMappingForAnalyzer('')).toBeNull();
  });

  it('should return different mappings for different analyzers', () => {
    const sysmex = getMappingForAnalyzer('sysmex-xn550');
    const roche = getMappingForAnalyzer('roche-cobas-c111');
    expect(sysmex).not.toBe(roche);
    // Sysmex has WBC by name, Roche has it by ACN code
    expect(sysmex!['WBC']).toBeDefined();
    expect(roche!['401']).toBeDefined();
  });

  it('every registered mapping should have at least one entry', () => {
    for (const id of getRegisteredAnalyzerIds()) {
      const mapping = getMappingForAnalyzer(id);
      expect(mapping, `${id} returned null`).not.toBeNull();
      expect(Object.keys(mapping!).length, `${id} has no entries`).toBeGreaterThan(0);
    }
  });
});
