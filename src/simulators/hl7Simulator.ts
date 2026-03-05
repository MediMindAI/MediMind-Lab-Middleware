/**
 * HL7v2 Simulator — a "fake Mindray analyzer" for testing.
 *
 * Reads HL7v2 fixture files and wraps them in MLLP framing (the "envelope"
 * that HL7v2 messages travel in over TCP). This lets us test the full
 * HL7v2 receive pipeline without a physical Mindray BC-3510.
 *
 * MLLP framing: VT (0x0B) + message content + FS (0x1C) + CR (0x0D)
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(__dirname, 'fixtures', 'hl7v2');

/** MLLP framing bytes */
const VT = 0x0b;
const FS = 0x1c;
const CR = 0x0d;

export interface HL7SimulatorOptions {
  /** Paths to fixture files, or names like "mindray-cbc" (resolved from fixtures/hl7v2/) */
  fixtures?: string[];
}

export class HL7Simulator {
  private fixtureFiles: string[];

  constructor(options: HL7SimulatorOptions = {}) {
    this.fixtureFiles = options.fixtures ?? ['mindray-cbc'];
  }

  /**
   * Load fixture text by name (e.g., "mindray-cbc") or absolute path.
   * Strips comment lines (starting with #) and blank lines, then joins
   * segments with CR (the HL7v2 standard segment separator).
   */
  getFixtureData(nameOrPath?: string): string {
    const name = nameOrPath ?? this.fixtureFiles[0];
    const filePath = name.includes('/')
      ? name
      : resolve(FIXTURES_DIR, `${name}.hl7`);
    const raw = readFileSync(filePath, 'utf-8');
    return raw
      .split('\n')
      .filter((line) => line.length > 0 && !line.startsWith('#'))
      .join('\r');
  }

  /**
   * Wrap an HL7v2 message string in MLLP framing.
   * Result: VT + message + FS + CR
   */
  generateMLLPFrame(message: string): Buffer {
    const content = Buffer.from(message);
    return Buffer.concat([
      Buffer.from([VT]),
      content,
      Buffer.from([FS, CR]),
    ]);
  }

  /** Load the default fixture and return an MLLP-framed buffer. */
  generateDefaultFrame(): Buffer {
    const data = this.getFixtureData();
    return this.generateMLLPFrame(data);
  }
}
