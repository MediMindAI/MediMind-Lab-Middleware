/**
 * Serial port connection wrapper.
 *
 * Wraps the `serialport` library behind the IConnection interface.
 * Think of it as a translator: the rest of the middleware speaks
 * "IConnection", and this class translates that to serial port commands.
 *
 * In tests, we inject a MockSerialPort instead of the real SerialPort
 * so we don't need physical hardware.
 */

import { EventEmitter } from 'node:events';
import type { IConnection } from './types.js';
import type { SerialConfig } from '../types/analyzer.js';

/**
 * The subset of SerialPort methods we actually use.
 * This lets us swap in MockSerialPort for testing.
 */
export interface SerialPortLike extends EventEmitter {
  isOpen: boolean;
  open(callback?: (err: Error | null) => void): void;
  close(callback?: (err: Error | null) => void): void;
  write(data: Buffer | string, callback?: (err: Error | null) => void): void;
}

/**
 * Factory function that creates a serial port instance.
 * Default uses the real `serialport` library; tests override with MockSerialPort.
 */
export type SerialPortFactory = (config: SerialConfig) => SerialPortLike;

export class SerialConnection extends EventEmitter implements IConnection {
  private port: SerialPortLike | null = null;
  private readonly config: SerialConfig;
  private readonly factory: SerialPortFactory;

  constructor(config: SerialConfig, factory?: SerialPortFactory) {
    super();
    this.config = config;
    this.factory = factory ?? SerialConnection.defaultFactory;
  }

  /** Default factory — dynamically imports the real serialport library */
  private static defaultFactory: SerialPortFactory = () => {
    throw new Error(
      'Real SerialPort factory not set. ' +
      'Use SerialConnection.setDefaultFactory() or pass a factory to the constructor.'
    );
  };

  /** Set the default factory (called once at startup with the real SerialPort) */
  static setDefaultFactory(factory: SerialPortFactory): void {
    SerialConnection.defaultFactory = factory;
  }

  async open(): Promise<void> {
    this.port = this.factory(this.config);

    // Forward events from the underlying port to our IConnection interface
    this.port.on('data', (data: Buffer) => this.emit('data', data));
    this.port.on('error', (err: Error) => this.emit('error', err));
    this.port.on('close', () => this.emit('close'));

    return new Promise<void>((resolve, reject) => {
      this.port!.open((err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }

  async close(): Promise<void> {
    if (!this.port || !this.port.isOpen) return;

    return new Promise<void>((resolve, reject) => {
      this.port!.close((err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }

  async write(data: Buffer): Promise<void> {
    if (!this.port || !this.port.isOpen) {
      throw new Error('Serial port is not open');
    }

    return new Promise<void>((resolve, reject) => {
      this.port!.write(data, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }

  isOpen(): boolean {
    return this.port?.isOpen ?? false;
  }
}
