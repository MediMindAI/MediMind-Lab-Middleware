/**
 * /messages — Message audit log endpoint.
 *
 * Returns paginated message log entries for debugging and audit trail.
 * Each entry represents one message received from (or sent to) an analyzer.
 *
 * Endpoints:
 * - GET  /messages         — paginated list with optional filters
 * - GET  /messages/:id     — single message by ID (404 if not found)
 * - POST /messages/:id/retry — re-queue a failed message for retry
 */

import { Router, type Request, type Response } from 'express';
import type { MessageLogger } from '../../logging/messageLogger.js';

/** Minimal queue interface — just needs to re-enqueue by raw payload */
export interface RetryQueue {
  enqueueRaw: (messageId: string, analyzerId: string, payload: string) => number;
}

export interface MessagesDeps {
  /** The message logger instance to query */
  logger: MessageLogger;
  /** Optional queue for retrying failed messages */
  retryQueue?: RetryQueue;
}

export function createMessagesRouter(deps: MessagesDeps): Router {
  const router = Router();

  // GET /messages — paginated list with filters
  router.get('/', (req: Request, res: Response) => {
    const limit = clampInt(req.query.limit, 1, 500, 50);
    const offset = Math.max(0, parseInt(String(req.query.offset), 10) || 0);
    const analyzerId = req.query.analyzerId as string | undefined;
    const status = req.query.status as string | undefined;
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;

    const filters = { analyzerId, status, from, to, limit, offset };

    const messages = deps.logger.queryMessages(filters);
    const total = deps.logger.getCount({ analyzerId, status });

    res.json({ messages, total, limit, offset });
  });

  // GET /messages/:id — single message detail
  router.get('/:id', (req: Request, res: Response) => {
    const id = parseInt(String(req.params.id), 10);

    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid message ID' });
      return;
    }

    const message = deps.logger.getMessageById(id);

    if (!message) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }

    res.json(message);
  });

  // POST /messages/:id/retry — re-queue a failed message
  router.post('/:id/retry', (req: Request, res: Response) => {
    if (!deps.retryQueue) {
      res.status(501).json({ error: 'Retry not available' });
      return;
    }

    const id = parseInt(String(req.params.id), 10);

    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid message ID' });
      return;
    }

    const message = deps.logger.getMessageById(id);

    if (!message) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }

    if (message.status !== 'send-error' && message.status !== 'queued') {
      res.status(409).json({ error: `Cannot retry message with status "${message.status}"` });
      return;
    }

    deps.retryQueue.enqueueRaw(
      `retry-${id}-${Date.now()}`,
      message.analyzerId,
      message.rawContent,
    );

    res.json({ success: true, messageId: id });
  });

  return router;
}

/** Parses a query param as integer, clamped between min/max, with a default */
function clampInt(value: unknown, min: number, max: number, defaultValue: number): number {
  const parsed = parseInt(String(value), 10);
  if (isNaN(parsed)) return defaultValue;
  return Math.min(max, Math.max(min, parsed));
}
