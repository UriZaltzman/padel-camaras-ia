import type { Booking } from '@prisma/client';
import type { BookingRule, Deposit } from '../clubs/club-model';
import type { Interval } from './slots';

export interface CourtRules {
  courtId: string;
  clubId: string;
  timezone: string;
  status: 'active' | 'maintenance' | 'inactive';
  rules: BookingRule[];
  deposit: Deposit;
  cancellationRefundHours: number;
}

export interface NewHold {
  id: string;
  clubId: string;
  courtId: string;
  userId: string;
  startsAt: Date;
  endsAt: Date;
  priceCents: number;
  depositCents: number;
  /** `null` confirms the booking in the same insert (no deposit). */
  holdExpiresAt: Date | null;
  cancellationRefundHours: number;
}

export interface StoredBooking {
  booking: Booking;
  playerName: string;
}

/** Thrown by the repository when the exclusion constraint (23P01) rejects the insert. */
export class SlotTakenError extends Error {}

export abstract class BookingsRepository {
  /** Court with its rules, or null. Readable by any player (RLS), no personal data. */
  abstract findCourt(courtId: string): Promise<CourtRules | null>;
  /** Intervals of the court that hold it busy inside `[from, to)`; expired holds excluded. */
  abstract occupied(
    club: string,
    courtId: string,
    from: Date,
    to: Date,
    now: Date,
  ): Promise<Interval[]>;
  /** Flips `held` rows past their expiry to `expired` in the club; returns their court ids. */
  abstract expireHolds(clubId: string, now: Date): Promise<string[]>;
  abstract clubIds(): Promise<string[]>;
  /** Inserts booking + player 1 in one transaction. Throws `SlotTakenError` on 23P01. */
  abstract createHold(hold: NewHold): Promise<StoredBooking>;
  abstract findForPlayer(userId: string, bookingId: string): Promise<StoredBooking | null>;
}

/** Contract tests run without a database: no court exists. */
export class InMemoryBookingsRepository extends BookingsRepository {
  findCourt(): Promise<CourtRules | null> {
    return Promise.resolve(null);
  }
  occupied(): Promise<Interval[]> {
    return Promise.resolve([]);
  }
  expireHolds(): Promise<string[]> {
    return Promise.resolve([]);
  }
  clubIds(): Promise<string[]> {
    return Promise.resolve([]);
  }
  createHold(): Promise<StoredBooking> {
    return Promise.reject(new Error('not available in memory'));
  }
  findForPlayer(): Promise<StoredBooking | null> {
    return Promise.resolve(null);
  }
}
