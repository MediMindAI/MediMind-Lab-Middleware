/**
 * TCP socket connection wrapper.
 *
 * Wraps Node.js `net.Socket` behind the IConnection interface.
 * Used for analyzers that communicate over Ethernet (TCP/IP)
 * instead of serial cables.
 *
 * Works as a TCP client — the middleware connects TO the analyzer.
 */

import { EventEmitter } from 'node:events';
import net from 'node:net';
import type { IConnection } from './types.js';
import type { TcpConfig } from '../types/analyzer.js';

export class TcpConnection extends EventEmitter implements IConnection {
  private socket: net.Socket | null = null;
  private readonly config: TcpConfig;

  constructor(config: TcpConfig) {
    super();
    this.config = config;
  }

  async open(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.socket = new net.Socket();

      // Keep-alive probes detect dead connections (e.g., analyzer power loss)
      this.socket.setKeepAlive(true, 30_000);

      const onError = (err: Error) => {
        this.socket?.removeListener('error', onError);
        reject(err);
      };

      this.socket.once('error', onError);

      this.socket.connect(this.config.tcpPort, this.config.host, () => {
        this.socket!.removeListener('error', onError);

        // Wire up persistent event forwarding after successful connect
        this.socket!.on('data', (data: Buffer) => this.emit('data', data));
        this.socket!.on('error', (err: Error) => this.emit('error', err));
        this.socket!.on('close', () => this.emit('close'));

        resolve();
      });
    });
  }

  async close(): Promise<void> {
    if (!this.socket || this.socket.destroyed) return;

    return new Promise<void>((resolve) => {
      this.socket!.once('close', () => resolve());
      this.socket!.destroy();
    });
  }

  async write(data: Buffer): Promise<void> {
    if (!this.socket || this.socket.destroyed) {
      throw new Error('TCP socket is not connected');
    }

    return new Promise<void>((resolve, reject) => {
      this.socket!.write(data, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }

  isOpen(): boolean {
    return this.socket !== null && !this.socket.destroyed;
  }
}
