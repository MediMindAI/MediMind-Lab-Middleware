/**
 * Tests for ASTM E1381 checksum calculation.
 *
 * The checksum algorithm: sum all byte values from frame number through
 * ETX/ETB (inclusive), take modulo 256, return as 2-char uppercase hex.
 */
import { describe, it, expect } from 'vitest';
import { calculateChecksum } from './checksum.js';
import { ASTM } from '../../types/astm.js';

const ETX = String.fromCharCode(ASTM.ETX);
const CR = String.fromCharCode(ASTM.CR);

describe('calculateChecksum', () => {
  it('computes correct checksum for a WBC result frame', () => {
    // Frame: "1" + "R|1|^^^WBC|7.5|x10^3/uL" + CR + ETX
    // Sum = 1950, mod 256 = 158 = 0x9E
    const frame = `1R|1|^^^WBC|7.5|x10^3/uL${CR}${ETX}`;
    expect(calculateChecksum(frame)).toBe('9E');
  });

  it('handles empty data (frame number + ETX only)', () => {
    // Frame: "1" + ETX => 49 + 3 = 52 = 0x34
    const frame = `1${ETX}`;
    expect(calculateChecksum(frame)).toBe('34');
  });

  it('handles single character of data', () => {
    // Frame: "1" + "A" + ETX => 49 + 65 + 3 = 117 = 0x75
    const frame = `1A${ETX}`;
    expect(calculateChecksum(frame)).toBe('75');
  });

  it('matches the worked example from the ASTM spec', () => {
    // Spec example: "1H|\\^&" + CR + ETX => 485 mod 256 = 229 = 0xE5
    const frame = `1H|\\^&${CR}${ETX}`;
    expect(calculateChecksum(frame)).toBe('E5');
  });

  it('wraps correctly at modulo 256 boundary', () => {
    // Frame: "1" + "~~~" + ETX => 49 + 378 + 3 = 430, mod 256 = 174 = 0xAE
    const frame = `1~~~${ETX}`;
    expect(calculateChecksum(frame)).toBe('AE');
  });

  it('computes correct checksum for a Sysmex XN-550 WBC result', () => {
    // First R record from sysmex-cbc.txt fixture, wrapped as a frame:
    // "1" + "R|1|^^^WBC|7.45|10*3/uL|4.5-11.0|N||F||LAB01||20260305143000|XN-550" + CR + ETX
    // Sum = 4849, mod 256 = 241 = 0xF1
    const record = 'R|1|^^^WBC|7.45|10*3/uL|4.5-11.0|N||F||LAB01||20260305143000|XN-550';
    const frame = `1${record}${CR}${ETX}`;
    expect(calculateChecksum(frame)).toBe('F1');
  });
});
