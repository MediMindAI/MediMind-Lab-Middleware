/**
 * In-memory result store — a short-term buffer of parsed lab results.
 *
 * Think of it as a "pickup window" at a restaurant: the kitchen (pipeline)
 * places finished orders here, and the waiter (EMR poller) picks them up.
 *
 * Results are keyed by specimen barcode. The EMR polls GET /results/:barcode
 * to check if results are ready. This is NOT the permanent store — Medplum
 * Cloud is. This just lets the EMR get results quickly without waiting for
 * FHIR search queries.
 *
 * Results are kept in memory only. If the middleware restarts, the EMR
 * falls back to polling Medplum directly (which it already does).
 */

import type { LabResult } from '../types/result.js';

export class ResultStore {
  /** Barcode → array of LabResults (one barcode can have results from multiple analyzers) */
  private store = new Map<string, LabResult[]>();

  /** Store a parsed LabResult, keyed by its specimen barcode. */
  add(result: LabResult): void {
    const barcode = result.specimenBarcode;
    if (!barcode) return;

    const existing = this.store.get(barcode) ?? [];
    existing.push(result);
    this.store.set(barcode, existing);
  }

  /** Get all results for a barcode, or null if none exist. */
  get(barcode: string): LabResult[] | null {
    const results = this.store.get(barcode);
    return results && results.length > 0 ? results : null;
  }

  /** Check if we have any results for a barcode. */
  has(barcode: string): boolean {
    return this.store.has(barcode);
  }

  /** Remove results for a barcode (e.g., after EMR confirms receipt). */
  remove(barcode: string): void {
    this.store.delete(barcode);
  }

  /** Number of barcodes with stored results. */
  get size(): number {
    return this.store.size;
  }
}
