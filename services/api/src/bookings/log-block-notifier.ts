import { Inject, Injectable } from '@nestjs/common';
import type { Logger } from 'pino';
import type { Env } from '../config/env';
import { ENV } from '../config/env.module';
import { createLogger } from '../logging/logger';
import { BlockNotifier } from './court-blocks.repository';

/** Placeholder until the WhatsApp template for club cancellations is wired to the event bus. */
@Injectable()
export class LogBlockNotifier extends BlockNotifier {
  private readonly logger: Logger;

  constructor(@Inject(ENV) env: Env) {
    super();
    this.logger = createLogger(env).child({ context: 'BlockNotifier' });
  }

  bookingCancelledByClub(input: { bookingId: string; refundCents: number }): Promise<void> {
    this.logger.info(
      { booking_id: input.bookingId, refund_cents: input.refundCents },
      'booking cancelled by club block',
    );
    return Promise.resolve();
  }
}
