// Hour filter of the club search: a club matches when one of its courts has a free start inside
// that local hour.
import type { Schema } from '@app/contracts';

import { CLUB_TIMEZONE } from './find-slot';

/** Hours of the day a player can ask for. */
export const SEARCH_HOURS: readonly number[] = Array.from({ length: 16 }, (_, i) => i + 8);

/** Local hour (0-23) of an instant. */
export function localHour(iso: string, timeZone = CLUB_TIMEZONE): number {
  const h = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone }).format(
    new Date(iso),
  );
  return Number(h) % 24;
}

export function hasSlotInHour(slots: Schema<'AvailabilitySlot'>[], hour: number, tz?: string) {
  return slots.some((s) => localHour(s.starts_at, tz) === hour);
}

export const hourLabel = (hour: number) => `${String(hour).padStart(2, '0')}:00`;
