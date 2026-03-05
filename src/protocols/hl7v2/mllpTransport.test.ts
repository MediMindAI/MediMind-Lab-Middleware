/**
 * Tests for MLLPTransport — the "envelope handler" for HL7v2 messages.
 *
 * MLLP wraps each HL7v2 message in three framing bytes:
 *   VT (0x0B) + message content + FS (0x1C) + CR (0x0D)
 * MLLPTransport buffers incoming TCP data and emits 'message' when
 * a complete envelope is detected, stripping the framing bytes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MLLPTransport } from './mllpTransport.js';

const VT = 0x0b;
const FS = 0x1c;
const CR = 0x0d;

/** Realistic HL7 ORU snippet from a Mindray BC-3510 */
const SAMPLE_HL7 =
  'MSH|^~\\&|BC-3510|Lab|Middleware|Hospital|20240315||ORU^R01|MSG001|P|2.3.1\r' +
  'PID|||12345||Doe^John||19800101|M\r' +
  'OBR|1|ORD001|LAB001|CBC|||20240315120000\r' +
  'OBX|1|NM|WBC^White Blood Cell Count||7.5|x10^3/uL|4.5-11.0|N|||F';

function frame(content: string): Buffer {
  return Buffer.concat([Buffer.from([VT]), Buffer.from(content), Buffer.from([FS, CR])]);
}

describe('MLLPTransport', () => {
  let transport: MLLPTransport;

  beforeEach(() => {
    transport = new MLLPTransport();
  });

  it('extracts message from a complete MLLP frame', () => {
    const onMessage = vi.fn();
    transport.on('message', onMessage);

    transport.receive(frame(SAMPLE_HL7));

    expect(onMessage).toHaveBeenCalledOnce();
    expect(onMessage).toHaveBeenCalledWith(SAMPLE_HL7);
  });

  it('buffers partial frames across multiple chunks', () => {
    const onMessage = vi.fn();
    transport.on('message', onMessage);

    transport.receive(Buffer.from([VT]));
    expect(onMessage).not.toHaveBeenCalled();

    transport.receive(Buffer.from(SAMPLE_HL7));
    expect(onMessage).not.toHaveBeenCalled();

    transport.receive(Buffer.from([FS, CR]));
    expect(onMessage).toHaveBeenCalledOnce();
    expect(onMessage).toHaveBeenCalledWith(SAMPLE_HL7);
  });

  it('emits two messages when two frames arrive in one chunk', () => {
    const onMessage = vi.fn();
    transport.on('message', onMessage);

    const msg1 = 'MSH|^~\\&|BC-3510|Lab|||20240315||ORU^R01|M01|P|2.3.1';
    const msg2 = 'MSH|^~\\&|BC-3510|Lab|||20240315||ORU^R01|M02|P|2.3.1';
    const combined = Buffer.concat([frame(msg1), frame(msg2)]);

    transport.receive(combined);

    expect(onMessage).toHaveBeenCalledTimes(2);
    expect(onMessage).toHaveBeenNthCalledWith(1, msg1);
    expect(onMessage).toHaveBeenNthCalledWith(2, msg2);
  });

  it('does not emit message when VT start byte is missing', () => {
    const onMessage = vi.fn();
    const onError = vi.fn();
    transport.on('message', onMessage);
    transport.on('error', onError);

    // Data without the VT envelope start
    transport.receive(Buffer.concat([Buffer.from(SAMPLE_HL7), Buffer.from([FS, CR])]));

    expect(onMessage).not.toHaveBeenCalled();
  });

  it('safely ignores stray FS+CR bytes without preceding VT', () => {
    const onMessage = vi.fn();
    transport.on('message', onMessage);

    transport.receive(Buffer.from([FS, CR, FS, CR]));

    expect(onMessage).not.toHaveBeenCalled();
  });

  it('handles an empty message (VT + FS + CR with no content)', () => {
    const onMessage = vi.fn();
    transport.on('message', onMessage);

    transport.receive(Buffer.from([VT, FS, CR]));

    // Either emits empty string or emits error — both are acceptable
    if (onMessage.mock.calls.length > 0) {
      expect(onMessage).toHaveBeenCalledWith('');
    }
  });

  it('handles a large message (10 KB payload)', () => {
    const onMessage = vi.fn();
    transport.on('message', onMessage);

    const largePayload = 'OBX|1|NM|WBC||7.5|x10^3/uL|4.5-11.0|N|||F\r'.repeat(250);
    transport.receive(frame(largePayload));

    expect(onMessage).toHaveBeenCalledOnce();
    expect(onMessage).toHaveBeenCalledWith(largePayload);
  });

  it('is ready for a new message after extracting one', () => {
    const onMessage = vi.fn();
    transport.on('message', onMessage);

    const msg1 = 'MSH|^~\\&|BC-3510|Lab|||20240315||ORU^R01|M01|P|2.3.1';
    const msg2 = 'MSH|^~\\&|BC-3510|Lab|||20240315||ORU^R01|M02|P|2.3.1';

    transport.receive(frame(msg1));
    expect(onMessage).toHaveBeenCalledTimes(1);

    transport.receive(frame(msg2));
    expect(onMessage).toHaveBeenCalledTimes(2);
    expect(onMessage).toHaveBeenNthCalledWith(2, msg2);
  });
});
