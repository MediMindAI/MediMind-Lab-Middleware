/**
 * Siemens LIS3 driver — STUB.
 *
 * The RapidPoint 500e uses Siemens' proprietary LIS3 protocol, but
 * we don't have the vendor specification (document 10844061).
 * This driver is a safe no-op: it logs a warning on start and
 * reports itself as disabled so the rest of the middleware skips it.
 *
 * When Siemens provides the spec, we'll replace this with a real
 * implementation that speaks LIS3 over serial/TCP.
 */

import type { Logger } from 'winston';

/** Status returned by the Siemens stub driver */
export interface SiemensDriverStatus {
  enabled: false;
  reason: 'awaiting-vendor-spec';
}

const WARNING_MESSAGE =
  'Siemens LIS3 driver not implemented — awaiting vendor specification document 10844061. RapidPoint 500e analyzer will be disabled.';

/**
 * Stub driver for the Siemens RapidPoint 500e.
 * Does nothing except log a warning and report disabled status.
 */
export class SiemensLIS3Driver {
  private readonly logger: Logger | undefined;

  constructor(logger?: Logger) {
    this.logger = logger;
  }

  /** Logs a warning that this driver is not yet implemented. */
  start(): void {
    if (this.logger) {
      this.logger.warn(WARNING_MESSAGE);
    } else {
      console.warn(WARNING_MESSAGE);
    }
  }

  /** No-op — nothing to clean up since the driver is a stub. */
  stop(): void {
    // Nothing to do
  }

  /** Always returns disabled status. */
  getStatus(): SiemensDriverStatus {
    return { enabled: false, reason: 'awaiting-vendor-spec' };
  }
}
