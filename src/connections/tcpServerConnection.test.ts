/**
 * Tests for TcpServerConnection — the "server mode" connection where
 * the analyzer dials IN to us. We spin up a real TCP server, then
 * connect a test client to verify data flows both ways.
 */

import { describe, it, expect, afterEach } from 'vitest';
import net from 'node:net';
import { TcpServerConnection } from './tcpServerConnection.js';
import type { TcpServerConfig } from '../types/analyzer.js';

const BASE_CONFIG: TcpServerConfig = {
  connection: 'tcp-server',
  listenPort: 0, // OS picks a free port
  listenHost: '127.0.0.1',
};

/** Helper: connect a test client to the server */
function connectClient(port: number): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    client.once('error', reject);
    client.connect(port, '127.0.0.1', () => {
      client.removeListener('error', reject);
      resolve(client);
    });
  });
}

/** Helper: get the actual listening port from the server */
function getPort(conn: TcpServerConnection): number {
  // Access the underlying server to get the assigned port
  const server = (conn as unknown as { server: net.Server }).server;
  const addr = server.address();
  return (addr as net.AddressInfo).port;
}

describe('TcpServerConnection', () => {
  let conn: TcpServerConnection;
  let client: net.Socket | null = null;

  afterEach(async () => {
    client?.destroy();
    client = null;
    await conn?.close();
  });

  it('should listen and accept a client connection', async () => {
    conn = new TcpServerConnection(BASE_CONFIG);
    await conn.open();

    const port = getPort(conn);
    client = await connectClient(port);

    // Give a tick for the server to register the client
    await new Promise((r) => setTimeout(r, 20));
    expect(conn.isOpen()).toBe(true);
  });

  it('should receive data from the connected client', async () => {
    conn = new TcpServerConnection(BASE_CONFIG);
    await conn.open();

    const port = getPort(conn);
    client = await connectClient(port);
    await new Promise((r) => setTimeout(r, 20));

    const received = new Promise<Buffer>((resolve) => {
      conn.on('data', resolve);
    });

    client.write(Buffer.from('Hello from analyzer'));
    const data = await received;
    expect(data.toString()).toBe('Hello from analyzer');
  });

  it('should send data to the connected client', async () => {
    conn = new TcpServerConnection(BASE_CONFIG);
    await conn.open();

    const port = getPort(conn);
    client = await connectClient(port);
    await new Promise((r) => setTimeout(r, 20));

    const received = new Promise<Buffer>((resolve) => {
      client!.on('data', resolve);
    });

    await conn.write(Buffer.from('ACK from middleware'));
    const data = await received;
    expect(data.toString()).toBe('ACK from middleware');
  });

  it('should emit close when client disconnects', async () => {
    conn = new TcpServerConnection(BASE_CONFIG);
    await conn.open();

    const port = getPort(conn);
    client = await connectClient(port);
    await new Promise((r) => setTimeout(r, 20));

    const closed = new Promise<void>((resolve) => {
      conn.on('close', resolve);
    });

    client.destroy();
    await closed;
    expect(conn.isOpen()).toBe(false);
    client = null;
  });

  it('should throw on write when no client is connected', async () => {
    conn = new TcpServerConnection(BASE_CONFIG);
    await conn.open();

    // No client connected yet
    await expect(conn.write(Buffer.from('test'))).rejects.toThrow('No client connected');
  });

  it('should reject a second client while one is connected', async () => {
    conn = new TcpServerConnection(BASE_CONFIG);
    await conn.open();

    const port = getPort(conn);
    client = await connectClient(port);
    await new Promise((r) => setTimeout(r, 20));

    // Connect a second client — it should be destroyed
    const client2 = await connectClient(port);
    const destroyed = new Promise<void>((resolve) => {
      client2.on('close', () => resolve());
    });
    await destroyed;
    client2.destroy();
  });

  it('should report isOpen() false before any client connects', async () => {
    conn = new TcpServerConnection(BASE_CONFIG);
    await conn.open();
    expect(conn.isOpen()).toBe(false);
  });

  it('should close cleanly even with no client', async () => {
    conn = new TcpServerConnection(BASE_CONFIG);
    await conn.open();
    await conn.close();
    expect(conn.isOpen()).toBe(false);
  });
});
