import { Inject, Injectable } from '@nestjs/common';
import type { AccessIdentity } from '../auth/session/session.service';
import { CLOCK, type Clock } from '../common/clock';
import { newId } from '../db/ids';
import { AppError } from '../errors/app-error';
import { setLogContext } from '../logging/request-context';
import { AvailabilityService } from './availability.service';
import { BOOKING_IDEMPOTENCY, type BookingIdempotency } from './booking-idempotency';
import { HOLD_MINUTES } from './booking-policy';
import {
  BookingsRepository,
  SlotTakenError,
  type CourtRules,
  type StoredBooking,
} from './bookings.repository';
import { KeyedMutex } from './keyed-mutex';
import { depositFor, localDate } from './slots';

export interface BookingCreateInput {
  court_id: string;
  starts_at: string;
  duration_minutes: 60 | 90 | 120;
}

export interface BookingDto {
  id: string;
  club_id: string;
  court_id: string;
  starts_at: string;
  ends_at: string;
  duration_minutes: number;
  status: string;
  hold_expires_at: string | null;
  price_cents: number;
  deposit_cents: number;
  deposit_paid_cents: number;
  cancellation_refund_hours: number;
  source: 'app' | 'panel';
  players: {
    position: number;
    user: { id: string; name: string } | null;
    accepted: boolean;
    guardian_consent_on_file: boolean;
  }[];
  no_record: boolean;
  no_record_reason: null;
  series: null;
  created_at: string;
}

@Injectable()
export class BookingsService {
  private readonly mutex = new KeyedMutex();

  constructor(
    private readonly repo: BookingsRepository,
    private readonly availability: AvailabilityService,
    @Inject(BOOKING_IDEMPOTENCY) private readonly idempotency: BookingIdempotency,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Holds the slot for 10 minutes, or confirms it at once when the court asks no deposit. */
  async create(
    auth: AccessIdentity,
    input: BookingCreateInput,
    idempotencyKey?: string,
  ): Promise<BookingDto> {
    if (idempotencyKey) {
      const existingId = await this.idempotency.find(auth.userId, idempotencyKey);
      if (existingId) {
        const stored = await this.repo.findForPlayer(auth.userId, existingId);
        const court = stored ? await this.repo.findCourt(stored.booking.courtId) : null;
        if (stored && court) return toDto(stored, court);
      }
    }

    return this.mutex.run(input.court_id, () => this.hold(auth, input, idempotencyKey));
  }

  private async hold(
    auth: AccessIdentity,
    input: BookingCreateInput,
    idempotencyKey?: string,
  ): Promise<BookingDto> {
    const court = await this.repo.findCourt(input.court_id);
    if (!court) throw new AppError('NOT_FOUND');
    setLogContext({ club_id: court.clubId });
    if (court.status !== 'active') throw new AppError('BOOKING_SLOT_INVALID');

    const startsAt = new Date(input.starts_at);
    const date = localDate(startsAt, court.timezone);
    // Holds past their expiry would still trip the exclusion constraint until the job runs.
    await this.repo.expireHolds(court.clubId, this.clock.now());
    const slots = await this.availability.slotsFor(court, date, input.duration_minutes);
    const slot = slots.find((s) => s.start.getTime() === startsAt.getTime());
    if (!slot) {
      // Distinguish "valid slot, someone else has it" from "breaks the rules".
      const rulesOnly = await this.availability.slotsFor(court, date, input.duration_minutes, {
        ignoreOccupancy: true,
      });
      if (rulesOnly.some((s) => s.start.getTime() === startsAt.getTime()))
        throw this.taken(court, startsAt);
      throw new AppError('BOOKING_SLOT_INVALID');
    }

    const now = this.clock.now();
    const needsDeposit = slot.depositCents > 0;
    let stored: StoredBooking;
    try {
      stored = await this.repo.createHold({
        id: newId(),
        clubId: court.clubId,
        courtId: court.courtId,
        userId: auth.userId,
        startsAt: slot.start,
        endsAt: slot.end,
        priceCents: slot.amountCents,
        depositCents: slot.depositCents,
        holdExpiresAt: needsDeposit ? new Date(now.getTime() + HOLD_MINUTES * 60_000) : null,
        cancellationRefundHours: court.cancellationRefundHours,
      });
    } catch (error) {
      if (error instanceof SlotTakenError) throw this.taken(court, startsAt);
      throw error;
    } finally {
      this.availability.invalidate(court.courtId);
    }
    if (idempotencyKey)
      await this.idempotency.remember(auth.userId, idempotencyKey, stored.booking.id);
    return toDto(stored, court);
  }

  private taken(court: CourtRules, startsAt: Date): AppError {
    return new AppError('BOOKING_SLOT_TAKEN', {
      court_id: court.courtId,
      starts_at: startsAt.toISOString(),
    });
  }
}

function toDto({ booking, playerName }: StoredBooking, court: CourtRules): BookingDto {
  const durationMinutes = Math.round(
    (booking.endsAt.getTime() - booking.startsAt.getTime()) / 60_000,
  );
  return {
    id: booking.id,
    club_id: booking.clubId,
    court_id: booking.courtId,
    starts_at: booking.startsAt.toISOString(),
    ends_at: booking.endsAt.toISOString(),
    duration_minutes: durationMinutes,
    status: booking.status,
    hold_expires_at: booking.holdExpiresAt?.toISOString() ?? null,
    price_cents: booking.priceCents,
    deposit_cents: depositFor(court.deposit, booking.priceCents),
    deposit_paid_cents: booking.depositPaidCents,
    cancellation_refund_hours: court.cancellationRefundHours,
    source: booking.origin === 'app' ? 'app' : 'panel',
    players: [
      {
        position: 1,
        user: booking.createdByUserId ? { id: booking.createdByUserId, name: playerName } : null,
        accepted: true,
        guardian_consent_on_file: false,
      },
    ],
    no_record: booking.noRecord,
    no_record_reason: null,
    series: null,
    created_at: booking.createdAt.toISOString(),
  };
}
