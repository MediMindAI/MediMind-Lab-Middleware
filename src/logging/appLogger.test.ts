/**
 * Tests for the application logger (Winston-based).
 *
 * Verifies that createAppLogger produces a correctly configured Winston logger
 * with console output, daily-rotated combined logs, and error-only logs.
 * Uses a temp directory for log files so tests don't pollute the project.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import winston from 'winston';
import { createAppLogger, type LoggerConfig } from './appLogger.js';

/** Wait for a logger to fully close all transports. */
function closeLogger(logger: winston.Logger): Promise<void> {
  return new Promise((resolve) => {
    logger.on('finish', resolve);
    logger.end();
  });
}

describe('createAppLogger', () => {
  let tmpDir: string;
  let config: LoggerConfig;
  let logger: winston.Logger | null = null;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'applogger-test-'));
    config = {
      level: 'info',
      dir: tmpDir,
      maxFiles: 7,
      maxSizeMb: 10,
    };
  });

  afterEach(async () => {
    if (logger) {
      await closeLogger(logger);
      // Small delay to let rotate-file transports fully release handles
      await new Promise((r) => setTimeout(r, 50));
      logger = null;
    }
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors — temp dir will be reaped by OS
    }
  });

  it('creates logger with correct level (debug)', () => {
    logger = createAppLogger({ ...config, level: 'debug' });
    expect(logger.level).toBe('debug');
  });

  it('creates logger with correct level (info)', () => {
    logger = createAppLogger({ ...config, level: 'info' });
    expect(logger.level).toBe('info');
  });

  it('has a console transport', () => {
    logger = createAppLogger(config);
    const hasConsole = logger.transports.some(
      (t) => t instanceof winston.transports.Console,
    );
    expect(hasConsole).toBe(true);
  });

  it('has at least two file-related transports (combined + error)', () => {
    logger = createAppLogger(config);
    // DailyRotateFile transports are not instances of winston.transports.File,
    // so we count non-Console transports as file-related.
    const fileTransports = logger.transports.filter(
      (t) => !(t instanceof winston.transports.Console),
    );
    expect(fileTransports.length).toBeGreaterThanOrEqual(2);
  });

  it('logger.info() works without throwing', () => {
    logger = createAppLogger(config);
    expect(() => {
      logger!.info('test message', { key: 'value' });
    }).not.toThrow();
  });

  it('logger.error() works without throwing', () => {
    logger = createAppLogger(config);
    expect(() => {
      logger!.error('test error', { code: 'ERR_TEST' });
    }).not.toThrow();
  });

  it('respects log level — debug transport spy not called when level is error', () => {
    logger = createAppLogger({ ...config, level: 'error' });

    // Spy on the console transport's log method
    const consoleTransport = logger.transports.find(
      (t) => t instanceof winston.transports.Console,
    );
    expect(consoleTransport).toBeDefined();

    let logCalled = false;
    const originalLog = consoleTransport!.log!.bind(consoleTransport);
    consoleTransport!.log = (info: unknown, next: () => void) => {
      logCalled = true;
      return originalLog(info, next);
    };

    // Debug message should be suppressed because level is 'error'
    logger.debug('this should not appear');

    expect(logCalled).toBe(false);
  });
});
