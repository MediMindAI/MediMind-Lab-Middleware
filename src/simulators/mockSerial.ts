/**
 * MockSerialPort — a fake serial port for testing.
 *
 * Instead of needing a real USB cable and lab machine plugged in,
 * this class pretends to be a serial port. Tests can use it to
 * simulate bytes flowing in and out, just like a real port would.
 *
 * Think of it like a toy walkie-talkie: it looks and acts like the
 * real thing, but there's no radio signal — just test data.
 *
 * Usage in tests:
 *   const port = new MockSerialPort({ path: 'COM3', baudRate: 9600 });
 *   port.open();
 *   port.emitData(Buffer.from('data from analyzer'));  // simulate incoming
 *   port.getWrittenData();  // inspect what middleware sent back
 */

import { EventEmitter } from 'node:events';

/** Options for creating a MockSerialPort (mirrors real serialport options) */
export interface MockSerialPortOptions {
  path: string;
  baudRate: number;
}

export class MockSerialPort extends EventEmitter {
  /** The serial port path, e.g. "COM3" or "/dev/ttyUSB0" */
  readonly path: string;

  /** The baud rate, e.g. 9600 */
  readonly baudRate: number;

  /** Whether the port is currently open */
  isOpen: boolean;

  /** Internal storage for data written via write() — used for test assertions */
  private writtenData: Buffer[];

  constructor(options: MockSerialPortOptions) {
    super();
    this.path = options.path;
    this.baudRate = options.baudRate;
    this.isOpen = false;
    this.writtenData = [];
  }

  /**
   * Opens the port. Sets isOpen = true and emits 'open'.
   * Optionally calls a callback when done.
   */
  open(callback?: (err: Error | null) => void): void {
    this.isOpen = true;
    this.emit('open');
    callback?.(null);
  }

  /**
   * Closes the port. Sets isOpen = false and emits 'close'.
   * Optionally calls a callback when done.
   */
  close(callback?: (err: Error | null) => void): void {
    this.isOpen = false;
    this.emit('close');
    callback?.(null);
  }

  /**
   * Simulates writing data to the port (i.e., middleware sending data
   * back to the analyzer). Stores the data so tests can inspect it
   * with getWrittenData().
   *
   * If the port is closed, reports an error via callback or 'error' event.
   */
  write(data: Buffer | string, callback?: (err: Error | null) => void): void {
    if (!this.isOpen) {
      const error = new Error('Port is not open');
      if (callback) {
        callback(error);
      } else {
        this.emit('error', error);
      }
      return;
    }

    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
    this.writtenData.push(buffer);
    this.emit('write', buffer);
    callback?.(null);
  }

  // --- Test helper methods ---

  /**
   * Simulates receiving data from the analyzer.
   * Emits a 'data' event with the provided data as a Buffer.
   */
  emitData(data: Buffer | string): void {
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
    this.emit('data', buffer);
  }

  /**
   * Simulates a port error (e.g., cable disconnected).
   * Emits an 'error' event with the provided error.
   */
  emitError(error: Error): void {
    this.emit('error', error);
  }

  /**
   * Returns all data that was written via write().
   * Use this in tests to assert what the middleware sent back to the analyzer.
   */
  getWrittenData(): Buffer[] {
    return [...this.writtenData];
  }
}
