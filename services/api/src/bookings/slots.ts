import type { BookingRule, Weekday } from '../clubs/club-model';
import { WEEKDAYS } from '../clubs/club-model';

export interface Interval {
  start: Date;
  end: Date;
}

export interface Slot extends Interval {
  amountCents: number;
  depositCents: number;
}

export interface SlotInput {
  rules: BookingRule[];
  /** Local day, `YYYY-MM-DD`, in `timezone`. */
  date: string;
  timezone: string;
  durationMinutes: number;
  deposit:
    | { type: 'none' }
    | { type: 'percent'; percent: number }
    | { type: 'fixed'; amount_cents: number };
  /** Intervals that keep the court busy (active holds, bookings, blocks). */
  occupied: Interval[];
  now: Date;
  minNoticeMinutes: number;
  /** Days starting after today (local) + `horizonDays` offer nothing. */
  horizonDays: number;
  /**
   * Local minutes after midnight at which the farthest day opens (§3.2); before that moment
   * the window is one day shorter. Omitted = the farthest day is open all day.
   */
  windowOpensAtMinutes?: number | null;
}

/** Adds whole days to a `YYYY-MM-DD` date. */
export function addDays(date: string, days: number): string {
  const [y = 0, m = 1, d = 1] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Last local day bookable with this horizon, given the optional daily opening time. */
export function lastBookableDate(
  now: Date,
  timezone: string,
  horizonDays: number,
  windowOpensAtMinutes?: number | null,
): string {
  const today = localDate(now, timezone);
  const sinceMidnight = (now.getTime() - localToUtc(today, 0, timezone).getTime()) / MINUTE;
  const opened =
    windowOpensAtMinutes === null ||
    windowOpensAtMinutes === undefined ||
    sinceMidnight >= windowOpensAtMinutes;
  return addDays(today, opened ? horizonDays : horizonDays - 1);
}

const MINUTE = 60_000;

function offsetMinutes(instant: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / MINUTE);
}

/** The UTC instant of `minutes` after local midnight of `date` in `timezone` (may exceed 1440). */
export function localToUtc(date: string, minutes: number, timezone: string): Date {
  const [y = 0, m = 1, d = 1] = date.split('-').map(Number);
  const naive = Date.UTC(y, m - 1, d) + minutes * MINUTE;
  let guess = naive - offsetMinutes(new Date(naive), timezone) * MINUTE;
  guess = naive - offsetMinutes(new Date(guess), timezone) * MINUTE;
  return new Date(guess);
}

/** The local day (`YYYY-MM-DD`) an instant falls on in `timezone`. */
export function localDate(instant: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function weekdayOf(date: string): Weekday {
  const [y = 0, m = 1, d = 1] = date.split('-').map(Number);
  const jsDay = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return WEEKDAYS[(jsDay + 6) % 7] as Weekday;
}

const toMinutes = (hhmm: string): number => {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

function priceOf(rule: BookingRule, startMinutes: number, duration: number): number | null {
  const bands = [...rule.price_bands].sort(
    (a, b) => toMinutes(a.starts_at) - toMinutes(b.starts_at),
  );
  // A start after midnight (closing past 24:00) takes the last band of the day.
  const band =
    bands.find(
      (b) => startMinutes >= toMinutes(b.starts_at) && startMinutes < toMinutes(b.ends_at),
    ) ?? (startMinutes >= 1440 ? bands[bands.length - 1] : undefined);
  return band?.prices.find((p) => p.duration_minutes === duration)?.amount_cents ?? null;
}

export function depositFor(deposit: SlotInput['deposit'], amountCents: number): number {
  if (deposit.type === 'percent') return Math.round((amountCents * deposit.percent) / 100);
  if (deposit.type === 'fixed') return Math.min(deposit.amount_cents, amountCents);
  return 0;
}

/**
 * Every start of the local day `date` the court can offer for `durationMinutes`: opening hours
 * of the rules of that weekday, minus occupied intervals, clipped to the booking window.
 * Pure: the caller supplies the occupancy and the clock.
 */
export function generateSlots(input: SlotInput): Slot[] {
  const weekday = weekdayOf(input.date);
  const earliest = input.now.getTime() + input.minNoticeMinutes * MINUTE;
  const lastDate = lastBookableDate(
    input.now,
    input.timezone,
    input.horizonDays,
    input.windowOpensAtMinutes,
  );
  if (input.date > lastDate) return [];
  const byStart = new Map<number, Slot>();

  for (const rule of input.rules) {
    if (!rule.days.includes(weekday)) continue;
    if (!rule.allowed_durations.includes(input.durationMinutes as 60 | 90 | 120)) continue;
    const opens = toMinutes(rule.opens_at);
    let closes = toMinutes(rule.closes_at);
    if (closes <= opens) closes += 1440; // closes after midnight
    for (
      let start = opens;
      start + input.durationMinutes <= closes;
      start += rule.start_interval_minutes
    ) {
      const amountCents = priceOf(rule, start, input.durationMinutes);
      if (amountCents === null) continue;
      const startAt = localToUtc(input.date, start, input.timezone);
      const endAt = localToUtc(input.date, start + input.durationMinutes, input.timezone);
      const t = startAt.getTime();
      if (t < earliest) continue;
      if (input.occupied.some((o) => t < o.end.getTime() && endAt.getTime() > o.start.getTime()))
        continue;
      if (!byStart.has(t)) {
        byStart.set(t, {
          start: startAt,
          end: endAt,
          amountCents,
          depositCents: depositFor(input.deposit, amountCents),
        });
      }
    }
  }
  return [...byStart.values()].sort((a, b) => a.start.getTime() - b.start.getTime());
}
