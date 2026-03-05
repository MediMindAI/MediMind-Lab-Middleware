/**
 * GET /health — Service health check endpoint.
 *
 * Returns the overall health of the middleware: "ok" if everything
 * is running smoothly, "degraded" if some analyzers are disconnected,
 * or "error" if something critical is broken.
 *
 * The MediMind EMR and monitoring systems call this to verify
 * the middleware is alive and functioning.
 */

import { Router, type Request, type Response } from 'express';
import type { AnalyzerStatus } from '../../types/analyzer.js';

export interface HealthDeps {
  /** Returns the status of all configured analyzers */
  getStatuses: () => AnalyzerStatus[];
  /** The time the service started (for uptime calculation) */
  startTime: Date;
  /** Middleware version string */
  version: string;
}

export function createHealthRouter(deps: HealthDeps): Router {
  const router = Router();

  router.get('/', (_req: Request, res: Response) => {
    const statuses = deps.getStatuses();
    const total = statuses.length;
    const connected = statuses.filter((s) => s.connected).length;
    const disconnected = total - connected;

    // Determine overall status
    let status: 'ok' | 'degraded' | 'error';
    if (total === 0) {
      status = 'ok'; // No analyzers configured — service itself is fine
    } else if (connected === total) {
      status = 'ok';
    } else if (connected > 0) {
      status = 'degraded';
    } else {
      status = 'error'; // ALL analyzers down
    }

    const uptimeSeconds = Math.floor((Date.now() - deps.startTime.getTime()) / 1000);

    res.json({
      status,
      version: deps.version,
      uptime: uptimeSeconds,
      timestamp: new Date().toISOString(),
      analyzers: {
        total,
        connected,
        disconnected,
      },
    });
  });

  return router;
}
