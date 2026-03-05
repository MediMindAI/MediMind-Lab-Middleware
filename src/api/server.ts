/**
 * Express REST API server for the middleware.
 *
 * This is the "front door" that MediMind EMR knocks on to check
 * how the middleware is doing. It provides endpoints for:
 * - /health — is the service alive and healthy?
 * - /status — what's the status of each analyzer connection?
 * - /messages — audit log of all messages from analyzers
 *
 * - /results/:barcode — look up results by specimen barcode (for EMR polling)
 */

import express, { type Request, type Response, type NextFunction } from 'express';
import { createHealthRouter, type HealthDeps } from './routes/health.js';
import { createStatusRouter, type StatusDeps } from './routes/status.js';
import { createMessagesRouter, type MessagesDeps } from './routes/messages.js';
import { createResultsRouter, type ResultsDeps } from './routes/results.js';

export interface ServerDeps {
  /** Dependencies for the /health endpoint */
  health: HealthDeps;
  /** Dependencies for the /status endpoint */
  status: StatusDeps;
  /** Dependencies for the /messages endpoint (optional — not all callers need it) */
  messages?: MessagesDeps;
  /** Dependencies for the /results endpoint (optional — for EMR result polling) */
  results?: ResultsDeps;
}

/**
 * Creates and configures the Express application.
 * Does NOT call listen() — the caller decides when to start.
 */
export function createServer(deps: ServerDeps): express.Express {
  const app = express();

  // --- Middleware ---

  // Parse JSON request bodies (for future POST endpoints)
  app.use(express.json());

  // CORS headers — allow MediMind EMR (running in a browser) to call this API
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (_req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // --- Routes ---
  app.use('/health', createHealthRouter(deps.health));
  app.use('/status', createStatusRouter(deps.status));
  if (deps.messages) {
    app.use('/messages', createMessagesRouter(deps.messages));
  }
  if (deps.results) {
    app.use('/results', createResultsRouter(deps.results));
  }

  // --- 404 handler ---
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found' });
  });

  // --- Error handler ---
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Unhandled API error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
