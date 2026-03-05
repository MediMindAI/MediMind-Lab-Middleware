/**
 * Tests for SerialConnection — the serial port wrapper.
 *
 * Uses MockSerialPort to simulate a physical serial port.
 * No real hardware needed — the mock pretends to be a COM port.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SerialConnection, type SerialPortLike } from './serialConnection.js';
import { MockSerialPort } from '../simulators/mockSerial.js';
import type { SerialConfig } from '../types/analyzer.js';

const TEST_CONFIG: SerialConfig = {
  connection: 'serial',
  port: 'COM3',
  baudRate: 9600,
  dataBits: 8,
  parity: 'none',
  stopBits: 1,
};

/** Factory that returns a MockSerialPort instead of a real one */
function mockFactory(): SerialPortLike {
  return new MockSerialPort({ path: TEST_CONFIG.port, baudRate: TEST_CONFIG.baudRate });
}

describe('SerialConnection', () => {
  let conn: SerialConnection;

  beforeEach(() => {
    conn = new SerialConnection(TEST_CONFIG, mockFactory);
  });

  it('starts disconnected (isOpen = false)', () => {
    expect(conn.isOpen()).toBe(false);
  });

  it('open() connects and reports isOpen = true', async () => {
    await conn.open();
    expect(conn.isOpen()).toBe(true);
  });

  it('close() disconnects and reports isOpen = false', async () => {
    await conn.open();
    expect(conn.isOpen()).toBe(true);

    await conn.close();
    expect(conn.isOpen()).toBe(false);
  });

  it('close() is safe to call when already closed', async () => {
    // Should not throw
    await conn.close();
    expect(conn.isOpen()).toBe(false);
  });

  it('emits data events when the port receives data', async () => {
    await conn.open();

    const handler = vi.fn();
    conn.on('data', handler);

    // We need access to the underlying mock to simulate incoming data.
    // The mock is created by the factory, and the data event is forwarded.
    // We'll use a custom factory that exposes the mock.
    const mock = new MockSerialPort({ path: 'COM3', baudRate: 9600 });
    const exposedConn = new SerialConnection(TEST_CONFIG, () => mock);
    const dataHandler = vi.fn();
    exposedConn.on('data', dataHandler);

    await exposedConn.open();
    mock.emitData(Buffer.from('WBC=7.5'));

    expect(dataHandler).toHaveBeenCalledOnce();
    expect(dataHandler).toHaveBeenCalledWith(Buffer.from('WBC=7.5'));
  });

  it('emits error events from the underlying port', async () => {
    const mock = new MockSerialPort({ path: 'COM3', baudRate: 9600 });
    const errorConn = new SerialConnection(TEST_CONFIG, () => mock);
    const errorHandler = vi.fn();
    errorConn.on('error', errorHandler);

    await errorConn.open();
    mock.emitError(new Error('Cable disconnected'));

    expect(errorHandler).toHaveBeenCalledOnce();
    expect(errorHandler.mock.calls[0][0].message).toBe('Cable disconnected');
  });

  it('emits close events from the underlying port', async () => {
    const mock = new MockSerialPort({ path: 'COM3', baudRate: 9600 });
    const closeConn = new SerialConnection(TEST_CONFIG, () => mock);
    const closeHandler = vi.fn();
    closeConn.on('close', closeHandler);

    await closeConn.open();
    mock.close();

    expect(closeHandler).toHaveBeenCalledOnce();
  });

  it('write() sends data through the port', async () => {
    const mock = new MockSerialPort({ path: 'COM3', baudRate: 9600 });
    const writeConn = new SerialConnection(TEST_CONFIG, () => mock);

    await writeConn.open();
    await writeConn.write(Buffer.from([0x06])); // ACK byte

    const written = mock.getWrittenData();
    expect(written).toHaveLength(1);
    expect(written[0]).toEqual(Buffer.from([0x06]));
  });

  it('write() throws when port is not open', async () => {
    await expect(conn.write(Buffer.from('test'))).rejects.toThrow('not open');
  });

  it('passes config to the factory', async () => {
    const factorySpy = vi.fn(() => new MockSerialPort({ path: 'COM5', baudRate: 115200 }));
    const customConfig: SerialConfig = {
      connection: 'serial',
      port: 'COM5',
      baudRate: 115200,
      dataBits: 7,
      parity: 'even',
      stopBits: 2,
    };

    const customConn = new SerialConnection(customConfig, factorySpy);
    await customConn.open();

    expect(factorySpy).toHaveBeenCalledOnce();
    expect(factorySpy).toHaveBeenCalledWith(customConfig);
  });
});
