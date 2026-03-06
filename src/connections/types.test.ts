/**
 * Tests for connection interface types.
 * Verifies that a mock class can implement IConnection and that
 * the EventEmitter pattern works (emit data → receive data).
 */

import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import type { IConnection } from './types.js';

/** A minimal mock connection that satisfies the IConnection contract */
class MockConnection extends EventEmitter implements IConnection {
  private _open = false;

  async open(): Promise<void> {
    this._open = true;
  }

  async close(): Promise<void> {
    this._open = false;
    this.emit('close');
  }

  async write(_data: Buffer): Promise<void> {
    if (!this._open) throw new Error('Not connected');
    // In a real driver, this would send bytes to a device
  }

  isOpen(): boolean {
    return this._open;
  }
}

describe('IConnection', () => {
  it('should open and report isOpen correctly', async () => {
    const conn: IConnection = new MockConnection();
    expect(conn.isOpen()).toBe(false);
    await conn.open();
    expect(conn.isOpen()).toBe(true);
  });

  it('should emit data events to listeners', async () => {
    const conn: IConnection = new MockConnection();
    const handler = vi.fn();
    conn.on('data', handler);

    const payload = Buffer.from('WBC=7.5');
    conn.emit('data', payload);

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(payload);
  });

  it('should emit close event when closed', async () => {
    const conn: IConnection = new MockConnection();
    const handler = vi.fn();
    conn.on('close', handler);

    await conn.open();
    await conn.close();

    expect(conn.isOpen()).toBe(false);
    expect(handler).toHaveBeenCalledOnce();
  });
});
