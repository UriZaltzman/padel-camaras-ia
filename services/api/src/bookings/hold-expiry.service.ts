import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { CLOCK, type Clock } from '../common/clock';
import { ENV } from '../config/env.module';
import type { Env } from '../config/env';
import { AvailabilityService } from './availability.service';
import { BookingsRepository } from './bookings.repository';

const EVERY_MS = 60_000;

/** Every minute moves unpaid `held` bookings past `hold_expires_at` to `expired` (spec §9). */
@Injectable()
export class HoldExpiryService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(HoldExpiryService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly repo: BookingsRepository,
    private readonly availability: AvailabilityService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onApplicationBootstrap(): void {
    if (this.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => {
      this.runOnce().catch((error: unknown) =>
        this.logger.error(`hold expiry failed: ${String(error)}`),
      );
    }, EVERY_MS);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** One pass over every club; safe to run from several instances (the UPDATE is idempotent). */
  async runOnce(): Promise<number> {
    const now = this.clock.now();
    let expired = 0;
    for (const clubId of await this.repo.clubIds()) {
      const courts = await this.repo.expireHolds(clubId, now);
      for (const courtId of courts) this.availability.invalidate(courtId);
      expired += courts.length;
    }
    return expired;
  }
}
