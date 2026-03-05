/**
 * Tests for the Siemens LIS3 stub driver.
 *
 * Verifies that the stub behaves correctly:
 * - start() logs the "not implemented" warning
 * - getStatus() reports the driver as disabled
 * - stop() is a safe no-op
 */

import { describe, it, expect, vi } from 'vitest';
import { SiemensLIS3Driver } from './lis3Driver.js';

describe('SiemensLIS3Driver', () => {
  it('start() logs a warning via console.warn when no logger provided', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const driver = new SiemensLIS3Driver();

    driver.start();

    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('document 10844061'),
    );
    spy.mockRestore();
  });

  it('start() logs via Winston logger when one is provided', () => {
    const mockLogger = { warn: vi.fn() } as any;
    const driver = new SiemensLIS3Driver(mockLogger);

    driver.start();

    expect(mockLogger.warn).toHaveBeenCalledOnce();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('RapidPoint 500e'),
    );
  });

  it('getStatus() returns disabled with awaiting-vendor-spec reason', () => {
    const driver = new SiemensLIS3Driver();
    const status = driver.getStatus();

    expect(status).toEqual({
      enabled: false,
      reason: 'awaiting-vendor-spec',
    });
  });

  it('stop() does not throw', () => {
    const driver = new SiemensLIS3Driver();
    expect(() => driver.stop()).not.toThrow();
  });
});
