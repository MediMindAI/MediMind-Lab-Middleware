/**
 * ASTM Simulator — a "fake lab machine" for testing.
 *
 * Reads fixture files (plain ASTM record text) and wraps them in proper
 * ASTM E1381 transport framing — exactly what a real analyzer would send
 * over a serial cable. This lets us test the full receive pipeline without
 * plugging in a physical Sysmex or Roche machine.
 *
 * Framing format per frame:
 *   STX + frameNumber(1 char) + recordData + CR + ETX + checksum(2 hex) + CR + LF
 *
 * A complete session is: ENQ → [frames] → EOT
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ASTM } from '../types/astm.js';
import { calculateChecksum } from '../protocols/astm/checksum.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(__dirname, 'fixtures', 'astm');

export interface ASTMSimulatorOptions {
  /** Paths to fixture files, or names like "sysmex-cbc" (resolved from fixtures/astm/) */
  fixtures?: string[];
}

export class ASTMSimulator {
  private fixtureFiles: string[];

  constructor(options: ASTMSimulatorOptions = {}) {
    this.fixtureFiles = options.fixtures ?? ['sysmex-cbc'];
  }

  /**
   * Load fixture text by name (e.g., "sysmex-cbc") or absolute path.
   * Strips comment lines (starting with #) and blank lines.
   */
  getFixtureData(nameOrPath: string): string {
    const filePath = nameOrPath.includes('/')
      ? nameOrPath
      : resolve(FIXTURES_DIR, `${nameOrPath}.txt`);
    const raw = readFileSync(filePath, 'utf-8');
    return raw
      .split('\n')
      .filter((line) => line.length > 0 && !line.startsWith('#'))
      .join('\n');
  }

  /**
   * Wrap a single ASTM record line into a properly framed buffer.
   * Frame format: STX + frameNum + data + CR + ETX + checksum + CR + LF
   */
  generateFrame(recordLine: string, frameNumber = 1): Buffer {
    const fn = String(frameNumber % 8);
    // Content to checksum: frameNumber + data + CR + ETX
    const checksumContent = fn + recordLine + String.fromCharCode(ASTM.CR) + String.fromCharCode(ASTM.ETX);
    const cs = calculateChecksum(checksumContent);

    return Buffer.from([
      ASTM.STX,
      ...Buffer.from(checksumContent),
      ...Buffer.from(cs),
      ASTM.CR,
      ASTM.LF,
    ]);
  }

  /**
   * Generate a complete ASTM session: ENQ + all framed records + EOT.
   * This is exactly what a real analyzer sends over serial.
   */
  generateSession(fixtureData: string): Buffer {
    const lines = fixtureData.split('\n').filter((l) => l.length > 0);
    const parts: Buffer[] = [Buffer.from([ASTM.ENQ])];

    lines.forEach((line, i) => {
      parts.push(this.generateFrame(line, i + 1));
    });

    parts.push(Buffer.from([ASTM.EOT]));
    return Buffer.concat(parts);
  }

  /** Load the first configured fixture and return a full session buffer. */
  generateDefaultSession(): Buffer {
    const data = this.getFixtureData(this.fixtureFiles[0]);
    return this.generateSession(data);
  }
}
