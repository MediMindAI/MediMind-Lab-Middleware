/**
 * Connection Manager — the "switchboard operator" for all analyzer connections.
 *
 * Creates the right connection type (serial or TCP) for each analyzer,
 * tracks their status (connected/disconnected, message counts, errors),
 * and provides the data that the /status REST endpoint returns.
 *
 * Think of it like the front desk at a call center — it knows which
 * lines are active, routes incoming data, and reports if a line goes down.
 * If a line drops, it automatically redials with exponential backoff
 * (1s → 2s → 4s → 8s → 16s → 30s max).
 */

import { EventEmitter } from 'node:events';
import type { AnalyzerConfig, AnalyzerStatus } from '../types/analyzer.js';
import type { IConnection } from './types.js';
import { SerialConnection, type SerialPortFactory } from './serialConnection.js';
import { TcpConnection } from './tcpConnection.js';
import { TcpServerConnection } from './tcpServerConnection.js';

interface ManagedAnalyzer {
  config: AnalyzerConfig;
  connection: IConnection;
  status: AnalyzerStatus;
}

/** Max backoff delay in milliseconds (30 seconds) */
const MAX_BACKOFF_MS = 30_000;

export class ConnectionManager extends EventEmitter {
  private analyzers = new Map<string, ManagedAnalyzer>();
  private serialFactory?: SerialPortFactory;
  private reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private reconnectAttempts = new Map<string, number>();
  private stopped = false;

  constructor(configs: AnalyzerConfig[], serialFactory?: SerialPortFactory) {
    super();
    this.serialFactory = serialFactory;

    for (const config of configs) {
      if (!config.enabled) continue;

      const connection = this.createConnection(config);
      const status: AnalyzerStatus = {
        id: config.id,
        name: config.name,
        protocol: config.protocol,
        connected: false,
        lastMessageTime: null,
        lastErrorTime: null,
        lastError: null,
        messagesReceived: 0,
        errorsCount: 0,
        upSince: null,
      };

      this.analyzers.set(config.id, { config, connection, status });
    }
  }

  /** Create the right connection type based on the analyzer config */
  private createConnection(config: AnalyzerConfig): IConnection {
    if (config.connection === 'serial') {
      return new SerialConnection(config, this.serialFactory);
    }
    if (config.connection === 'tcp-server') {
      return new TcpServerConnection(config);
    }
    return new TcpConnection(config);
  }

  /** Wire up event listeners for one analyzer's connection */
  private wireEvents(id: string, managed: ManagedAnalyzer): void {
    const { connection, status } = managed;

    connection.on('data', (data: Buffer) => {
      status.messagesReceived++;
      status.lastMessageTime = new Date().toISOString();
      this.emit('data', id, data);
    });

    connection.on('error', (err: Error) => {
      status.errorsCount++;
      status.lastErrorTime = new Date().toISOString();
      status.lastError = err.message;
      this.emit('error', id, err);
    });

    connection.on('close', () => {
      status.connected = false;
      status.upSince = null;
      this.emit('disconnected', id);
      this.scheduleReconnect(id);
    });
  }

  /** Open all enabled analyzer connections */
  async startAll(): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const [id, managed] of this.analyzers) {
      this.wireEvents(id, managed);

      const p = managed.connection.open()
        .then(() => {
          managed.status.connected = true;
          managed.status.upSince = new Date().toISOString();
          this.emit('connected', id);
        })
        .catch((err: Error) => {
          managed.status.lastError = err.message;
          managed.status.lastErrorTime = new Date().toISOString();
          managed.status.errorsCount++;
          // Don't reject — one failure should not stop others
        });

      promises.push(p);
    }

    await Promise.all(promises);
  }

  /** Close all connections gracefully and cancel pending reconnects */
  async stopAll(): Promise<void> {
    this.stopped = true;

    // Cancel all pending reconnect timers
    for (const timer of this.reconnectTimers.values()) {
      clearTimeout(timer);
    }
    this.reconnectTimers.clear();
    this.reconnectAttempts.clear();

    const promises: Promise<void>[] = [];

    for (const [, managed] of this.analyzers) {
      promises.push(
        managed.connection.close().catch(() => {
          // Ignore close errors during shutdown
        })
      );
    }

    await Promise.all(promises);
  }

  /** Get status of all managed analyzers (for /status endpoint) */
  getStatuses(): AnalyzerStatus[] {
    return Array.from(this.analyzers.values()).map((m) => ({ ...m.status }));
  }

  /** Get a specific analyzer's connection (for writing data to it) */
  getConnection(analyzerId: string): IConnection | null {
    return this.analyzers.get(analyzerId)?.connection ?? null;
  }

  /** Register a data listener for a specific analyzer */
  onData(analyzerId: string, listener: (data: Buffer) => void): void {
    this.on('data', (id: string, data: Buffer) => {
      if (id === analyzerId) listener(data);
    });
  }

  /** Schedule a reconnect attempt with exponential backoff */
  private scheduleReconnect(id: string): void {
    if (this.stopped) return;
    if (this.reconnectTimers.has(id)) return; // already scheduled

    const attempts = this.reconnectAttempts.get(id) ?? 0;
    const delayMs = Math.min(MAX_BACKOFF_MS, 1000 * Math.pow(2, attempts));

    this.emit('reconnecting', id, delayMs);

    const timer = setTimeout(() => {
      this.reconnectTimers.delete(id);
      void this.attemptReconnect(id);
    }, delayMs);

    this.reconnectTimers.set(id, timer);
  }

  /** Try to reconnect a single analyzer */
  private async attemptReconnect(id: string): Promise<void> {
    if (this.stopped) return;

    const managed = this.analyzers.get(id);
    if (!managed) return;

    const attempts = (this.reconnectAttempts.get(id) ?? 0) + 1;
    this.reconnectAttempts.set(id, attempts);

    try {
      // Create a fresh connection and re-wire events
      managed.connection = this.createConnection(managed.config);
      this.wireEvents(id, managed);

      await managed.connection.open();

      // Success — reset backoff, update status
      this.reconnectAttempts.delete(id);
      managed.status.connected = true;
      managed.status.upSince = new Date().toISOString();
      this.emit('connected', id);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Reconnect failed';
      managed.status.lastError = message;
      managed.status.lastErrorTime = new Date().toISOString();
      managed.status.errorsCount++;
      // Schedule another attempt
      this.scheduleReconnect(id);
    }
  }

  /** Get the current reconnect backoff delay for an analyzer (for testing) */
  getReconnectDelay(analyzerId: string): number {
    const attempts = this.reconnectAttempts.get(analyzerId) ?? 0;
    return Math.min(MAX_BACKOFF_MS, 1000 * Math.pow(2, attempts));
  }
}
