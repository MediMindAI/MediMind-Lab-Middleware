/**
 * GET /results/:barcode — Lab result lookup endpoint.
 *
 * The MediMind EMR polls this endpoint to ask: "Do you have results
 * for specimen barcode 12345678?" If yes, we return the results in
 * the exact shape the EMR expects (WebLabResultPayload).
 *
 * If no results exist yet, returns 204 No Content.
 */

import { Router, type Request, type Response } from 'express';
import type { ResultStore } from '../resultStore.js';
import type { LabResult, ComponentResult } from '../../types/result.js';

export interface ResultsDeps {
  /** The in-memory result store to look up results */
  resultStore: ResultStore;
}

export function createResultsRouter(deps: ResultsDeps): Router {
  const router = Router();

  // GET /results/:barcode — look up results by specimen barcode
  router.get('/:barcode', (req: Request, res: Response) => {
    const { barcode } = req.params;

    if (!barcode || barcode.length < 1) {
      res.status(400).json({ error: 'Barcode is required' });
      return;
    }

    const labResults = deps.resultStore.get(barcode);

    if (!labResults) {
      res.status(204).send();
      return;
    }

    // Merge all LabResults for this barcode into one response
    const payload = mergeResults(barcode, labResults);
    res.json(payload);
  });

  return router;
}

// ---------------------------------------------------------------------------
// Helpers — convert internal LabResult[] → EMR-expected WebLabResultPayload
// ---------------------------------------------------------------------------

interface WebLabResultPayload {
  barcode: string;
  orderId: string;
  isComplete: boolean;
  components: WebLabComponentResult[];
  instrumentName: string;
  resultTimestamp: string;
  instrumentFlags: string[];
}

interface WebLabComponentResult {
  componentCode: string;
  value: string | number;
  unit: string;
  referenceRange?: { low: number; high: number };
  flag: string;
}

/** Merge multiple LabResults (possibly from different analyzers) into one payload. */
function mergeResults(barcode: string, results: LabResult[]): WebLabResultPayload {
  // Collect all components from all results
  const components: WebLabComponentResult[] = [];
  let instrumentName = '';
  let latestTimestamp = '';

  for (const result of results) {
    if (!instrumentName) instrumentName = result.analyzerId;
    if (result.testDateTime > latestTimestamp) latestTimestamp = result.testDateTime;

    for (const comp of result.components) {
      components.push(mapComponent(comp));
    }
  }

  return {
    barcode,
    orderId: '', // The middleware doesn't know the FHIR ServiceRequest ID
    isComplete: true,
    components,
    instrumentName,
    resultTimestamp: latestTimestamp || new Date().toISOString(),
    instrumentFlags: [],
  };
}

/** Convert a middleware ComponentResult to the EMR's expected shape. */
function mapComponent(comp: ComponentResult): WebLabComponentResult {
  const range = parseReferenceRange(comp.referenceRange);

  return {
    componentCode: comp.testCode,
    value: isNumeric(comp.value) ? parseFloat(comp.value) : comp.value,
    unit: comp.unit,
    referenceRange: range,
    flag: comp.flag || 'N',
  };
}

/** Parse "4.5-11.0" → { low: 4.5, high: 11.0 }, or undefined if unparseable. */
function parseReferenceRange(range: string): { low: number; high: number } | undefined {
  if (!range || !range.includes('-')) return undefined;
  const [lowStr, highStr] = range.split('-');
  const low = parseFloat(lowStr);
  const high = parseFloat(highStr);
  if (isNaN(low) || isNaN(high)) return undefined;
  return { low, high };
}

/** Check if a string looks like a number. */
function isNumeric(value: string): boolean {
  return value !== '' && !isNaN(Number(value));
}
