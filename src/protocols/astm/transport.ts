/**
 * ASTM E1381 transport-layer state machine.
 *
 * Think of this like a walkie-talkie protocol between the lab analyzer and us:
 * 1. Analyzer presses the button (ENQ) — "Can I talk?"
 * 2. We say "Go ahead" (ACK)
 * 3. Analyzer sends data frames (STX...ETX + checksum) — we verify each one
 *    - Good frame? We say "Got it" (ACK)
 *    - Bad frame?  We say "Say again" (NAK), up to 6 retries
 * 4. Analyzer says "I'm done" (EOT) — we go back to listening
 *
 * This class receives raw bytes from a serial/TCP connection and emits events:
 * - 'response' — a byte we need to send back (ACK or NAK)
 * - 'frame'    — a validated frame's data content (string)
 * - 'message'  — complete message (array of all frame data strings) on EOT
 * - 'error'    — something went wrong (e.g., too many NAKs)
 */

import { EventEmitter } from 'events';
import { ASTM } from '../../types/astm.js';
import { calculateChecksum } from './checksum.js';

const MAX_NAK_RETRIES = 6;

export class ASTMTransport extends EventEmitter {
  private _state: 'idle' | 'receiving' = 'idle';
  private _frames: string[] = [];
  private _nakCount = 0;
  private _frameBuffer: number[] = [];
  private _inFrame = false;

  get state(): string {
    return this._state;
  }

  /**
   * Feed raw bytes from the connection into the state machine.
   * Call this whenever data arrives from the serial port or TCP socket.
   */
  receive(buffer: Buffer): void {
    for (let i = 0; i < buffer.length; i++) {
      this.processByte(buffer[i]);
    }
  }

  private processByte(byte: number): void {
    // If we're inside a frame (between STX and CR+LF), buffer the bytes
    if (this._inFrame) {
      this._frameBuffer.push(byte);
      // A complete frame ends with: ETX/ETB + checksum(2 bytes) + CR + LF
      // Check for CR + LF at the end (minimum frame: STX fn ETX cs cs CR LF)
      const len = this._frameBuffer.length;
      if (len >= 5 && byte === ASTM.LF && this._frameBuffer[len - 2] === ASTM.CR) {
        this.handleFrame(this._frameBuffer);
        this._frameBuffer = [];
        this._inFrame = false;
      }
      return;
    }

    // Not inside a frame — process control bytes
    switch (byte) {
      case ASTM.ENQ:
        this.handleENQ();
        break;
      case ASTM.EOT:
        this.handleEOT();
        break;
      case ASTM.STX:
        if (this._state === 'receiving') {
          this._inFrame = true;
          this._frameBuffer = [];
        }
        break;
      default:
        // In idle state, silently discard unexpected bytes
        break;
    }
  }

  private handleENQ(): void {
    // Whether idle or already receiving, accept the ENQ and start fresh
    this._state = 'receiving';
    this._frames = [];
    this._nakCount = 0;
    this.emit('response', ASTM.ACK);
  }

  private handleEOT(): void {
    if (this._state === 'receiving') {
      this.emit('message', [...this._frames]);
    }
    this.reset();
  }

  private handleFrame(bytes: number[]): void {
    if (this._state !== 'receiving') return;

    // Frame bytes are everything AFTER STX: frameNum + data + ETX/ETB + cs1 + cs2 + CR + LF
    // Layout: [frameNum, ...data, terminator, cs1, cs2, CR, LF]
    const len = bytes.length;
    if (len < 5) {
      this.sendNAK();
      return;
    }

    // Extract parts (bytes array does NOT include STX, that was consumed before buffering)
    const checksumChars = String.fromCharCode(bytes[len - 4], bytes[len - 3]);
    const terminator = bytes[len - 5]; // ETX or ETB

    if (terminator !== ASTM.ETX && terminator !== ASTM.ETB) {
      this.sendNAK();
      return;
    }

    // Content to checksum: frame number through terminator (inclusive)
    const contentBytes = bytes.slice(0, len - 4); // frameNum + data + terminator
    const contentStr = String.fromCharCode(...contentBytes);
    const expected = calculateChecksum(contentStr);

    if (checksumChars !== expected) {
      this.sendNAK();
      return;
    }

    // Valid frame! Extract data (everything between frame number and terminator)
    // contentStr = frameNumber(1 char) + data + terminator(1 char)
    const data = contentStr.slice(1, -1); // strip frame number and terminator

    this._nakCount = 0;
    this._frames.push(data);
    this.emit('frame', data);
    this.emit('response', ASTM.ACK);
  }

  private sendNAK(): void {
    this._nakCount++;
    this.emit('response', ASTM.NAK);

    if (this._nakCount >= MAX_NAK_RETRIES) {
      this.emit('error', `Exceeded retry limit (${MAX_NAK_RETRIES} consecutive NAKs) — aborting reception`);
      this.reset();
    }
  }

  private reset(): void {
    this._state = 'idle';
    this._frames = [];
    this._nakCount = 0;
    this._frameBuffer = [];
    this._inFrame = false;
  }
}
