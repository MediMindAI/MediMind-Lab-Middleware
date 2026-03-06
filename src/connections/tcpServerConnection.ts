/**
 * TCP server connection — listens on a port and accepts ONE incoming client.
 *
 * Some analyzers (like Mindray's LabXpert software) connect OUT to us rather
 * than waiting for us to connect to them. This is the reverse of TcpConnection:
 *   TcpConnection: we dial the analyzer (client mode)
 *   TcpServerConnection: the analyzer dials us (server mode)
 *
 * Only accepts one client at a time — one analyzer per port. If the client
 * disconnects, the server stays listening and the ConnectionManager will
 * re-open to accept the next connection.
 */

import { EventEmitter } from 'node:events';
import net from 'node:net';
import type { IConnection } from './types.js';
import type { TcpServerConfig } from '../types/analyzer.js';

export class TcpServerConnection extends EventEmitter implements IConnection {
  private server: net.Server | null = null;
  private client: net.Socket | null = null;
  private readonly config: TcpServerConfig;

  constructor(config: TcpServerConfig) {
    super();
    this.config = config;
  }

  /** Start listening on the configured port. Resolves when the server is ready. */
  async open(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.server = net.createServer((socket) => {
        this.handleClient(socket);
      });

      this.server.once('error', (err: Error) => {
        reject(err);
      });

      const host = this.config.listenHost ?? '0.0.0.0';
      this.server.listen(this.config.listenPort, host, () => {
        // Remove the one-shot error handler now that we're listening
        this.server!.removeAllListeners('error');
        this.server!.on('error', (err: Error) => this.emit('error', err));
        resolve();
      });
    });
  }

  /** Handle an incoming client connection */
  private handleClient(socket: net.Socket): void {
    // If we already have a client, reject the new one (one analyzer per port)
    if (this.client && !this.client.destroyed) {
      socket.destroy();
      return;
    }

    this.client = socket;
    socket.setKeepAlive(true, 30_000);

    socket.on('data', (data: Buffer) => this.emit('data', data));
    socket.on('error', (err: Error) => this.emit('error', err));
    socket.on('close', () => {
      this.client = null;
      this.emit('close');
    });
  }

  /** Close the client socket and stop the server */
  async close(): Promise<void> {
    if (this.client && !this.client.destroyed) {
      this.client.destroy();
      this.client = null;
    }

    if (!this.server) return;

    return new Promise<void>((resolve) => {
      this.server!.close(() => {
        this.server = null;
        resolve();
      });
    });
  }

  /** Send data to the connected client */
  async write(data: Buffer): Promise<void> {
    if (!this.client || this.client.destroyed) {
      throw new Error('No client connected to TCP server');
    }

    return new Promise<void>((resolve, reject) => {
      this.client!.write(data, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }

  /** Check if a client is currently connected */
  isOpen(): boolean {
    return this.client !== null && !this.client.destroyed;
  }
}
