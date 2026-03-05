/**
 * GET /status — Analyzer connection status endpoint.
 *
 * Returns the connection status of every configured analyzer.
 * The MediMind EMR's LIS Monitoring Dashboard calls this endpoint
 * to show which machines are online, last message times, and error counts.
 */

import { Router, type Request, type Response } from 'express';
import type { AnalyzerStatus } from '../../types/analyzer.js';

export interface StatusDeps {
  /** Returns the status of all configured analyzers */
  getStatuses: () => AnalyzerStatus[];
}

export function createStatusRouter(deps: StatusDeps): Router {
  const router = Router();

  router.get('/', (_req: Request, res: Response) => {
    const analyzers = deps.getStatuses();
    res.json({ analyzers });
  });

  return router;
}
