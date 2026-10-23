import { Inject, Injectable } from '@nestjs/common';
import type { AccessIdentity } from '../auth/session/session.service';
import { CLOCK, type Clock } from '../common/clock';
import { AppError } from '../errors/app-error';
import type { Logger } from 'pino';
import { ENV } from '../config/env.module';
import type { Env } from '../config/env';
import { createLogger } from '../logging/logger';
import { setLogContext } from '../logging/request-context';
import { PAYMENT_EVENTS, type PaymentEventPublisher } from '../payments/payment-events';
import { PAYMENT_PROVIDER, type PaymentProvider } from '../payments/payment-provider';
import { refundableInTime, resolveRefundHours } from './cancellation-policy';
import { CancellationRepository, type CancelTarget } from './cancellation.repository';

export interface BookingCancellationDto {
  booking_id: string;
  status: 'cancelled';
  cancelled_at: string;
  refund_cents: number;
  refund_status: 'none' | 'pending';
  cancelled_booking_ids: string[];
}

interface Actor {
  db: { role: 'player' | 'staff' | 'owner'; userId: string; clubId?: string };
  isStaff: boolean;
}

@Injectable()
export class CancellationService {
  private readonly logger: Logger;

  constructor(
    private readonly repo: CancellationRepository,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    @Inject(PAYMENT_EVENTS) private readonly events: PaymentEventPublisher,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ENV) env: Env,
  ) {
    this.logger = createLogger(env).child({ context: 'Cancellation' });
  }

  /** Player 1 or the club's staff cancel; the deposit comes back only inside the window. */
  async cancel(auth: AccessIdentity, bookingId: string): Promise<BookingCancellationDto> {
    const { booking } = await this.load(auth, bookingId, true);
    return this.doCancel(booking, false);
  }

  /**
   * The club closes the court (rain, maintenance): the player always gets the deposit back,
   * whatever the notice. Staff only.
   */
  async cancelByClub(auth: AccessIdentity, bookingId: string): Promise<BookingCancellationDto> {
    const { booking, actor } = await this.load(auth, bookingId, true);
    if (!actor.isStaff) throw new AppError('FORBIDDEN');
    return this.doCancel(booking, true);
  }

  /** Staff marks a confirmed booking that started and nobody came: the deposit is kept. */
  async markNoShow(auth: AccessIdentity, bookingId: string): Promise<void> {
    const { booking, actor } = await this.load(auth, bookingId, false);
    if (!actor.isStaff) throw new AppError('FORBIDDEN');
    if (booking.status !== 'confirmed' || booking.startsAt > this.clock.now()) {
      throw new AppError('INVALID_STATE_TRANSITION');
    }
    if (!(await this.repo.markNoShow(booking.clubId, booking.id))) {
      throw new AppError('INVALID_STATE_TRANSITION');
    }
  }

  /** Re-sends refunds whose provider call failed after the booking was cancelled. */
  async retryPendingRefunds(clubId: string): Promise<number> {
    let done = 0;
    for (const booking of await this.repo.cancelledWithOpenDeposit(clubId)) {
      const at = booking.cancelledAt;
      if (!at || !booking.deposit || booking.deposit.status !== 'approved') continue;
      const hours = resolveRefundHours(booking.courtRefundHours, booking.clubRefundHours);
      if (!refundableInTime(booking.startsAt, at, hours)) continue;
      try {
        await this.provider.refund(booking.deposit.providerPaymentId);
        done += 1;
      } catch (error) {
        this.logger.warn({ booking_id: booking.id, err: String(error) }, 'refund retry failed');
      }
    }
    return done;
  }

  private async load(
    auth: AccessIdentity,
    bookingId: string,
    requireFirstPlayer: boolean,
  ): Promise<{ booking: CancelTarget; actor: Actor }> {
    const asPlayer = await this.repo.find({ role: 'player', userId: auth.userId }, bookingId);
    if (asPlayer) {
      setLogContext({ club_id: asPlayer.clubId });
      const staff = (await this.repo.staffClubs(auth.userId)).find(
        (c) => c.clubId === asPlayer.clubId,
      );
      if (staff) {
        return {
          booking: asPlayer,
          actor: {
            db: { role: staff.role, userId: auth.userId, clubId: staff.clubId },
            isStaff: true,
          },
        };
      }
      const first = asPlayer.firstPlayerId ?? asPlayer.createdByUserId;
      if (requireFirstPlayer && first !== auth.userId) throw new AppError('FORBIDDEN');
      return {
        booking: asPlayer,
        actor: { db: { role: 'player', userId: auth.userId }, isStaff: false },
      };
    }
    for (const club of await this.repo.staffClubs(auth.userId)) {
      const found = await this.repo.find(
        { role: club.role, userId: auth.userId, clubId: club.clubId },
        bookingId,
      );
      if (found) {
        setLogContext({ club_id: found.clubId });
        return {
          booking: found,
          actor: {
            db: { role: club.role, userId: auth.userId, clubId: club.clubId },
            isStaff: true,
          },
        };
      }
    }
    throw new AppError('NOT_FOUND');
  }

  private async doCancel(
    booking: CancelTarget,
    alwaysRefund: boolean,
  ): Promise<BookingCancellationDto> {
    // `held` bookings expire on their own; anything past `confirmed` cannot be undone.
    if (booking.status !== 'confirmed') throw new AppError('INVALID_STATE_TRANSITION');
    const now = this.clock.now();
    if (!(await this.repo.markCancelled(booking.clubId, booking.id, now))) {
      throw new AppError('INVALID_STATE_TRANSITION');
    }

    const hours = resolveRefundHours(booking.courtRefundHours, booking.clubRefundHours);
    const refundable =
      booking.deposit?.status === 'approved' &&
      booking.depositPaidCents > 0 &&
      (alwaysRefund || refundableInTime(booking.startsAt, now, hours));

    let refundCents = 0;
    if (refundable && booking.deposit) {
      // The booking stays cancelled if the provider fails; `retryPendingRefunds` sends it again.
      try {
        await this.provider.refund(booking.deposit.providerPaymentId);
      } catch (error) {
        this.logger.error({ booking_id: booking.id, err: String(error) }, 'refund failed');
        throw new AppError('PAYMENT_PROVIDER_ERROR', { reason: 'refund_failed' });
      }
      refundCents = booking.depositPaidCents;
    }
    return {
      booking_id: booking.id,
      status: 'cancelled',
      cancelled_at: now.toISOString(),
      refund_cents: refundCents,
      // Becomes `refunded` when the Mercado Pago webhook confirms it.
      refund_status: refundCents > 0 ? 'pending' : 'none',
      cancelled_booking_ids: [booking.id],
    };
  }
}
