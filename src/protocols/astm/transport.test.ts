/**
 * Tests for the ASTM E1381 transport state machine.
 *
 * The transport layer is like a walkie-talkie protocol:
 * - Analyzer sends ENQ ("Can I talk?"), we reply ACK ("Go ahead")
 * - Analyzer sends data frames (STX...ETX + checksum), we verify and ACK/NAK
 * - Analyzer sends EOT ("I'm done"), we go back to idle
 *
 * These tests define the expected behavior BEFORE implementation exists (TDD).
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ASTMTransport, RECEIVE_TIMEOUT_MS } from './transport.js';
import { ASTM } from '../../types/astm.js';

/** Build a valid ASTM frame buffer: STX + frameNumber + data + ETX/ETB + checksum + CR + LF */
function buildFrame(frameNumber: number, data: string, last = true): Buffer {
  const terminator = last ? ASTM.ETX : ASTM.ETB;
  const fn = String(frameNumber);

  // Checksum covers: frame number + data + terminator
  let sum = 0;
  sum += fn.charCodeAt(0);
  for (let i = 0; i < data.length; i++) {
    sum += data.charCodeAt(i);
  }
  sum += terminator;
  const cs = (sum % 256).toString(16).toUpperCase().padStart(2, '0');

  return Buffer.from([
    ASTM.STX,
    ...Buffer.from(fn),
    ...Buffer.from(data),
    terminator,
    ...Buffer.from(cs),
    ASTM.CR,
    ASTM.LF,
  ]);
}

/** Build a frame with a deliberately wrong checksum. */
function buildBadFrame(frameNumber: number, data: string): Buffer {
  const fn = String(frameNumber);
  return Buffer.from([
    ASTM.STX,
    ...Buffer.from(fn),
    ...Buffer.from(data),
    ASTM.ETX,
    ...Buffer.from('FF'), // wrong checksum
    ASTM.CR,
    ASTM.LF,
  ]);
}

