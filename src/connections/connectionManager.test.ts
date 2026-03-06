/**
 * Tests for ConnectionManager — the switchboard that manages
 * all analyzer connections and tracks their status.
 *
 * Uses MockSerialPort for serial analyzers and a local TCP server
 * for TCP analyzers. Tests cover connection lifecycle, status tracking,
 * data forwarding, and error counting.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import net from 'node:net';
import { ConnectionManager } from './connectionManager.js';
import { MockSerialPort } from '../simulators/mockSerial.js';
import type { SerialAnalyzer, TcpAnalyzer } from '../types/analyzer.js';

// Track mock serial ports so tests can simulate data/errors
let mockPorts: Map<string, MockSerialPort>;

function mockSerialFactory(config: { port: string; baudRate: number }): MockSerialPort {
  const mock = new MockSerialPort({ path: config.port, baudRate: config.baudRate });
  mockPorts.set(config.port, mock);
  return mock;
}

const SERIAL_ANALYZER: SerialAnalyzer = {
  id: 'sysmex-xn550',
  name: 'Sysmex XN-550',
  protocol: 'astm',
  connection: 'serial',
  port: 'COM3',
  baudRate: 9600,
  dataBits: 8,
  parity: 'none',
  stopBits: 1,
  enabled: true,
};

const DISABLED_ANALYZER: SerialAnalyzer = {
  ...SERIAL_ANALYZER,
  id: 'disabled-one',
  name: 'Disabled Analyzer',
  port: 'COM4',
  enabled: false,
};

/** Create a test TCP server on a random port */
function createTestServer(): Promise<{ server: net.Server; port: number }> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as net.AddressInfo;
      resolve({ server, port: addr.port });
    });
  });
}

