/**
 * Tests for configLoader — the module that reads analyzers.json and env vars
 * to build the app configuration.
 *
 * Covers:
 * - loadConfig(): valid files, missing/invalid files, validation errors, env overrides
 * - getEnabledAnalyzers(): filtering enabled vs disabled analyzers
 *
 * Uses temp files in os.tmpdir() so tests never touch the real config.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { loadConfig, getEnabledAnalyzers } from './configLoader.js';
import type { AppConfig, AnalyzerConfig } from '../types/analyzer.js';

// ---------------------------------------------------------------------------
// Helpers — build valid config objects and write them to temp files
// ---------------------------------------------------------------------------

/** Builds a minimal valid AppConfig object. Override any part via the partial. */
function buildValidConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    analyzers: [
      {
        id: 'test-analyzer-1',
        name: 'Test Analyzer 1',
        protocol: 'astm',
        connection: 'serial',
        port: 'COM3',
        baudRate: 9600,
        dataBits: 8,
        parity: 'none',
        stopBits: 1,
        enabled: true,
      },
    ],
    medplum: {
      baseUrl: 'https://api.medplum.com',
      projectId: 'test-project-id',
      clientId: 'test-client-id',
      clientSecret: 'test-secret',
    },
    api: { port: 3001, host: '0.0.0.0' },
    queue: { dbPath: './data/queue.db', retryIntervalMs: 30000, maxRetries: 10 },
    logging: { level: 'info', dir: './logs', maxFiles: 30, maxSizeMb: 50 },
    ...overrides,
  };
}

/** Writes JSON to a temp file and returns the absolute path. */
function writeTempConfig(content: unknown): string {
  const filePath = join(tmpdir(), `configLoader-test-${randomUUID()}.json`);
  writeFileSync(filePath, JSON.stringify(content, null, 2), 'utf-8');
  tempFiles.push(filePath);
  return filePath;
}

// Track temp files for cleanup
let tempFiles: string[] = [];

// Track original env vars so we can restore them
let savedEnv: Record<string, string | undefined> = {};
const ENV_KEYS = [
  'CONFIG_PATH',
  'MEDPLUM_BASE_URL',
  'MEDPLUM_CLIENT_ID',
  'MEDPLUM_CLIENT_SECRET',
  'MEDPLUM_PROJECT_ID',
  'API_PORT',
  'LOG_LEVEL',
  'LOG_DIR',
  'QUEUE_DB_PATH',
];

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Save current env values so we can restore after each test
  savedEnv = {};
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
  }
});

afterEach(() => {
  // Restore env vars
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = savedEnv[key];
    }
  }

  // Remove temp files
  for (const f of tempFiles) {
    if (existsSync(f)) {
      unlinkSync(f);
    }
  }
  tempFiles = [];

  vi.restoreAllMocks();
});

// ===========================================================================
// loadConfig()
// ===========================================================================