describe('ASTMTransport', () => {
  let transport: ASTMTransport;

  beforeEach(() => {
    transport = new ASTMTransport();
  });

  // ─── Test 1: Initial state ──────────────────────────────────────────

  it('starts in idle state', () => {
    expect(transport.state).toBe('idle');
  });

  // ─── Test 2: ENQ transitions to receiving ───────────────────────────

  it('transitions to receiving state on ENQ and responds with ACK', () => {
    const responses: number[] = [];
    transport.on('response', (byte: number) => responses.push(byte));

    transport.receive(Buffer.from([ASTM.ENQ]));

    expect(transport.state).toBe('receiving');
    expect(responses).toContain(ASTM.ACK);
  });

  // ─── Test 3: Valid frame emits frame event and ACKs ─────────────────

  it('emits frame event and responds ACK for a valid frame', () => {
    const frames: string[] = [];
    const responses: number[] = [];
    transport.on('frame', (data: string) => frames.push(data));
    transport.on('response', (byte: number) => responses.push(byte));

    // Enter receiving state first
    transport.receive(Buffer.from([ASTM.ENQ]));
    responses.length = 0; // clear the ACK from ENQ

    // Send a valid frame: frame number 1, data "H|\\^&"
    const frame = buildFrame(1, 'H|\\^&');
    transport.receive(frame);

    expect(frames).toHaveLength(1);
    expect(frames[0]).toBe('H|\\^&');
    expect(responses).toContain(ASTM.ACK);
  });

  // ─── Test 4: EOT returns to idle and emits message ──────────────────

  it('returns to idle on EOT and emits message event', () => {
    const messages: string[][] = [];
    transport.on('message', (frameData: string[]) => messages.push(frameData));

    // ENQ → frame → EOT
    transport.receive(Buffer.from([ASTM.ENQ]));
    transport.receive(buildFrame(1, 'H|\\^&'));
    transport.receive(Buffer.from([ASTM.EOT]));

    expect(transport.state).toBe('idle');
    expect(messages).toHaveLength(1);
  });

  // ─── Test 5: Full message flow extracts frame data correctly ────────

  it('extracts frame data correctly in a full ENQ → frames → EOT flow', () => {
    const frames: string[] = [];
    const messages: string[][] = [];
    transport.on('frame', (data: string) => frames.push(data));
    transport.on('message', (frameData: string[]) => messages.push(frameData));

    transport.receive(Buffer.from([ASTM.ENQ]));
    transport.receive(buildFrame(1, 'H|\\^&|||Host'));
    transport.receive(buildFrame(2, 'R|1|^^^WBC|7.5|x10^3/uL'));
    transport.receive(buildFrame(3, 'L|1|N'));
    transport.receive(Buffer.from([ASTM.EOT]));

    expect(frames).toEqual([
      'H|\\^&|||Host',
      'R|1|^^^WBC|7.5|x10^3/uL',
      'L|1|N',
    ]);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual([
      'H|\\^&|||Host',
      'R|1|^^^WBC|7.5|x10^3/uL',
      'L|1|N',
    ]);
  });

  // ─── Test 6: Bad checksum → NAK, frame not emitted ─────────────────

  it('responds NAK and does not emit frame for bad checksum', () => {
    const frames: string[] = [];
    const responses: number[] = [];
    transport.on('frame', (data: string) => frames.push(data));
    transport.on('response', (byte: number) => responses.push(byte));

    transport.receive(Buffer.from([ASTM.ENQ]));
    responses.length = 0;

    transport.receive(buildBadFrame(1, 'H|\\^&'));

    expect(frames).toHaveLength(0);
    expect(responses).toContain(ASTM.NAK);
  });

  // ─── Test 7: NAK retry limit (6) triggers error and reset ──────────

  it('emits error and resets to idle after 6 consecutive NAKs', () => {
    const errors: string[] = [];
    transport.on('error', (msg: string) => errors.push(msg));

    transport.receive(Buffer.from([ASTM.ENQ]));

    const badFrame = buildBadFrame(1, 'H|\\^&');
    for (let i = 0; i < 6; i++) {
      transport.receive(badFrame);
    }

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/retry/i);
    expect(transport.state).toBe('idle');
  });

  // ─── Test 8: ENQ while receiving → handled gracefully ───────────────

  it('handles ENQ while already in receiving state', () => {
    const responses: number[] = [];
    transport.on('response', (byte: number) => responses.push(byte));

    // First ENQ → receiving
    transport.receive(Buffer.from([ASTM.ENQ]));
    expect(transport.state).toBe('receiving');

    // Second ENQ while receiving → should not crash
    transport.receive(Buffer.from([ASTM.ENQ]));

    // Transport should still be functional (either reset or stay receiving)
    expect(['idle', 'receiving']).toContain(transport.state);
  });

  // ─── Test 9: Random bytes in idle are silently discarded ────────────

  it('silently discards unexpected bytes in idle state', () => {
    const frames: string[] = [];
    const responses: number[] = [];
    const errors: string[] = [];
    transport.on('frame', (data: string) => frames.push(data));
    transport.on('response', (byte: number) => responses.push(byte));
    transport.on('error', (msg: string) => errors.push(msg));

    // Send random garbage before ENQ
    transport.receive(Buffer.from([0x41, 0x42, 0x43, 0xFF, 0x00]));

    expect(transport.state).toBe('idle');
    expect(frames).toHaveLength(0);
    expect(responses).toHaveLength(0);
    expect(errors).toHaveLength(0);
  });

  // ─── Test 10: NAK for minimal frame where terminator is invalid ────

  it('sends NAK for a minimal 5-byte frame where terminator position is invalid', () => {
    const responses: number[] = [];
    transport.on('response', (byte: number) => responses.push(byte));

    transport.receive(Buffer.from([ASTM.ENQ]));
    responses.length = 0;

    // 5-byte frame buffer: frameNum(0x31) + "A" + "B" + CR + LF
    // At len=5, terminator = bytes[0] = 0x31 ('1'), which is not ETX or ETB → NAK
    transport.receive(Buffer.from([
      ASTM.STX,
      0x31,       // frame number '1'
      0x41,       // 'A'
      0x42,       // 'B'
      ASTM.CR,
      ASTM.LF,
    ]));

    expect(responses).toContain(ASTM.NAK);
  });

  // ─── Test 11: NAK for frame with invalid terminator ────────────────

  it('sends NAK for frame with invalid terminator (not ETX or ETB)', () => {
    const responses: number[] = [];
    transport.on('response', (byte: number) => responses.push(byte));

    transport.receive(Buffer.from([ASTM.ENQ]));
    responses.length = 0;

    // Frame where the "terminator" byte is 0x00 instead of ETX(0x03) or ETB(0x17)
    // Layout: STX + frameNum(1) + data(1) + badTerminator(0x00) + cs(2) + CR + LF
    transport.receive(Buffer.from([
      ASTM.STX,
      0x31,       // frame number '1'
      0x41,       // data byte 'A'
      0x00,       // invalid terminator
      0x30, 0x30, // fake checksum
      ASTM.CR,
      ASTM.LF,
    ]));

    expect(responses).toContain(ASTM.NAK);
  });

  // ─── Test 12: Frame buffer overflow resets transport ──────────────

  it('emits error and resets when frame buffer exceeds 1MB', () => {
    const errors: string[] = [];
    transport.on('error', (msg: string) => errors.push(msg));

    // Enter receiving, start a frame
    transport.receive(Buffer.from([ASTM.ENQ]));
    transport.receive(Buffer.from([ASTM.STX]));

    // Send >1MB of data without a CR+LF terminator
    const chunk = Buffer.alloc(64 * 1024, 0x41); // 64KB of 'A's
    for (let i = 0; i < 17; i++) {
      // 17 * 64KB = 1088KB > 1MB
      transport.receive(chunk);
    }

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/buffer overflow/i);
    expect(transport.state).toBe('idle');
  });

  // ─── Test 13: Receive timeout after ENQ with no EOT ──────────────

  describe('receive timeout', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('emits error and resets to idle after 30s with no EOT', () => {
      const errors: string[] = [];
      transport.on('error', (msg: string) => errors.push(msg));

      transport.receive(Buffer.from([ASTM.ENQ]));
      expect(transport.state).toBe('receiving');

      // Advance time past the timeout
      vi.advanceTimersByTime(RECEIVE_TIMEOUT_MS);

      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/receive timeout/i);
      expect(transport.state).toBe('idle');
    });

    it('does not emit timeout error if EOT arrives in time', () => {
      const errors: string[] = [];
      transport.on('error', (msg: string) => errors.push(msg));

      transport.receive(Buffer.from([ASTM.ENQ]));
      expect(transport.state).toBe('receiving');

      // EOT arrives well before the timeout
      vi.advanceTimersByTime(5000);
      transport.receive(Buffer.from([ASTM.EOT]));
      expect(transport.state).toBe('idle');

      // Advance past the original timeout — should NOT fire
      vi.advanceTimersByTime(RECEIVE_TIMEOUT_MS);

      expect(errors).toHaveLength(0);
    });
  });
});
