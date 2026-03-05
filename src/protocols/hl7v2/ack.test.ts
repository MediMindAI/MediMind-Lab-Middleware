/**
 * Tests for the HL7v2 ACK (acknowledgment) message builder.
 *
 * Verifies that ACK messages are correctly formatted with the right
 * ack code, original message control ID, and error messages.
 */
import { describe, it, expect } from 'vitest';
import { buildACK } from './ack.js';
import type { MSHSegment } from './types.js';

/** A typical MSH segment from a Mindray BC-3510 */
const sampleMSH: MSHSegment = {
  fieldSeparator: '|',
  encodingCharacters: '^~\\&',
  sendingApplication: 'BC-3510',
  sendingFacility: 'MAIN_LAB',
  receivingApplication: 'Middleware',
  receivingFacility: 'Hospital',
  dateTime: '20260305103000',
  messageType: 'ORU^R01',
  messageControlId: 'BC3510-00042',
  processingId: 'P',
  versionId: '2.3.1',
};

/** Parse an ACK string into its segments for easier assertions */
function parseACK(ack: string): { msh: string[]; msa: string[] } {
  const segments = ack.split('\r').filter((s) => s.length > 0);
  return {
    msh: segments[0].split('|'),
    msa: segments[1].split('|'),
  };
}

describe('buildACK', () => {
  it('builds an AA (accept) ACK with correct MSH and MSA', () => {
    const ack = buildACK(sampleMSH, 'AA');
    const { msh, msa } = parseACK(ack);

    // MSH fields
    expect(msh[0]).toBe('MSH');
    expect(msh[1]).toBe('^~\\&');
    expect(msh[2]).toBe('Middleware');
    expect(msh[3]).toBe('Hospital');
    expect(msh[4]).toBe('BC-3510'); // original sender
    expect(msh[5]).toBe('MAIN_LAB'); // original facility
    // msh[6] = timestamp (dynamic, just check it's not empty)
    expect(msh[6].length).toBe(14); // YYYYMMDDHHmmss
    expect(msh[8]).toBe('ACK^R01');
    expect(msh[10]).toBe('P');
    expect(msh[11]).toBe('2.3.1');

    // MSA fields
    expect(msa[0]).toBe('MSA');
    expect(msa[1]).toBe('AA');
    expect(msa[2]).toBe('BC3510-00042'); // original control ID
  });

  it('builds an AE (error) ACK with error message', () => {
    const ack = buildACK(sampleMSH, 'AE', 'Invalid OBX segment');
    const { msa } = parseACK(ack);

    expect(msa[0]).toBe('MSA');
    expect(msa[1]).toBe('AE');
    expect(msa[2]).toBe('BC3510-00042');
    expect(msa[3]).toBe('Invalid OBX segment');
  });

  it('builds an AR (reject) ACK', () => {
    const ack = buildACK(sampleMSH, 'AR');
    const { msa } = parseACK(ack);

    expect(msa[1]).toBe('AR');
    expect(msa[2]).toBe('BC3510-00042');
  });

  it('includes the original message control ID in MSA.2', () => {
    const customMSH: MSHSegment = {
      ...sampleMSH,
      messageControlId: 'UNIQUE-MSG-777',
    };

    const ack = buildACK(customMSH, 'AA');
    const { msa } = parseACK(ack);

    expect(msa[2]).toBe('UNIQUE-MSG-777');
  });

  it('generates unique message control IDs for each ACK', () => {
    const ack1 = buildACK(sampleMSH, 'AA');
    const ack2 = buildACK(sampleMSH, 'AA');

    const id1 = parseACK(ack1).msh[9];
    const id2 = parseACK(ack2).msh[9];

    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^ACK-\d{5}$/);
    expect(id2).toMatch(/^ACK-\d{5}$/);
  });

  it('uses the original version ID in the response', () => {
    const v25MSH: MSHSegment = {
      ...sampleMSH,
      versionId: '2.5',
    };

    const ack = buildACK(v25MSH, 'AA');
    const { msh } = parseACK(ack);

    expect(msh[11]).toBe('2.5');
  });

  it('defaults to version 2.3.1 when original has no version', () => {
    const noVersionMSH: MSHSegment = {
      ...sampleMSH,
      versionId: '',
    };

    const ack = buildACK(noVersionMSH, 'AA');
    const { msh } = parseACK(ack);

    expect(msh[11]).toBe('2.3.1');
  });

  it('ends with carriage return segment separators', () => {
    const ack = buildACK(sampleMSH, 'AA');

    // Should have segments separated by \r and end with \r
    const segments = ack.split('\r').filter((s) => s.length > 0);
    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatch(/^MSH\|/);
    expect(segments[1]).toMatch(/^MSA\|/);
  });
});
