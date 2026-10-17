import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Logger } from 'pino';
import { AllExceptionsFilter } from './errors/all-exceptions.filter';
import { requestContextMiddleware } from './logging/request-context.middleware';

/** API prefix from the contract (`servers: /v1`). */
export const API_PREFIX = 'v1';

/** Cross-cutting HTTP setup shared by `bootstrap` and the tests. */
export function configureApp(app: NestExpressApplication, logger: Logger): void {
  app.disable('x-powered-by');
  app.use(requestContextMiddleware(logger));
  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalFilters(new AllExceptionsFilter(logger));
}
