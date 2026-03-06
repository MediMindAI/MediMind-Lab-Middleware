/**
 * MLLP transport — the "envelope handler" for HL7v2 messages.
 *
 * MLLP (Minimal Lower Layer Protocol) is how HL7v2 messages travel over TCP.
 * Think of it like a postal envelope: the message inside is the HL7v2 content,
 * and the envelope is three special bytes that mark where the message starts
 * and ends.
 *
 * Framing format:
 *   VT (0x0B) + message content + FS (0x1C) + CR (0x0D)
 *
 * This class buffers incoming bytes (which may arrive in partial chunks over
 * TCP) and emits a 'message' event when a complete frame is detected,
 * with the framing bytes stripped off.
 */

import { EventEmitter } from 'events';

/** Vertical Tab — marks the start of an MLLP message */
const VT = 0x0b;
/** File Separator — marks the end of an MLLP message (paired with CR) */
const FS = 0x1c;
/** Carriage Return — follows FS to complete the end marker */
const CR = 0x0d;
/** Maximum buffer size (1 MB). Prevents unbounded memory growth from malformed data. */
export const MAX_BUFFER_SIZE = 1_048_576;

export class MLLPTransport extends EventEmitter {
  /** Wrap a message string in MLLP framing (VT + content + FS + CR) for sending */
  static wrapFrame(message: string): Buffer {
    return Buffer.from([VT, ...Buffer.from(message), FS, CR]);
  }

  /** Accumulates incoming bytes between frames */
  private buffer: Buffer = Buffer.alloc(0);
  /** Whether we've seen a VT start byte and are collecting message content */
  private inFrame = false;

  /**
   * Feed raw bytes from a TCP socket into the transport.
   * May be called with partial data — buffering handles the rest.
   */
  receive(data: Buffer): void {
    // Guard: prevent unbounded memory growth from malformed data
    if (this.buffer.length + data.length > MAX_BUFFER_SIZE) {
      this.emit('error', 'Buffer overflow (>1MB) — resetting');
      this.buffer = Buffer.alloc(0);
      this.inFrame = false;
      return;
    }
    this.buffer = Buffer.concat([this.buffer, data]);
    this.extractFrames();
  }

  /**
   * Scans the buffer for complete MLLP frames and emits them.
   * Handles multiple frames in one buffer and leftover partial frames.
   */
  private extractFrames(): void {
    while (this.buffer.length > 0) {
      if (!this.inFrame) {
        // Look for a VT start byte
        const vtIndex = this.buffer.indexOf(VT);
        if (vtIndex === -1) {
          // No VT found — discard everything (not inside a valid frame)
          this.buffer = Buffer.alloc(0);
          return;
        }
        // Discard any bytes before the VT, then enter frame mode
        this.buffer = this.buffer.subarray(vtIndex + 1);
        this.inFrame = true;
      }

      // We're inside a frame — look for the FS+CR end marker
      const fsIndex = this.findEndMarker();
      if (fsIndex === -1) {
        // Haven't received the end yet — wait for more data
        return;
      }

      // Extract the message content (everything between VT and FS)
      const content = this.buffer.subarray(0, fsIndex).toString();
      // Advance past FS + CR
      this.buffer = this.buffer.subarray(fsIndex + 2);
      this.inFrame = false;

      this.emit('message', content);
    }
  }

  /**
   * Finds the position of the FS byte in the buffer where FS is followed by CR.
   * Returns -1 if the end marker is not found.
   */
  private findEndMarker(): number {
    for (let i = 0; i < this.buffer.length - 1; i++) {
      if (this.buffer[i] === FS && this.buffer[i + 1] === CR) {
        return i;
      }
    }
    return -1;
  }
}
