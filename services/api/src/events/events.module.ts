import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { Redis } from 'ioredis';
import { ENV } from '../config/env.module';
import type { Env } from '../config/env';
import { createLogger } from '../logging/logger';
import { EventBus } from './event-bus';

/**
 * Provides the `EventBus`. Feature modules import it, call `subscribe()` in `onModuleInit`, and
 * the bus starts its worker once the app is bootstrapped. Not imported by `AppModule` yet: the
 * first module that publishes or consumes events adds it, so the app keeps booting without Redis
 * until something needs it.
 */
@Global()
@Module({
  providers: [
    {
      provide: EventBus,
      inject: [ENV],
      useFactory: (env: Env) => {
        // BullMQ requires `maxRetriesPerRequest: null` on connections used by workers.
        const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
        const logger = createLogger(env).child({ context: 'EventBus' });
        return new EventBus(connection, logger);
      },
    },
  ],
  exports: [EventBus],
})
export class EventsModule implements OnApplicationShutdown {
  constructor(@Inject(EventBus) private readonly bus: EventBus) {}

  onApplicationBootstrap(): void {
    this.bus.start();
  }

  async onApplicationShutdown(): Promise<void> {
    await this.bus.close();
  }
}