describe('loadConfig()', () => {
  it('loads a valid config file correctly', () => {
    const expected = buildValidConfig();
    const filePath = writeTempConfig(expected);
    process.env.CONFIG_PATH = filePath;

    const config = loadConfig();

    expect(config.analyzers).toHaveLength(1);
    expect(config.analyzers[0].id).toBe('test-analyzer-1');
    expect(config.analyzers[0].name).toBe('Test Analyzer 1');
    expect(config.analyzers[0].protocol).toBe('astm');
    expect(config.medplum.baseUrl).toBe('https://api.medplum.com');
    expect(config.medplum.clientId).toBe('test-client-id');
    expect(config.medplum.clientSecret).toBe('test-secret');
    expect(config.medplum.projectId).toBe('test-project-id');
    expect(config.api.port).toBe(3001);
    expect(config.api.host).toBe('0.0.0.0');
    expect(config.queue.dbPath).toBe('./data/queue.db');
    expect(config.queue.retryIntervalMs).toBe(30000);
    expect(config.queue.maxRetries).toBe(10);
    expect(config.logging.level).toBe('info');
    expect(config.logging.dir).toBe('./logs');
    expect(config.logging.maxFiles).toBe(30);
    expect(config.logging.maxSizeMb).toBe(50);
  });

  it('throws when config file does not exist', () => {
    process.env.CONFIG_PATH = '/tmp/does-not-exist-configloader-test.json';

    expect(() => loadConfig()).toThrow('Failed to load config');
  });

  it('throws when config file contains invalid JSON', () => {
    const filePath = join(tmpdir(), `configLoader-bad-json-${randomUUID()}.json`);
    writeFileSync(filePath, '{ this is not valid JSON!!!', 'utf-8');
    tempFiles.push(filePath);
    process.env.CONFIG_PATH = filePath;

    expect(() => loadConfig()).toThrow('Failed to load config');
  });

  it('throws when analyzers array is missing', () => {
    const config = buildValidConfig();
    // Remove analyzers entirely
    const { analyzers: _removed, ...noAnalyzers } = config;
    const filePath = writeTempConfig(noAnalyzers);
    process.env.CONFIG_PATH = filePath;

    expect(() => loadConfig()).toThrow('analyzers');
  });

  it('throws when analyzers is not an array', () => {
    const config = buildValidConfig();
    const modified = { ...config, analyzers: 'not-an-array' };
    const filePath = writeTempConfig(modified);
    process.env.CONFIG_PATH = filePath;

    expect(() => loadConfig()).toThrow('analyzers');
  });

  it('throws when medplum.baseUrl is missing', () => {
    const config = buildValidConfig();
    config.medplum.baseUrl = '';
    const filePath = writeTempConfig(config);
    process.env.CONFIG_PATH = filePath;

    expect(() => loadConfig()).toThrow('medplum.baseUrl');
  });

  it('throws when medplum.clientId is missing', () => {
    const config = buildValidConfig();
    config.medplum.clientId = '';
    const filePath = writeTempConfig(config);
    process.env.CONFIG_PATH = filePath;

    expect(() => loadConfig()).toThrow('medplum.clientId');
  });

  it('throws on duplicate analyzer IDs', () => {
    const config = buildValidConfig({
      analyzers: [
        {
          id: 'duplicate-id',
          name: 'Analyzer A',
          protocol: 'astm',
          connection: 'serial',
          port: 'COM3',
          baudRate: 9600,
          dataBits: 8,
          parity: 'none',
          stopBits: 1,
          enabled: true,
        },
        {
          id: 'duplicate-id',
          name: 'Analyzer B',
          protocol: 'astm',
          connection: 'serial',
          port: 'COM4',
          baudRate: 9600,
          dataBits: 8,
          parity: 'none',
          stopBits: 1,
          enabled: true,
        },
      ],
    });
    const filePath = writeTempConfig(config);
    process.env.CONFIG_PATH = filePath;

    expect(() => loadConfig()).toThrow('Duplicate analyzer IDs');
    // Verify the actual duplicate ID is mentioned in the error message
    try {
      loadConfig();
    } catch (err) {
      expect((err as Error).message).toContain('duplicate-id');
    }
  });

  it('throws on duplicate serial ports for enabled analyzers', () => {
    const config = buildValidConfig({
      analyzers: [
        {
          id: 'analyzer-a',
          name: 'Analyzer A',
          protocol: 'astm',
          connection: 'serial',
          port: 'COM3',
          baudRate: 9600,
          dataBits: 8,
          parity: 'none',
          stopBits: 1,
          enabled: true,
        },
        {
          id: 'analyzer-b',
          name: 'Analyzer B',
          protocol: 'astm',
          connection: 'serial',
          port: 'COM3',
          baudRate: 9600,
          dataBits: 8,
          parity: 'none',
          stopBits: 1,
          enabled: true,
        },
      ],
    });
    const filePath = writeTempConfig(config);
    process.env.CONFIG_PATH = filePath;

    expect(() => loadConfig()).toThrow('Duplicate serial ports');
    try {
      loadConfig();
    } catch (err) {
      expect((err as Error).message).toContain('COM3');
    }
  });

  it('allows duplicate serial ports if one analyzer is disabled', () => {
    const config = buildValidConfig({
      analyzers: [
        {
          id: 'analyzer-a',
          name: 'Analyzer A',
          protocol: 'astm',
          connection: 'serial',
          port: 'COM3',
          baudRate: 9600,
          dataBits: 8,
          parity: 'none',
          stopBits: 1,
          enabled: true,
        },
        {
          id: 'analyzer-b',
          name: 'Analyzer B',
          protocol: 'astm',
          connection: 'serial',
          port: 'COM3',
          baudRate: 9600,
          dataBits: 8,
          parity: 'none',
          stopBits: 1,
          enabled: false, // disabled — so the port conflict doesn't matter
        },
      ],
    });
    const filePath = writeTempConfig(config);
    process.env.CONFIG_PATH = filePath;

    // Should NOT throw — only enabled serial analyzers are checked for port conflicts
    const result = loadConfig();
    expect(result.analyzers).toHaveLength(2);
  });

  it('overrides medplum and other settings from environment variables', () => {
    const config = buildValidConfig();
    const filePath = writeTempConfig(config);
    process.env.CONFIG_PATH = filePath;

    // Set env overrides
    process.env.MEDPLUM_BASE_URL = 'https://override.medplum.com';
    process.env.MEDPLUM_CLIENT_ID = 'override-client-id';
    process.env.MEDPLUM_CLIENT_SECRET = 'override-secret';
    process.env.MEDPLUM_PROJECT_ID = 'override-project-id';
    process.env.API_PORT = '4000';
    process.env.LOG_LEVEL = 'debug';
    process.env.LOG_DIR = '/var/log/custom';
    process.env.QUEUE_DB_PATH = '/data/custom-queue.db';

    const result = loadConfig();

    expect(result.medplum.baseUrl).toBe('https://override.medplum.com');
    expect(result.medplum.clientId).toBe('override-client-id');
    expect(result.medplum.clientSecret).toBe('override-secret');
    expect(result.medplum.projectId).toBe('override-project-id');
    expect(result.api.port).toBe(4000);
    expect(result.logging.level).toBe('debug');
    expect(result.logging.dir).toBe('/var/log/custom');
    expect(result.queue.dbPath).toBe('/data/custom-queue.db');
  });

  it('warns when no analyzers are enabled', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const config = buildValidConfig({
      analyzers: [
        {
          id: 'disabled-1',
          name: 'Disabled Analyzer',
          protocol: 'astm',
          connection: 'serial',
          port: 'COM3',
          baudRate: 9600,
          dataBits: 8,
          parity: 'none',
          stopBits: 1,
          enabled: false,
        },
      ],
    });
    const filePath = writeTempConfig(config);
    process.env.CONFIG_PATH = filePath;

    const result = loadConfig();

    // Should still succeed — just warns
    expect(result.analyzers).toHaveLength(1);
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('No analyzers are enabled')
    );
  });
});

