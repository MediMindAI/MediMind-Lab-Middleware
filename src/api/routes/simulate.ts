/**
 * POST /simulate-result — Dev-only endpoint to simulate an analyzer result.
 *
 * Loads the Mindray BC-7600 CBC fixture, replaces the placeholder barcode
 * with the provided barcode, and feeds it through the pipeline — exactly
 * the same path as a real analyzer message.
 *
 * Body: { "barcode": "84401196" }
 * Response: { "success": true, "barcode": "84401196", "componentCount": 32 }
 */

import { Router, type Request, type Response } from 'express';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ResultPipeline } from '../../pipeline/resultPipeline.js';

export interface SimulateDeps {
  pipeline: ResultPipeline;
}

/** Resolve the fixture path relative to this file's compiled location */
function getFixturePath(): string {
  // Works whether running as compiled JS or via tsx
  const dir = typeof __dirname !== 'undefined'
    ? __dirname
    : dirname(fileURLToPath(import.meta.url));
  return resolve(dir, '../../simulators/fixtures/hl7v2/mindray-bc7600-cbc.hl7');
}

export function createSimulateRouter(deps: SimulateDeps): Router {
  const router = Router();

  router.post('/', async (req: Request, res: Response) => {
    const { barcode } = req.body as { barcode?: string };

    if (!barcode || typeof barcode !== 'string') {
      res.status(400).json({ error: 'Missing or invalid "barcode" in request body' });
      return;
    }

    try {
      // Load the HL7v2 fixture template
      const fixturePath = getFixturePath();
      let rawHL7 = readFileSync(fixturePath, 'utf-8');

      // Strip comment lines (lines starting with #)
      rawHL7 = rawHL7
        .split('\n')
        .filter((line) => !line.startsWith('#'))
        .join('\r');

      // Replace the template barcode (OBR filler/placer order number) with the real one
      rawHL7 = rawHL7.replace(/87654321/g, barcode);

      // Downgrade OBX status from F (final) to P (preliminary) so the result
      // lands in "Resulted" column, not "Verified" — preserves the verification workflow
      rawHL7 = rawHL7.replace(/\|F\|\|\|/g, '|P|||');

      // Count OBX segments for the response
      const componentCount = (rawHL7.match(/^OBX\|/gm) || []).length;

      // Feed through the same pipeline as a real analyzer message
      await deps.pipeline.processHL7v2('mindray-bc7600', rawHL7);

      res.json({ success: true, barcode, componentCount });
    } catch (err) {
      // Log the actual error server-side but return a generic message to clients
      console.error('[simulate] Pipeline error:', err);
      res.status(500).json({ error: 'Simulation failed — check server logs for details' });
    }
  });

  return router;
}
