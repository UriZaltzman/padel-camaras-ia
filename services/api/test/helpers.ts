import { Writable } from 'node:stream';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Logger } from 'pino';
import { OTP_STORE, InMemoryOtpStore } from '../src/auth/otp/otp-store';
import { SESSION_STORE, InMemorySessionStore } from '../src/auth/session/session-store';
import {
  BOOKING_IDEMPOTENCY,
  InMemoryBookingIdempotency,
} from '../src/bookings/booking-idempotency';
import {
  BookingsRepository,
  InMemoryBookingsRepository,
} from '../src/bookings/bookings.repository';
import { ClubsRepository, InMemoryClubsRepository } from '../src/clubs/clubs.repository';
import { CLOCK, FakeClock } from '../src/common/clock';
import { WHATSAPP_PROVIDER, FakeWhatsAppProvider } from '../src/notifications/whatsapp-provider';
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
export async function createTestApp(
  controllers: (new (...args: never[]) => unknown)[] = [],
  options: { databaseUrl?: string } = {},
) {
  const env = loadEnv({
    ...VALID_ENV,
    DATABASE_URL: options.databaseUrl ?? VALID_ENV.DATABASE_URL,
  });
  const { logger, lines } = memoryLogger(env);
  // Nothing in tests talks to Redis, WhatsApp or the wall clock.
  const whatsapp = new FakeWhatsAppProvider();
  const clock = new FakeClock();
  const builder = Test.createTestingModule({
    imports: [AppModule.register(env)],
    controllers,
  })
    .overrideProvider(SESSION_STORE)
    .useValue(new InMemorySessionStore())
    .overrideProvider(OTP_STORE)
    .useValue(new InMemoryOtpStore())
    .overrideProvider(WHATSAPP_PROVIDER)
    .useValue(whatsapp)
    .overrideProvider(BOOKING_IDEMPOTENCY)
    .useValue(new InMemoryBookingIdempotency())
    .overrideProvider(CLOCK)
    .useValue(clock);
  // With a real database the Prisma repository stays; without one the club list is empty.
  const moduleRef = await (
    options.databaseUrl
      ? builder
      : builder
          .overrideProvider(ClubsRepository)
          .useValue(new InMemoryClubsRepository())
          .overrideProvider(BookingsRepository)
          .useValue(new InMemoryBookingsRepository())
  ).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    logger: new PinoLoggerService(logger),
  });
  configureApp(app, logger);
  await app.init();
  return { app, logs: lines, whatsapp, clock };
}
