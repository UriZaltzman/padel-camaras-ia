import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { loadEnv } from './config/env';
import { createLogger, PinoLoggerService } from './logging/logger';

/**
 * Validates the environment, then builds and starts the API.
 * Throws `EnvValidationError` before creating anything if a variable is missing or invalid.
 */
export async function bootstrap(
  source: Record<string, string | undefined> = process.env,
): Promise<NestExpressApplication> {
  const env = loadEnv(source);
  const logger = createLogger(env);
  const app = await NestFactory.create<NestExpressApplication>(AppModule.register(env), {
    logger: new PinoLoggerService(logger),
  });
  // The lock-out per IP address needs the client's address, not the proxy's.
  if (env.HTTP_TRUST_PROXY_HOPS) app.set('trust proxy', env.HTTP_TRUST_PROXY_HOPS);
  configureApp(app, logger);
  app.enableShutdownHooks();
  await app.listen(env.PORT);
  logger.info({ port: env.PORT }, 'API listening');
  return app;
}
