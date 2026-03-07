/**
 * Configuration loader.
 * Reads analyzers.json and environment variables to build the app config.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AppConfig, AnalyzerConfig } from '../types/analyzer.js';

const DEFAULT_CONFIG_PATH = './config/analyzers.json';

export function loadConfig(): AppConfig {
  const configPath = process.env.CONFIG_PATH || DEFAULT_CONFIG_PATH;
  const absolutePath = resolve(configPath);

  let rawConfig: AppConfig;
  try {
    const fileContent = readFileSync(absolutePath, 'utf-8');
    rawConfig = JSON.parse(fileContent) as AppConfig;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to load config from ${absolutePath}: ${msg}`);
  }

  // Override with environment variables if set
  if (process.env.MEDPLUM_BASE_URL) {
    rawConfig.medplum.baseUrl = process.env.MEDPLUM_BASE_URL;
  }
  if (process.env.MEDPLUM_CLIENT_ID) {
    rawConfig.medplum.clientId = process.env.MEDPLUM_CLIENT_ID;
  }
  if (process.env.MEDPLUM_CLIENT_SECRET) {
    rawConfig.medplum.clientSecret = process.env.MEDPLUM_CLIENT_SECRET;
  }
  if (process.env.MEDPLUM_PROJECT_ID) {
    rawConfig.medplum.projectId = process.env.MEDPLUM_PROJECT_ID;
  }
  if (process.env.API_PORT) {
    rawConfig.api.port = parseInt(process.env.API_PORT, 10);
    if (isNaN(rawConfig.api.port)) {
      throw new Error(`Invalid API_PORT: "${process.env.API_PORT}" is not a number`);
    }
  }
  if (process.env.API_KEY) {
    rawConfig.api.apiKey = process.env.API_KEY;
  }
  if (process.env.CORS_ORIGIN) {
    rawConfig.api.corsOrigin = process.env.CORS_ORIGIN;
  }
  if (process.env.LOG_LEVEL) {
    rawConfig.logging.level = process.env.LOG_LEVEL;
  }
  if (process.env.LOG_DIR) {
    rawConfig.logging.dir = process.env.LOG_DIR;
  }
  if (process.env.QUEUE_DB_PATH) {
    rawConfig.queue.dbPath = process.env.QUEUE_DB_PATH;
  }

  validateConfig(rawConfig);
  return rawConfig;
}

function validateConfig(config: AppConfig): void {
  if (!config.analyzers || !Array.isArray(config.analyzers)) {
    throw new Error('Config must have an "analyzers" array');
  }

  if (!config.medplum?.baseUrl || !config.medplum?.clientId || !config.medplum?.clientSecret) {
    throw new Error('Config must have medplum.baseUrl, medplum.clientId, and medplum.clientSecret');
  }

  const enabledAnalyzers = config.analyzers.filter((a) => a.enabled);
  if (enabledAnalyzers.length === 0) {
    console.warn('Warning: No analyzers are enabled in the configuration');
  }

  // Check for duplicate IDs
  const ids = config.analyzers.map((a) => a.id);
  const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (duplicates.length > 0) {
    throw new Error(`Duplicate analyzer IDs found: ${duplicates.join(', ')}`);
  }

  // Check for duplicate ports
  const serialPorts = config.analyzers
    .filter((a): a is AnalyzerConfig & { connection: 'serial' } => a.connection === 'serial' && a.enabled)
    .map((a) => a.port);
  const dupPorts = serialPorts.filter((p, i) => serialPorts.indexOf(p) !== i);
  if (dupPorts.length > 0) {
    throw new Error(`Duplicate serial ports: ${dupPorts.join(', ')}`);
  }
}

/** Get only the enabled analyzers */
export function getEnabledAnalyzers(config: AppConfig): AnalyzerConfig[] {
  return config.analyzers.filter((a) => a.enabled);
}
