/**
 * Connection interface types.
 * Defines the contract that all connection wrappers (serial port, TCP socket)
 * must follow. Think of it like a USB standard — any device that plugs in
 * must support open, close, write, and emit data/error/close events.
 */

import { EventEmitter } from 'node:events';

/** The three events every connection can emit */
export type ConnectionEvent = 'data' | 'error' | 'close';

/** Options shared by all connection types */
export interface ConnectionOptions {
  /** Automatically reconnect on disconnect? */
  autoReconnect?: boolean;
  /** Milliseconds between reconnection attempts (default: 5000) */
  reconnectIntervalMs?: number;
}

/**
 * The contract every connection wrapper must implement.
 * Extends EventEmitter so callers can listen for 'data', 'error', and 'close'.
 */
export interface IConnection extends EventEmitter {
  /** Connect to the device */
  open(): Promise<void>;
  /** Disconnect from the device */
  close(): Promise<void>;
  /** Send bytes to the device */
  write(data: Buffer): Promise<void>;
  /** Check if currently connected */
  isOpen(): boolean;
}
