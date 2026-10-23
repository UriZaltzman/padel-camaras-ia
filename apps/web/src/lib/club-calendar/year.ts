import type { Schema } from '@app/contracts';

import { addDays, localMidnight } from './model';

/** Pure helpers of the 365-day calendar (screen CL-04). Dates are `YYYY-MM-DD` in club time. */
const DAY_MS = 24 * 3600 * 1000;
const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });

export const HEAT_LEVELS = 5;

export const pad = (n: number) => String(n).padStart(2, '0');

export function monthStart(year: number, month: number): string {
  return `${year}-${pad(month + 1)}-01`;
}

/** Days of `month` (0-based) as dates, in order. */
export function monthDates(year: number, month: number): string[] {
  const first = monthStart(year, month);
  const count = Math.round(
    (localMidnight(monthStart(month === 11 ? year + 1 : year, (month + 1) % 12)).getTime() -
      localMidnight(first).getTime()) /
      DAY_MS,
  );
  return Array.from({ length: count }, (_unused, i) => addDays(first, i));
}

/** Empty cells before the 1st so weeks start on Monday. */
export function leadingBlanks(year: number, month: number): number {
  const day = localMidnight(monthStart(year, month)).getUTCDay();
  return (day + 6) % 7;
}

export function dateOf(iso: string): string {
  return localDate.format(new Date(iso));
}

/** Local dates touched by `[startsAt, endsAt)`. */
export function datesTouched(startsAt: string, endsAt: string): string[] {
  const first = dateOf(startsAt);
  const last = dateOf(new Date(Date.parse(endsAt) - 1).toISOString());
  const dates: string[] = [];
  for (let d = first; d <= last && dates.length < 400; d = addDays(d, 1)) dates.push(d);
  return dates;
}

export function blocksByDay(blocks: Schema<'CourtBlock'>[]): Map<string, Schema<'CourtBlock'>[]> {
  const byDay = new Map<string, Schema<'CourtBlock'>[]>();
  for (const block of blocks) {
    for (const date of datesTouched(block.starts_at, block.ends_at)) {
      byDay.set(date, [...(byDay.get(date) ?? []), block]);
    }
  }
  return byDay;
}

/** Minutes booked per local day (a turn crossing midnight counts on both days). */
export function bookedMinutesByDay(bookings: Schema<'ClubBooking'>[]): Map<string, number> {
  const minutes = new Map<string, number>();
  for (const b of bookings) {
    if (b.status === 'cancelled' || b.status === 'expired') continue;
    const start = Date.parse(b.starts_at);
    const end = Date.parse(b.ends_at);
    for (const date of datesTouched(b.starts_at, b.ends_at)) {
      const from = Math.max(start, localMidnight(date).getTime());
      const to = Math.min(end, localMidnight(addDays(date, 1)).getTime());
      minutes.set(date, (minutes.get(date) ?? 0) + Math.max(0, to - from) / 60000);
    }
  }
  return minutes;
}

/** Share of the day's capacity that is booked, 0..1. */
export function occupancy(bookedMinutes: number, courts: number, hours: number): number {
  const capacity = courts * hours * 60;
  return capacity > 0 ? Math.min(1, bookedMinutes / capacity) : 0;
}

/** 0 (free) to 4 (full). */
export function heatLevel(ratio: number): number {
  if (ratio <= 0) return 0;
  return Math.min(HEAT_LEVELS - 1, Math.ceil(ratio * (HEAT_LEVELS - 1)));
}

/** Dates between two picks, whichever comes first. */
export function orderedRange(a: string, b: string): { from: string; to: string } {
  return a <= b ? { from: a, to: b } : { from: b, to: a };
}

/** ISO instant of a local date and `HH:MM` (`24:00` is the midnight that ends the day). */
export function localInstant(date: string, time: string): string {
  const [day, clock] = time === '24:00' ? [addDays(date, 1), '00:00'] : [date, time];
  return new Date(`${day}T${clock}:00-03:00`).toISOString();
}
