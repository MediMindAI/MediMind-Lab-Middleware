/**
 * Tests for MockSerialPort — a fake serial port used in tests.
 *
 * These tests verify that MockSerialPort behaves like a real serial port:
 * opening, closing, writing data, and emitting events. This lets us test
 * the middleware's protocol drivers without any physical hardware.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MockSerialPort } from './mockSerial.js';

describe('MockSerialPort', () => {
  let port: MockSerialPort;

  beforeEach(() => {
    port = new MockSerialPort({ path: 'COM3', baudRate: 9600 });
  });

  it('starts with port closed (isOpen = false)', () => {
    expect(port.isOpen).toBe(false);
  });

  it('open() sets isOpen to true and emits "open"', () => {
    let openEmitted = false;
    port.on('open', () => {
      openEmitted = true;
    });

    port.open();

    expect(port.isOpen).toBe(true);
    expect(openEmitted).toBe(true);
  });

  it('open() calls callback if provided', () => {
    let callbackCalled = false;
    port.open(() => {
      callbackCalled = true;
    });

    expect(callbackCalled).toBe(true);
  });

  it('close() sets isOpen to false and emits "close"', () => {
    port.open();
    expect(port.isOpen).toBe(true);

    let closeEmitted = false;
    port.on('close', () => {
      closeEmitted = true;
    });

    port.close();

    expect(port.isOpen).toBe(false);
    expect(closeEmitted).toBe(true);
  });

  it('close() calls callback if provided', () => {
    port.open();

    let callbackCalled = false;
    port.close(() => {
      callbackCalled = true;
    });

    expect(callbackCalled).toBe(true);
  });

  it('emitData() causes "data" event with correct buffer', () => {
    port.open();

    let receivedData: Buffer | null = null;
    port.on('data', (data: Buffer) => {
      receivedData = data;
    });

    const testData = Buffer.from('Hello from analyzer');
    port.emitData(testData);

    expect(receivedData).not.toBeNull();
    expect(Buffer.isBuffer(receivedData)).toBe(true);
    expect(receivedData!.toString()).toBe('Hello from analyzer');
  });

  it('emitData() converts string input to Buffer', () => {
    port.open();

    let receivedData: Buffer | null = null;
    port.on('data', (data: Buffer) => {
      receivedData = data;
    });

    port.emitData('string data');

    expect(Buffer.isBuffer(receivedData)).toBe(true);
    expect(receivedData!.toString()).toBe('string data');
  });

  it('emitError() causes "error" event with correct error', () => {
    port.open();

    let receivedError: Error | null = null;
    port.on('error', (err: Error) => {
      receivedError = err;
    });

    const testError = new Error('Port disconnected');
    port.emitError(testError);

    expect(receivedError).toBe(testError);
    expect(receivedError!.message).toBe('Port disconnected');
  });

  it('write() stores data in written data array', () => {
    port.open();

    const data1 = Buffer.from([0x06]); // ACK byte
    const data2 = Buffer.from([0x15]); // NAK byte

    port.write(data1);
    port.write(data2);

    const written = port.getWrittenData();
    expect(written).toHaveLength(2);
    expect(written[0]).toEqual(data1);
    expect(written[1]).toEqual(data2);
  });

  it('write() converts string input to Buffer before storing', () => {
    port.open();

    port.write('ACK');

    const written = port.getWrittenData();
    expect(written).toHaveLength(1);
    expect(Buffer.isBuffer(written[0])).toBe(true);
    expect(written[0].toString()).toBe('ACK');
  });

  it('write() calls callback if provided', () => {
    port.open();

    let callbackCalled = false;
    let callbackError: Error | null | undefined;

    port.write(Buffer.from('test'), (err) => {
      callbackCalled = true;
      callbackError = err;
    });

    expect(callbackCalled).toBe(true);
    expect(callbackError).toBeNull();
  });

  it('write() emits "write" event for inspection', () => {
    port.open();

    let emittedData: Buffer | null = null;
    port.on('write', (data: Buffer) => {
      emittedData = data;
    });

    const testData = Buffer.from('outgoing data');
    port.write(testData);

    expect(emittedData).not.toBeNull();
    expect(emittedData!.toString()).toBe('outgoing data');
  });

  it('getWrittenData() returns all written buffers', () => {
    port.open();

    port.write(Buffer.from('first'));
    port.write(Buffer.from('second'));
    port.write(Buffer.from('third'));

    const written = port.getWrittenData();
    expect(written).toHaveLength(3);
    expect(written[0].toString()).toBe('first');
    expect(written[1].toString()).toBe('second');
    expect(written[2].toString()).toBe('third');
  });

  it('cannot write when port is closed — calls callback with error', () => {
    // Port starts closed, so don't call open()
    let callbackError: Error | null | undefined;

    port.write(Buffer.from('test'), (err) => {
      callbackError = err;
    });

    expect(callbackError).toBeInstanceOf(Error);
    expect(callbackError!.message).toContain('not open');
  });

  it('cannot write when port is closed — emits error if no callback', () => {
    let emittedError: Error | null = null;
    port.on('error', (err: Error) => {
      emittedError = err;
    });

    port.write(Buffer.from('test'));

    expect(emittedError).toBeInstanceOf(Error);
    expect(emittedError!.message).toContain('not open');
  });

  it('cannot write when port is closed — does not store data', () => {
    // Absorb the error event so Node doesn't throw
    port.on('error', () => {});

    port.write(Buffer.from('should not be stored'));

    expect(port.getWrittenData()).toHaveLength(0);
  });

  it('exposes config options passed to constructor', () => {
    const customPort = new MockSerialPort({ path: 'COM5', baudRate: 115200 });
    expect(customPort.path).toBe('COM5');
    expect(customPort.baudRate).toBe(115200);
  });
});
