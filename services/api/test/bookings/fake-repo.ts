import type { Booking } from '@prisma/client';
import {
  BookingsRepository,
  SlotTakenError,
  type CourtRules,
  type NewHold,
  type StoredBooking,
} from '../../src/bookings/bookings.repository';
import type { Interval } from '../../src/bookings/slots';

/** In-memory repository with the same exclusion rule the database enforces. */
export class FakeBookingsRepository extends BookingsRepository {
  rows: Booking[] = [];
  occupiedCalls = 0;
  constructor(readonly court: CourtRules) {
    super();
  }
  findCourt(courtId: string): Promise<CourtRules | null> {
    return Promise.resolve(courtId === this.court.courtId ? this.court : null);
  }
  occupied(_club: string, courtId: string, from: Date, to: Date, now: Date): Promise<Interval[]> {
    this.occupiedCalls += 1;
    return Promise.resolve(
      this.rows
        .filter((r) => r.courtId === courtId && r.startsAt < to && r.endsAt > from)
        .filter((r) => ['held', 'confirmed'].includes(r.status))
        .filter((r) => !(r.status === 'held' && r.holdExpiresAt && r.holdExpiresAt <= now))
        .map((r) => ({ start: r.startsAt, end: r.endsAt })),
    );
  }
  expireHolds(_club: string, now: Date): Promise<string[]> {
    const courts: string[] = [];
    for (const r of this.rows) {
      if (r.status === 'held' && r.holdExpiresAt && r.holdExpiresAt <= now) {
        r.status = 'expired';
        courts.push(r.courtId);
      }
    }
    return Promise.resolve([...new Set(courts)]);
  }
  clubIds(): Promise<string[]> {
    return Promise.resolve([this.court.clubId]);
  }
  createHold(hold: NewHold): Promise<StoredBooking> {
    const clash = this.rows.some(
      (r) =>
        r.courtId === hold.courtId &&
        ['held', 'confirmed'].includes(r.status) &&
        r.startsAt < hold.endsAt &&
        r.endsAt > hold.startsAt,
    );
    if (clash) return Promise.reject(new SlotTakenError());
    const booking = {
      id: hold.id,
      clubId: hold.clubId,
      courtId: hold.courtId,
      startsAt: hold.startsAt,
      endsAt: hold.endsAt,
      status: hold.holdExpiresAt ? 'held' : 'confirmed',
      priceCents: hold.priceCents,
      depositPaidCents: 0,
      origin: 'app',
      holdExpiresAt: hold.holdExpiresAt,
      createdByUserId: hold.userId,
      noRecord: false,
      createdAt: new Date(),
    } as Booking;
    this.rows.push(booking);
    return Promise.resolve({ booking, playerName: 'Ana' });
  }
  findForPlayer(_user: string, id: string): Promise<StoredBooking | null> {
    const booking = this.rows.find((r) => r.id === id);
    return Promise.resolve(booking ? { booking, playerName: 'Ana' } : null);
  }
}
