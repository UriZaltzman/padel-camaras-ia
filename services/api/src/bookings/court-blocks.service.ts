import { Inject, Injectable } from '@nestjs/common';
import type { Logger } from 'pino';
import type { AccessIdentity } from '../auth/session/session.service';
import { ClubAccessService } from '../clubs/club-access.service';
import { CLOCK, type Clock } from '../common/clock';
import type { Env } from '../config/env';
import { ENV } from '../config/env.module';
import type { DbContext } from '../db/db-context';
import { newId } from '../db/ids';
import { AppError } from '../errors/app-error';
import { createLogger } from '../logging/logger';
import { holidaysOf } from './ar-holidays';
import { AvailabilityService } from './availability.service';
import { SlotTakenError } from './bookings.repository';
import { CancellationService } from './cancellation.service';
import {
  BlockNotifier,
  CourtBlocksRepository,
  type BlockKind,
  type ConflictingBooking,
  type StoredBlock,
} from './court-blocks.repository';
import { addDays, localDate, localToUtc } from './slots';

/** What to do with bookings already on the blocked time (CL-04). */
export type ExistingBookingsPolicy = 'cancel_and_refund' | 'move' | 'abort';

/** A recurring block never reaches further than this many occurrences (about a year). */
export const MAX_BLOCK_OCCURRENCES = 53;

export interface BlockInput {
  court_ids: string[];
  starts_at: string;
  ends_at: string;
  kind: BlockKind;
  reason?: string | undefined;
  recurrence?: { frequency: 'daily' | 'weekly'; until: string } | undefined;
  existing_bookings_policy?: ExistingBookingsPolicy | undefined;
}

export interface HolidayImportInput {
  year: number;
  court_ids: string[];
  /** Local dates to block; defaults to the national list of `year`. */
  dates?: string[] | undefined;
  existing_bookings_policy?: ExistingBookingsPolicy | undefined;
}

export interface BlockDto {
  id: string;
  court_id: string;
  starts_at: string;
  ends_at: string;
  kind: BlockKind;
  reason: string | null;
  series_id: string | null;
}

export interface BlockResultDto {
  blocks: BlockDto[];
  cancelled_booking_ids: string[];
  refunded_cents: number;
  moved: { booking_id: string; court_id: string }[];
}

interface Occurrence {
  courtId: string;
  start: Date;
  end: Date;
}

const toDto = (b: StoredBlock): BlockDto => ({
  id: b.id,
  court_id: b.courtId,
  starts_at: b.startsAt.toISOString(),
  ends_at: b.endsAt.toISOString(),
  kind: b.kind,
  reason: b.reason,
  series_id: b.seriesId,
});

@Injectable()
export class CourtBlocksService {
  private readonly logger: Logger;

