import { Writable } from 'node:stream';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Logger } from 'pino';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { loadEnv, type Env } from '../src/config/env';
import { createLogger, PinoLoggerService } from '../src/logging/logger';

export const VALID_ENV = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'info',
  DATABASE_URL: 'postgresql://app:app@localhost:5432/app',
  REDIS_URL: 'redis://localhost:6379',
} as const;

/** A logger that keeps every JSON line in memory. */
export function memoryLogger(env: Pick<Env, 'LOG_LEVEL'> = { LOG_LEVEL: 'info' }): {
  logger: Logger;
  lines: () => Record<string, unknown>[];
} {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      chunks.push(chunk.toString());
      callback();
    },
  });
  const logger = createLogger(env, stream);
  return {
    logger,
    lines: () =>
      chunks
        .join('')
        .split('\n')
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line) as Record<string, unknown>),
  };
}

/** The real app wiring plus optional extra controllers, without opening a port. */
export async function createTestApp(controllers: (new (...args: never[]) => unknown)[] = []) {
  const env = loadEnv(VALID_ENV);
  const { logger, lines } = memoryLogger(env);
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.register(env)],
    controllers,
  }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    logger: new PinoLoggerService(logger),
  });
  configureApp(app, logger);
  await app.init();
  return { app, logs: lines };
}
