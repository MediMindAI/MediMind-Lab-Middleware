/**
 * Tests for TcpConnection — the TCP socket wrapper.
 *
 * Creates a real local TCP server in each test to act as a
 * simulated analyzer. The TcpConnection connects to it as a client.
 * No external dependencies — just Node.js `net` module.
 */

import { describe, it, expect, afterEach } from 'vitest';
import net from 'node:net';
import { TcpConnection } from './tcpConnection.js';
import type { TcpConfig } from '../types/analyzer.js';

/** Create a TCP server on a random port. Returns the server and its port number. */
function createTestServer(): Promise<{ server: net.Server; port: number }> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as net.AddressInfo;
      resolve({ server, port: addr.port });
    });
  });
}

/** Cleanly close a TCP server */
function closeServer(server: net.Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
    // Destroy any lingering connections
    server.emit('close');
  });
}

describe('TcpConnection', () => {
  let server: net.Server | null = null;
  let conn: TcpConnection | null = null;

  afterEach(async () => {
    // Clean up connection and server after each test
    if (conn) {
      try { await conn.close(); } catch { /* ignore */ }
      conn = null;
    }
    if (server) {
      await closeServer(server);
      server = null;
    }
  });

  it('starts disconnected (isOpen = false)', () => {
    const config: TcpConfig = { connection: 'tcp', host: '127.0.0.1', tcpPort: 9999 };
    conn = new TcpConnection(config);
    expect(conn.isOpen()).toBe(false);
  });

  it('open() connects and reports isOpen = true', async () => {
    const result = await createTestServer();
    server = result.server;

    const config: TcpConfig = { connection: 'tcp', host: '127.0.0.1', tcpPort: result.port };
    conn = new TcpConnection(config);

    await conn.open();
    expect(conn.isOpen()).toBe(true);
  });

  it('close() disconnects and reports isOpen = false', async () => {
    const result = await createTestServer();
    server = result.server;

    const config: TcpConfig = { connection: 'tcp', host: '127.0.0.1', tcpPort: result.port };
    conn = new TcpConnection(config);

    await conn.open();
    expect(conn.isOpen()).toBe(true);

    await conn.close();
    expect(conn.isOpen()).toBe(false);
  });

  it('close() is safe when already closed', async () => {
    const config: TcpConfig = { connection: 'tcp', host: '127.0.0.1', tcpPort: 9999 };
    conn = new TcpConnection(config);

    // Should not throw
    await conn.close();
    expect(conn.isOpen()).toBe(false);
  });

  it('emits data events when the server sends data', async () => {
    const result = await createTestServer();
    server = result.server;

    // When a client connects, send some data from the "analyzer"
    server.on('connection', (socket) => {
      socket.write('WBC=7.5');
    });

    const config: TcpConfig = { connection: 'tcp', host: '127.0.0.1', tcpPort: result.port };
    conn = new TcpConnection(config);

    const received = await new Promise<Buffer>((resolve) => {
      conn!.on('data', (data: Buffer) => resolve(data));
      conn!.open();
    });

    expect(received.toString()).toBe('WBC=7.5');
  });

  it('write() sends data to the server', async () => {
    const result = await createTestServer();
    server = result.server;

    // Capture data received by the server
    const serverReceived = new Promise<string>((resolve) => {
      server!.on('connection', (socket) => {
        socket.on('data', (data) => resolve(data.toString()));
      });
    });

    const config: TcpConfig = { connection: 'tcp', host: '127.0.0.1', tcpPort: result.port };
    conn = new TcpConnection(config);

    await conn.open();
    await conn.write(Buffer.from([0x06])); // ACK byte

    const received = await serverReceived;
    expect(received).toBe('\x06');
  });

  it('write() throws when socket is not connected', async () => {
    const config: TcpConfig = { connection: 'tcp', host: '127.0.0.1', tcpPort: 9999 };
    conn = new TcpConnection(config);

    await expect(conn.write(Buffer.from('test'))).rejects.toThrow('not connected');
  });

  it('open() rejects when server is not reachable', async () => {
    // Port 1 is almost certainly not running a server
    const config: TcpConfig = { connection: 'tcp', host: '127.0.0.1', tcpPort: 1 };
    conn = new TcpConnection(config);

    await expect(conn.open()).rejects.toThrow();
  });

  it('emits close event when server closes the connection', async () => {
    const result = await createTestServer();
    server = result.server;

    // Server immediately closes the connection after accept
    server.on('connection', (socket) => {
      socket.destroy();
    });

    const config: TcpConfig = { connection: 'tcp', host: '127.0.0.1', tcpPort: result.port };
    conn = new TcpConnection(config);

    await conn.open();

    await new Promise<void>((resolve) => {
      conn!.on('close', () => resolve());
    });

    expect(conn.isOpen()).toBe(false);
  });
});