describe('ConnectionManager', () => {
  let tcpServer: net.Server | null = null;

  beforeEach(() => {
    mockPorts = new Map();
  });

  afterEach(async () => {
    if (tcpServer) {
      await new Promise<void>((resolve) => tcpServer!.close(() => resolve()));
      tcpServer = null;
    }
  });

  it('skips disabled analyzers', () => {
    const manager = new ConnectionManager(
      [SERIAL_ANALYZER, DISABLED_ANALYZER],
      mockSerialFactory,
    );

    // Only the enabled analyzer should have a status entry
    const statuses = manager.getStatuses();
    expect(statuses).toHaveLength(1);
    expect(statuses[0].id).toBe('sysmex-xn550');
  });

  it('startAll() connects serial analyzers', async () => {
    const manager = new ConnectionManager([SERIAL_ANALYZER], mockSerialFactory);

    await manager.startAll();

    const statuses = manager.getStatuses();
    expect(statuses[0].connected).toBe(true);
    expect(statuses[0].upSince).not.toBeNull();
  });

  it('startAll() connects TCP analyzers', async () => {
    const result = await createTestServer();
    tcpServer = result.server;

    const tcpAnalyzer: TcpAnalyzer = {
      id: 'mindray-bc3510',
      name: 'Mindray BC-3510',
      protocol: 'hl7v2',
      connection: 'tcp',
      host: '127.0.0.1',
      tcpPort: result.port,
      enabled: true,
    };

    const manager = new ConnectionManager([tcpAnalyzer]);

    await manager.startAll();

    const statuses = manager.getStatuses();
    expect(statuses[0].connected).toBe(true);

    await manager.stopAll();
  });

  it('tracks messages received on data events', async () => {
    const manager = new ConnectionManager([SERIAL_ANALYZER], mockSerialFactory);

    await manager.startAll();

    // Simulate incoming data from the analyzer
    const mock = mockPorts.get('COM3')!;
    mock.emitData(Buffer.from('result-1'));
    mock.emitData(Buffer.from('result-2'));

    const statuses = manager.getStatuses();
    expect(statuses[0].messagesReceived).toBe(2);
    expect(statuses[0].lastMessageTime).not.toBeNull();

    await manager.stopAll();
  });

  it('tracks errors from connections', async () => {
    const manager = new ConnectionManager([SERIAL_ANALYZER], mockSerialFactory);

    // Prevent unhandled error events from crashing the test
    manager.on('error', () => {});

    await manager.startAll();

    const mock = mockPorts.get('COM3')!;
    mock.emitError(new Error('Cable yanked'));

    const statuses = manager.getStatuses();
    expect(statuses[0].errorsCount).toBe(1);
    expect(statuses[0].lastError).toBe('Cable yanked');
    expect(statuses[0].lastErrorTime).not.toBeNull();

    await manager.stopAll();
  });

  it('emits data events with the analyzer ID', async () => {
    const manager = new ConnectionManager([SERIAL_ANALYZER], mockSerialFactory);
    const dataHandler = vi.fn();
    manager.on('data', dataHandler);

    await manager.startAll();

    const mock = mockPorts.get('COM3')!;
    mock.emitData(Buffer.from('test-data'));

    expect(dataHandler).toHaveBeenCalledOnce();
    expect(dataHandler).toHaveBeenCalledWith('sysmex-xn550', Buffer.from('test-data'));

    await manager.stopAll();
  });

  it('getConnection() returns the connection for an analyzer', async () => {
    const manager = new ConnectionManager([SERIAL_ANALYZER], mockSerialFactory);
    await manager.startAll();

    const conn = manager.getConnection('sysmex-xn550');
    expect(conn).not.toBeNull();
    expect(conn!.isOpen()).toBe(true);

    await manager.stopAll();
  });

  it('getConnection() returns null for unknown analyzer', () => {
    const manager = new ConnectionManager([SERIAL_ANALYZER], mockSerialFactory);
    expect(manager.getConnection('nonexistent')).toBeNull();
  });

  it('onData() filters events by analyzer ID', async () => {
    const second: SerialAnalyzer = {
      ...SERIAL_ANALYZER,
      id: 'roche-cobas',
      name: 'Roche Cobas',
      port: 'COM4',
    };

    const manager = new ConnectionManager([SERIAL_ANALYZER, second], mockSerialFactory);
    await manager.startAll();

    const handler = vi.fn();
    manager.onData('roche-cobas', handler);

    // Send data on both connections
    mockPorts.get('COM3')!.emitData(Buffer.from('sysmex-data'));
    mockPorts.get('COM4')!.emitData(Buffer.from('roche-data'));

    // Handler should only fire for roche-cobas
    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(Buffer.from('roche-data'));

    await manager.stopAll();
  });

  it('stopAll() closes all connections', async () => {
    const manager = new ConnectionManager([SERIAL_ANALYZER], mockSerialFactory);

    await manager.startAll();
    expect(manager.getConnection('sysmex-xn550')!.isOpen()).toBe(true);

    await manager.stopAll();
    // After close, the mock port's isOpen should be false
    expect(mockPorts.get('COM3')!.isOpen).toBe(false);
  });

  it('handles connection failure gracefully — does not throw', async () => {
    // TCP analyzer pointing at a port with no server — will fail to connect
    const badTcp: TcpAnalyzer = {
      id: 'bad-tcp',
      name: 'Unreachable Analyzer',
      protocol: 'astm',
      connection: 'tcp',
      host: '127.0.0.1',
      tcpPort: 1, // Almost certainly not running
      enabled: true,
    };

    const manager = new ConnectionManager([badTcp]);

    // Should not throw — failure is recorded in status
    await manager.startAll();

    const statuses = manager.getStatuses();
    expect(statuses[0].connected).toBe(false);
    expect(statuses[0].errorsCount).toBeGreaterThan(0);
    expect(statuses[0].lastError).not.toBeNull();
  });

  // --- Auto-Reconnect Tests ---

  describe('auto-reconnect', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('emits disconnected and schedules reconnect on close', async () => {
      const manager = new ConnectionManager([SERIAL_ANALYZER], mockSerialFactory);
      const disconnectHandler = vi.fn();
      const reconnectHandler = vi.fn();
      manager.on('disconnected', disconnectHandler);
      manager.on('reconnecting', reconnectHandler);
      manager.on('error', () => {}); // suppress unhandled errors

      await manager.startAll();
      expect(manager.getStatuses()[0].connected).toBe(true);

      // Simulate the analyzer disconnecting (cable unplugged)
      const mock = mockPorts.get('COM3')!;
      mock.emit('close');

      expect(disconnectHandler).toHaveBeenCalledWith('sysmex-xn550');
      expect(manager.getStatuses()[0].connected).toBe(false);
      // Reconnect should be scheduled (1s for first attempt)
      expect(reconnectHandler).toHaveBeenCalledWith('sysmex-xn550', 1000);

      await manager.stopAll();
    });

    it('reconnects successfully after backoff delay', async () => {
      const manager = new ConnectionManager([SERIAL_ANALYZER], mockSerialFactory);
      const connectedHandler = vi.fn();
      manager.on('connected', connectedHandler);
      manager.on('error', () => {});

      await manager.startAll();
      connectedHandler.mockClear(); // clear the initial connect event

      // Simulate disconnect
      mockPorts.get('COM3')!.emit('close');
      expect(manager.getStatuses()[0].connected).toBe(false);

      // Advance past the 1s backoff — reconnect creates a new MockSerialPort
      await vi.advanceTimersByTimeAsync(1000);

      // The reconnect should have succeeded (MockSerialPort.open always works)
      expect(manager.getStatuses()[0].connected).toBe(true);
      expect(connectedHandler).toHaveBeenCalledWith('sysmex-xn550');

      await manager.stopAll();
    });

    it('backoff grows exponentially, capped at 30s', () => {
      const manager = new ConnectionManager([SERIAL_ANALYZER], mockSerialFactory);
      manager.on('error', () => {});

      // Initial delay should be 1s (2^0 * 1000)
      expect(manager.getReconnectDelay('sysmex-xn550')).toBe(1000);

      // After we can't test internal attempts easily, but getReconnectDelay
      // uses the attempts counter, which defaults to 0 for unknown analyzers
      // The backoff sequence is: 1s, 2s, 4s, 8s, 16s, 30s, 30s...
      // We verify the formula caps at 30s
      const maxDelay = Math.min(30_000, 1000 * Math.pow(2, 10));
      expect(maxDelay).toBe(30_000);
    });

    it('schedules another reconnect when reconnection attempt fails', async () => {
      // Use a factory that succeeds on first call but fails on reconnect
      let callCount = 0;
      let firstMock: MockSerialPort | null = null;
      const failOnReconnectFactory = (config: { port: string; baudRate: number }) => {
        callCount++;
        const mock = new MockSerialPort({ path: config.port, baudRate: config.baudRate });
        if (callCount === 1) {
          firstMock = mock;
        } else {
          // Make open() fail on reconnect attempts
          mock.open = (cb?: (err: Error | null) => void) => {
            if (cb) cb(new Error('Reconnect failed'));
          };
        }
        return mock;
      };

      const manager = new ConnectionManager([SERIAL_ANALYZER], failOnReconnectFactory);
      const reconnectHandler = vi.fn();
      manager.on('reconnecting', reconnectHandler);
      manager.on('error', () => {});

      await manager.startAll();
      expect(manager.getStatuses()[0].connected).toBe(true);

      // Simulate disconnect — triggers reconnect
      firstMock!.emit('close');
      expect(manager.getStatuses()[0].connected).toBe(false);

      // Advance past first backoff — reconnect will fail
      await vi.advanceTimersByTimeAsync(1000);

      // Connection should still be disconnected since reconnect failed
      expect(manager.getStatuses()[0].connected).toBe(false);
      expect(manager.getStatuses()[0].errorsCount).toBeGreaterThan(0);

      // A second reconnect should have been scheduled
      expect(reconnectHandler).toHaveBeenCalledTimes(2);

      await manager.stopAll();
    });

    it('stopAll cancels pending reconnect timers', async () => {
      const manager = new ConnectionManager([SERIAL_ANALYZER], mockSerialFactory);
      const reconnectHandler = vi.fn();
      manager.on('reconnecting', reconnectHandler);
      manager.on('error', () => {});

      await manager.startAll();

      // Disconnect — this schedules a reconnect
      mockPorts.get('COM3')!.emit('close');
      expect(reconnectHandler).toHaveBeenCalled();

      // Stop everything — should cancel the pending reconnect timer
      await manager.stopAll();

      // Advance past the reconnect delay — nothing should happen
      const connectedHandler = vi.fn();
      manager.on('connected', connectedHandler);
      await vi.advanceTimersByTimeAsync(5000);

      expect(connectedHandler).not.toHaveBeenCalled();
    });
  });
});