  constructor(
    private readonly repo: CourtBlocksRepository,
    private readonly access: ClubAccessService,
    private readonly cancellation: CancellationService,
    private readonly availability: AvailabilityService,
    private readonly notifier: BlockNotifier,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ENV) env: Env,
  ) {
    this.logger = createLogger(env).child({ context: 'CourtBlocks' });
  }

  async create(auth: AccessIdentity, clubId: string, input: BlockInput): Promise<BlockResultDto> {
    const { db } = await this.access.authorize(auth, clubId, 'club.operate');
    const courts = await this.loadCourts(db, clubId, input.court_ids);
    const timezone = courts[0]?.timezone ?? 'America/Argentina/Buenos_Aires';
    const start = new Date(input.starts_at);
    const end = new Date(input.ends_at);
    if (!(end > start)) throw new AppError('VALIDATION_FAILED', { field: 'ends_at' });

    const dates = this.occurrenceDates(start, timezone, input.recurrence);
    const startMinutes =
      (start.getTime() - localToUtc(dates[0] ?? '', 0, timezone).getTime()) / 60_000;
    const lengthMinutes = (end.getTime() - start.getTime()) / 60_000;
    const occurrences: Occurrence[] = [];
    for (const date of dates) {
      for (const id of input.court_ids) {
        occurrences.push({
          courtId: id,
          start: localToUtc(date, startMinutes, timezone),
          end: localToUtc(date, startMinutes + lengthMinutes, timezone),
        });
      }
    }
    const seriesId = dates.length > 1 ? newId() : null;
    return this.apply(auth, db, clubId, occurrences, input, seriesId);
  }

  /** One full-day `holiday` block per date and court. */
  async importHolidays(
    auth: AccessIdentity,
    clubId: string,
    input: HolidayImportInput,
  ): Promise<BlockResultDto> {
    const { db } = await this.access.authorize(auth, clubId, 'club.operate');
    const courts = await this.loadCourts(db, clubId, input.court_ids);
    const timezone = courts[0]?.timezone ?? 'America/Argentina/Buenos_Aires';
    const dates = input.dates ?? holidaysOf(input.year).map((h) => h.date);
    if (dates.some((d) => d.slice(0, 4) !== String(input.year))) {
      throw new AppError('VALIDATION_FAILED', { field: 'dates' });
    }
    const today = localDate(this.clock.now(), timezone);
    const occurrences: Occurrence[] = [];
    for (const date of dates.filter((d) => d >= today)) {
      for (const id of input.court_ids) {
        occurrences.push({
          courtId: id,
          start: localToUtc(date, 0, timezone),
          end: localToUtc(date, 1440, timezone),
        });
      }
    }
    return this.apply(
      auth,
      db,
      clubId,
      occurrences,
      {
        kind: 'holiday',
        reason: 'Feriado',
        existing_bookings_policy: input.existing_bookings_policy,
      },
      null,
    );
  }

  async list(
    auth: AccessIdentity,
    clubId: string,
    range: { from: Date; to: Date },
  ): Promise<BlockDto[]> {
    const { db } = await this.access.authorize(auth, clubId, 'club.operate');
    return (await this.repo.list(db, clubId, range.from, range.to)).map(toDto);
  }

  async remove(auth: AccessIdentity, clubId: string, blockId: string): Promise<void> {
    const { db } = await this.access.authorize(auth, clubId, 'club.operate');
    if (!(await this.repo.remove(db, clubId, blockId))) throw new AppError('NOT_FOUND');
    this.availability.invalidateAll();
  }

  private async loadCourts(db: DbContext, clubId: string, courtIds: string[]) {
    const courts = await this.repo.courts(db, clubId, courtIds);
    if (new Set(courts.map((c) => c.id)).size !== new Set(courtIds).size) {
      throw new AppError('NOT_FOUND');
    }
    return courts;
  }

  private occurrenceDates(
    start: Date,
    timezone: string,
    recurrence: BlockInput['recurrence'],
  ): string[] {
    const first = localDate(start, timezone);
    if (!recurrence) return [first];
    const step = recurrence.frequency === 'weekly' ? 7 : 1;
    const dates: string[] = [];
    for (let d = first; d <= recurrence.until; d = addDays(d, step)) {
      dates.push(d);
      if (dates.length > MAX_BLOCK_OCCURRENCES) {
        throw new AppError('VALIDATION_FAILED', { field: 'recurrence.until' });
      }
    }
    if (dates.length === 0) throw new AppError('VALIDATION_FAILED', { field: 'recurrence.until' });
    return dates;
  }

  /**
   * Resolves the bookings under the requested time, then writes the blocks. Without a policy
   * (or with `abort`) any conflict answers 409 and nothing changes.
   */
  private async apply(
    auth: AccessIdentity,
    db: DbContext,
    clubId: string,
    occurrences: Occurrence[],
    input: Pick<BlockInput, 'kind' | 'reason' | 'existing_bookings_policy'>,
    seriesId: string | null,
  ): Promise<BlockResultDto> {
    const now = this.clock.now();
    await this.repo.expireHolds(db, clubId, now);
    const conflicts: ConflictingBooking[] = [];
    const seen = new Set<string>();
    for (const o of occurrences) {
      for (const c of await this.repo.conflicts(db, o.courtId, o.start, o.end)) {
        if (!seen.has(c.id)) {
          seen.add(c.id);
          conflicts.push(c);
        }
      }
    }

    const result: BlockResultDto = {
      blocks: [],
      cancelled_booking_ids: [],
      refunded_cents: 0,
      moved: [],
    };
    const policy = input.existing_bookings_policy;
    if (conflicts.length > 0) {
      const details = {
        conflicting_booking_ids: conflicts.map((c) => c.id),
        policies: ['cancel_and_refund', 'move', 'abort'],
      };
      // Another block is never cancelled or moved by this request.
      if (!policy || policy === 'abort' || conflicts.some((c) => c.isBlock)) {
        throw new AppError('BOOKING_SLOT_TAKEN', details);
      }
      if (policy === 'move') {
        const plan = await this.planMoves(db, clubId, occurrences, conflicts);
        if (!plan) throw new AppError('BOOKING_SLOT_TAKEN', details);
        for (const m of plan) {
          try {
            await this.repo.moveBooking(db, m.bookingId, m.courtId);
          } catch (error) {
            if (error instanceof SlotTakenError) throw new AppError('BOOKING_SLOT_TAKEN', details);
            throw error;
          }
          result.moved.push({ booking_id: m.bookingId, court_id: m.courtId });
        }
      } else {
        for (const c of conflicts) await this.cancelOne(auth, db, clubId, c, input.reason, result);
      }
    }

    for (const o of occurrences) {
      try {
        const block = await this.repo.insert(db, {
          id: newId(),
          clubId,
          courtId: o.courtId,
          startsAt: o.start,
          endsAt: o.end,
          kind: input.kind,
          reason: input.reason ?? null,
          seriesId,
          createdByUserId: auth.userId,
        });
        result.blocks.push(toDto(block));
      } catch (error) {
        if (error instanceof SlotTakenError) {
          throw new AppError('BOOKING_SLOT_TAKEN', { court_id: o.courtId });
        }
        throw error;
      } finally {
        this.availability.invalidate(o.courtId);
      }
    }
    return result;
  }

  private async cancelOne(
    auth: AccessIdentity,
    db: DbContext,
    clubId: string,
    booking: ConflictingBooking,
    reason: string | undefined,
    result: BlockResultDto,
  ): Promise<void> {
    let refundCents = 0;
    if (booking.status === 'held') {
      await this.repo.cancelHold(db, booking.id, this.clock.now());
    } else if (booking.status === 'confirmed') {
      refundCents = (await this.cancellation.cancelByClub(auth, booking.id)).refund_cents;
    } else {
      // Already played: it cannot be cancelled, so the block cannot go over it.
      throw new AppError('BOOKING_SLOT_TAKEN', { conflicting_booking_ids: [booking.id] });
    }
    result.cancelled_booking_ids.push(booking.id);
    result.refunded_cents += refundCents;
    if (booking.playerUserId) {
      try {
        await this.notifier.bookingCancelledByClub({
          bookingId: booking.id,
          clubId,
          userId: booking.playerUserId,
          startsAt: booking.startsAt,
          refundCents,
          reason: reason ?? null,
        });
      } catch (error) {
        // The cancellation and refund stand; a lost notice must not undo them.
        this.logger.error({ booking_id: booking.id, err: String(error) }, 'notice failed');
      }
    }
  }

  /** Another free court for every conflicting booking, or null when one cannot be placed. */
  private async planMoves(
    db: DbContext,
    clubId: string,
    occurrences: Occurrence[],
    conflicts: ConflictingBooking[],
  ): Promise<{ bookingId: string; courtId: string }[] | null> {
    if (conflicts.some((c) => c.status !== 'confirmed' && c.status !== 'held')) return null;
    const blockedCourts = [...new Set(occurrences.map((o) => o.courtId))];
    const taken: { courtId: string; start: Date; end: Date }[] = [];
    const plan: { bookingId: string; courtId: string }[] = [];
    for (const c of conflicts) {
      const free = await this.repo.freeCourts(db, clubId, blockedCourts, c.startsAt, c.endsAt);
      const target = free.find(
        (id) => !taken.some((t) => t.courtId === id && t.start < c.endsAt && t.end > c.startsAt),
      );
      if (!target) return null;
      taken.push({ courtId: target, start: c.startsAt, end: c.endsAt });
      plan.push({ bookingId: c.id, courtId: target });
    }
    return plan;
  }
}
