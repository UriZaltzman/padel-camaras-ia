import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { Redis } from 'ioredis';
import type { Env } from '../config/env';
import { ENV } from '../config/env.module';

/** Injection token for the shared Redis client used by stores (OTP, sessions). */
export const REDIS = Symbol('REDIS');

/** One lazy connection: nothing connects until the first command, so the app boots without Redis. */
@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [ENV],
      useFactory: (env: Env) => new Redis(env.REDIS_URL, { lazyConnect: true }),
    },
  ],
  exports: [REDIS],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    this.redis.disconnect();
  }
}
