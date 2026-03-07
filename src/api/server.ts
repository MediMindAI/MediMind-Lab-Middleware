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
import { createSimulateRouter, type SimulateDeps } from './routes/simulate.js';

export interface ServerDeps {
  /** Dependencies for the /health endpoint */
  health: HealthDeps;
  /** Dependencies for the /status endpoint */
  status: StatusDeps;
  /** Dependencies for the /messages endpoint (optional — not all callers need it) */
  messages?: MessagesDeps;
  /** Dependencies for the /results endpoint (optional — for EMR result polling) */
  results?: ResultsDeps;
  /** Dependencies for the /simulate-result endpoint (optional — dev testing only) */
  simulate?: SimulateDeps;
  /** Optional API key — if set, all endpoints except /health require X-Api-Key header */
  apiKey?: string;
  /** Optional CORS origin — defaults to '*' if not set */
  corsOrigin?: string;
  /** Optional logger — if provided, used instead of console.error in error handler */
  logger?: { error: (msg: string, meta?: Record<string, unknown>) => void };
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
    res.header('Access-Control-Allow-Origin', deps.corsOrigin || '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Api-Key');

    if (_req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // Simple rate limiter — 100 requests per minute per IP
  const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
  const RATE_LIMIT = 100;
  const RATE_WINDOW_MS = 60_000;

  // Evict expired rate-limit entries every 5 minutes to prevent unbounded memory growth
  setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of rateLimitMap) {
      if (now > entry.resetAt) {
        rateLimitMap.delete(ip);
      }
    }
  }, 5 * 60_000).unref();

  app.use((req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const entry = rateLimitMap.get(ip);

    if (!entry || now > entry.resetAt) {
      rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
      return next();
    }

    entry.count++;
    if (entry.count > RATE_LIMIT) {
      res.status(429).json({ error: 'Too many requests — try again later' });
      return;
    }
    next();
  });

  // API key authentication — protects patient data on the hospital LAN
  if (deps.apiKey) {
    app.use((req: Request, res: Response, next: NextFunction) => {
      // /health is always public (for monitoring tools)
      if (req.path === '/health' || req.path.startsWith('/health')) {
        return next();
      }
      const key = req.headers['x-api-key'];
      if (key !== deps.apiKey) {
        res.status(401).json({ error: 'Unauthorized — missing or invalid API key' });
        return;
      }
      next();
    });
  }

  // --- Routes ---
  app.use('/health', createHealthRouter(deps.health));
  app.use('/status', createStatusRouter(deps.status));
  if (deps.messages) {
    app.use('/messages', createMessagesRouter(deps.messages));
  }
  if (deps.results) {
    app.use('/results', createResultsRouter(deps.results));
  }
  if (deps.simulate) {
    app.use('/simulate-result', createSimulateRouter(deps.simulate));
  }

  // --- 404 handler ---
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found' });
  });

  // --- Error handler ---
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    if (deps.logger) {
      deps.logger.error('Unhandled API error', { error: err.message });
    } else {
      console.error('Unhandled API error:', err.message);
    }
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