// ===========================================================================
// getEnabledAnalyzers()
// ===========================================================================

describe('getEnabledAnalyzers()', () => {
  it('returns only enabled analyzers from a mixed list', () => {
    const config = buildValidConfig({
      analyzers: [
        {
          id: 'enabled-1',
          name: 'Enabled 1',
          protocol: 'astm',
          connection: 'serial',
          port: 'COM3',
          baudRate: 9600,
          dataBits: 8,
          parity: 'none',
          stopBits: 1,
          enabled: true,
        },
        {
          id: 'disabled-1',
          name: 'Disabled 1',
          protocol: 'astm',
          connection: 'serial',
          port: 'COM4',
          baudRate: 9600,
          dataBits: 8,
          parity: 'none',
          stopBits: 1,
          enabled: false,
        },
        {
          id: 'enabled-2',
          name: 'Enabled 2',
          protocol: 'hl7v2',
          connection: 'tcp',
          host: '192.168.1.50',
          tcpPort: 5000,
          enabled: true,
        },
      ],
    });

    const result = getEnabledAnalyzers(config);

    expect(result).toHaveLength(2);
    expect(result.map((a) => a.id)).toEqual(['enabled-1', 'enabled-2']);
  });

  it('returns empty array when all analyzers are disabled', () => {
    const config = buildValidConfig({
      analyzers: [
        {
          id: 'disabled-1',
          name: 'Disabled 1',
          protocol: 'astm',
          connection: 'serial',
          port: 'COM3',
          baudRate: 9600,
          dataBits: 8,
          parity: 'none',
          stopBits: 1,
          enabled: false,
        },
        {
          id: 'disabled-2',
          name: 'Disabled 2',
          protocol: 'astm',
          connection: 'serial',
          port: 'COM4',
          baudRate: 9600,
          dataBits: 8,
          parity: 'none',
          stopBits: 1,
          enabled: false,
        },
      ],
    });

    const result = getEnabledAnalyzers(config);

    expect(result).toHaveLength(0);
    expect(result).toEqual([]);
  });

  it('returns all analyzers when all are enabled', () => {
    const config = buildValidConfig({
      analyzers: [
        {
          id: 'enabled-1',
          name: 'Enabled 1',
          protocol: 'astm',
          connection: 'serial',
          port: 'COM3',
          baudRate: 9600,
          dataBits: 8,
          parity: 'none',
          stopBits: 1,
          enabled: true,
        },
        {
          id: 'enabled-2',
          name: 'Enabled 2',
          protocol: 'hl7v2',
          connection: 'serial',
          port: 'COM4',
          baudRate: 9600,
          dataBits: 8,
          parity: 'none',
          stopBits: 1,
          enabled: true,
        },
        {
          id: 'enabled-3',
          name: 'Enabled 3',
          protocol: 'astm',
          connection: 'tcp',
          host: '192.168.1.60',
          tcpPort: 5000,
          enabled: true,
        },
      ],
    });

    const result = getEnabledAnalyzers(config);

    expect(result).toHaveLength(3);
    expect(result.map((a) => a.id)).toEqual(['enabled-1', 'enabled-2', 'enabled-3']);
  });

  it('reflects analyzer additions and removals dynamically', () => {
    // Start with one enabled analyzer
    const config = buildValidConfig({
      analyzers: [
        {
          id: 'original',
          name: 'Original',
          protocol: 'astm',
          connection: 'serial',
          port: 'COM3',
          baudRate: 9600,
          dataBits: 8,
          parity: 'none',
          stopBits: 1,
          enabled: true,
        },
      ],
    });

    expect(getEnabledAnalyzers(config).map((a) => a.id)).toEqual(['original']);

    // Simulate adding a new analyzer to the config
    config.analyzers.push({
      id: 'new-analyzer',
      name: 'New Analyzer',
      protocol: 'hl7v2',
      connection: 'tcp',
      host: '192.168.1.100',
      tcpPort: 5000,
      enabled: true,
    });

    expect(getEnabledAnalyzers(config).map((a) => a.id)).toEqual(['original', 'new-analyzer']);

    // Simulate removing the original analyzer
    config.analyzers = config.analyzers.filter((a) => a.id !== 'original');

    expect(getEnabledAnalyzers(config).map((a) => a.id)).toEqual(['new-analyzer']);
  });
});
