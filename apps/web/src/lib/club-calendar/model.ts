import type { Schema } from '@app/contracts';

/**
 * Pure helpers of the booking calendar (screen CL-03). The club time zone is
 * America/Argentina/Buenos_Aires, which has no daylight saving, so local midnight is 03:00 UTC.
 */
const AR_OFFSET = '-03:00';
const DAY_MS = 24 * 3600 * 1000;
const WEEKDAYS: Schema<'Weekday'>[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export type CalendarView = 'day' | 'week';

/** `blocked` comes from the court status; class and tournament turns are not in the contract yet. */
export type SlotState = 'deposit' | 'paid' | 'manual' | 'blocked';

export const SLOT_STATES: SlotState[] = ['deposit', 'paid', 'manual', 'blocked'];

export function localMidnight(date: string): Date {
  return new Date(`${date}T00:00:00${AR_OFFSET}`);
}

export function addDays(date: string, days: number): string {
  const moved = new Date(localMidnight(date).getTime() + days * DAY_MS);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(
    moved,
  );
}

/** Monday of the week that holds `date`. */
export function weekStart(date: string): string {
  const day = localMidnight(date).getUTCDay(); // 03:00 UTC is still the same local day
  return addDays(date, -((day + 6) % 7));
}

/** Range `[from, to)` the API is asked for, in ISO UTC. */
export function visibleRange(date: string, view: CalendarView): { from: string; to: string } {
  const first = view === 'day' ? date : weekStart(date);
  const last = addDays(first, view === 'day' ? 1 : 7);
  return { from: localMidnight(first).toISOString(), to: localMidnight(last).toISOString() };
}

export function weekdayOf(date: string): Schema<'Weekday'> {
  return WEEKDAYS[localMidnight(date).getUTCDay()] ?? 'mon';
}

/** What a booking looks like on the grid. Cancelled, expired and no-show turns free the slot. */
export function bookingState(booking: Schema<'ClubBooking'>): SlotState | null {
  if (booking.status === 'cancelled' || booking.status === 'expired') return null;
  if (booking.source === 'panel') return 'manual';
  if (booking.deposit_paid_cents >= booking.price_cents && booking.price_cents > 0) return 'paid';
  return 'deposit';
}

/** Hours shown: the widest opening window of the club's rules, 08:00–24:00 when it has none. */
export function hourRange(courts: Schema<'Court'>[]): { start: number; end: number } {
  let start = 24;
  let end = 0;
  for (const court of courts) {
    for (const rule of court.booking.rules) {
      start = Math.min(start, Number(rule.opens_at.slice(0, 2)));
      end = Math.max(end, rule.closes_at === '24:00' ? 24 : Number(rule.closes_at.slice(0, 2)));
    }
  }
  return end > start ? { start, end } : { start: 8, end: 24 };
}

/** Minutes after local midnight of `date`, clamped to the day. */
export function minutesIntoDay(iso: string, date: string): number {
  const minutes = (new Date(iso).getTime() - localMidnight(date).getTime()) / 60000;
  return Math.max(0, Math.min(24 * 60, minutes));
}

export function weekDates(date: string): string[] {
  const first = weekStart(date);
  return Array.from({ length: 7 }, (_unused, i) => addDays(first, i));
}

/** Keeps the bookings that overlap `date` on `courtId` (any court when omitted). */
export function bookingsOn(
  bookings: Schema<'ClubBooking'>[],
  date: string,
  courtId?: string,
): Schema<'ClubBooking'>[] {
  const start = localMidnight(date).getTime();
  const end = start + DAY_MS;
  return bookings.filter(
    (b) =>
      (courtId === undefined || b.court_id === courtId) &&
      bookingState(b) !== null &&
      new Date(b.starts_at).getTime() < end &&
      new Date(b.ends_at).getTime() > start,
  );
}
