import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../common/clock';
import { AppError } from '../errors/app-error';
import {
  AVAILABILITY_CACHE_SECONDS,
  MIN_NOTICE_MINUTES,
  horizonFor,
  type BookingAudience,
} from './booking-policy';
import { BookingsRepository, type CourtRules } from './bookings.repository';
import { generateSlots, localToUtc, type Slot } from './slots';

export interface CourtAvailabilityDto {
  court_id: string;
  date: string;
  timezone: string;
  duration_minutes: number;
  slots: { starts_at: string; ends_at: string; amount_cents: number; deposit_cents: number }[];
}

interface CacheEntry {
  expiresAt: number;
  value: CourtAvailabilityDto;
}

/**
 * Free starts of a court for one local day and duration. Answers from a per-court cache of
 * 30 s (spec §9); every write that changes a court's occupancy calls `invalidate`, so this
 * process never serves its own stale answer. Other processes lag by at most the TTL, and
 * `POST /bookings` stays the source of truth.
 */
@Injectable()
export class AvailabilityService {
  private readonly cache = new Map<string, Map<string, CacheEntry>>();

  constructor(
    private readonly repo: BookingsRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async forCourt(
    courtId: string,
    date: string,
    durationMinutes: number,
  ): Promise<CourtAvailabilityDto> {
    const now = this.clock.now().getTime();
    const key = `${date}|${durationMinutes}`;
    const hit = this.cache.get(courtId)?.get(key);
    if (hit && hit.expiresAt > now) return hit.value;

    const court = await this.repo.findCourt(courtId);
    if (!court) throw new AppError('NOT_FOUND');
    const value = await this.compute(court, date, durationMinutes);
    const perCourt = this.cache.get(courtId) ?? new Map<string, CacheEntry>();
    perCourt.set(key, { expiresAt: now + AVAILABILITY_CACHE_SECONDS * 1000, value });
    this.cache.set(courtId, perCourt);
    return value;
  }

  /** Free slots of `date` computed from the database, bypassing the cache. */
  async slotsFor(
    court: CourtRules,
    date: string,
    durationMinutes: number,
    options: { ignoreOccupancy?: boolean; audience?: BookingAudience } = {},
  ): Promise<Slot[]> {
    if (court.status !== 'active') return [];
    const now = this.clock.now();
    const from = localToUtc(date, -1440, court.timezone);
    const to = localToUtc(date, 2880, court.timezone);
    const occupied = options.ignoreOccupancy
      ? []
      : await this.repo.occupied(court.clubId, court.courtId, from, to, now);
    return generateSlots({
      rules: court.rules,
      date,
      timezone: court.timezone,
      durationMinutes,
      deposit: court.deposit,
      occupied,
      now,
      minNoticeMinutes: MIN_NOTICE_MINUTES,
      horizonDays: horizonFor(options.audience ?? 'player', court.playerHorizonDays),
      // Staff are not held back by the daily opening of the farthest day.
      windowOpensAtMinutes: options.audience === 'staff' ? null : court.windowOpensAtMinutes,
    });
  }

  invalidate(courtId: string): void {
    this.cache.delete(courtId);
  }

  invalidateAll(): void {
    this.cache.clear();
  }

  private async compute(
    court: CourtRules,
    date: string,
    durationMinutes: number,
  ): Promise<CourtAvailabilityDto> {
    const slots = await this.slotsFor(court, date, durationMinutes);
    return {
      court_id: court.courtId,
      date,
      timezone: court.timezone,
      duration_minutes: durationMinutes,
      slots: slots.map((s) => ({
        starts_at: s.start.toISOString(),
        ends_at: s.end.toISOString(),
        amount_cents: s.amountCents,
        deposit_cents: s.depositCents,
      })),
    };
  }
}
