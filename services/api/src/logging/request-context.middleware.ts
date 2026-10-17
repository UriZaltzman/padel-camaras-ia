import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { Logger } from 'pino';
import { runWithLogContext, type LogContext } from './request-context';

export const REQUEST_ID_HEADER = 'X-Request-Id';

// An id sent by a trusted caller (for example the club device) is kept so both sides share it.
// Anything else is replaced, so a client cannot inject arbitrary text into the logs.
const INCOMING_ID = /^[A-Za-z0-9._-]{8,128}$/;

/**
 * Gives each request an id, returns it in `X-Request-Id`, runs the rest of the request inside
 * its log context and writes one line when the response finishes.
 * The line has the route pattern (not the URL, which may carry tokens), status and duration.
 */
export function requestContextMiddleware(logger: Logger) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const incoming = req.get(REQUEST_ID_HEADER);
    const context: LogContext = {
      request_id: incoming && INCOMING_ID.test(incoming) ? incoming : randomUUID(),
    };
    res.setHeader(REQUEST_ID_HEADER, context.request_id);
    const startedAt = process.hrtime.bigint();

    res.on('finish', () => {
      const route: unknown = req.route?.path;
      logger.info(
        {
          ...context,
          method: req.method,
          route: typeof route === 'string' ? route : null,
          status: res.statusCode,
          duration_ms: Number(process.hrtime.bigint() - startedAt) / 1e6,
        },
        'request completed',
      );
    });

    runWithLogContext(context, next);
  };
}
