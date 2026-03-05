/**
 * Analyzer mapping registry — maps analyzer IDs to their test code lookups.
 *
 * Think of this as a phone book: you tell it which analyzer sent a result,
 * and it hands you the right dictionary to translate the test codes into
 * LOINC codes, display names, and units.
 *
 * Analyzer IDs match the `id` field in analyzers.json configuration.
 */
import type { AnalyzerMapping } from './types.js';
import { sysmexXN550Mapping } from './sysmex-xn550.js';
import { mindrayBC3510Mapping } from './mindray-bc3510.js';
import { rocheCobasC111Mapping } from './roche-cobas-c111.js';
import { rocheCobasE411Mapping } from './roche-cobas-e411.js';
import { rocheHitachiMapping } from './roche-hitachi.js';
import { bioRadD10Mapping } from './bio-rad-d10.js';
import { tosohAia360Mapping } from './tosoh-aia360.js';
import { snibeMaglumiX3Mapping } from './snibe-maglumi-x3.js';
import { combilyzer13Mapping } from './combilyzer-13.js';

/**
 * Registry mapping analyzer IDs (from config) to their test code mappings.
 *
 * The keys here must match the `id` field in analyzers.json. When a new
 * analyzer is added to the config, add its mapping here too.
 */
const registry: Record<string, AnalyzerMapping> = {
  'sysmex-xn550': sysmexXN550Mapping,
  'mindray-bc3510': mindrayBC3510Mapping,
  'roche-cobas-c111': rocheCobasC111Mapping,
  'roche-cobas-e411': rocheCobasE411Mapping,
  'roche-hitachi': rocheHitachiMapping,
  'bio-rad-d10': bioRadD10Mapping,
  'tosoh-aia360': tosohAia360Mapping,
  'snibe-maglumi-x3': snibeMaglumiX3Mapping,
  'combilyzer-13': combilyzer13Mapping,
};

/**
 * Get the test code mapping for a specific analyzer.
 *
 * @param analyzerId - The analyzer ID from configuration (e.g., "sysmex-xn550")
 * @returns The mapping dictionary, or null if no mapping exists for this analyzer
 */
export function getMappingForAnalyzer(analyzerId: string): AnalyzerMapping | null {
  return registry[analyzerId] ?? null;
}

/**
 * Get all registered analyzer IDs that have mappings.
 */
export function getRegisteredAnalyzerIds(): string[] {
  return Object.keys(registry);
}
