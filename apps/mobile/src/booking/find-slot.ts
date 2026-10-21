// Pure helpers of the "find a club and a free slot" flow: the days a player may book, and how
// slot times and prices read on screen.
import type { Schema } from '@app/contracts';

export type BookingDuration = Schema<'BookingDuration'>;

export const DURATIONS: readonly BookingDuration[] = [60, 90, 120];

/**
 * Days ahead a player may book (issue #255). The API is the source of truth and will make this
 * configurable per club (1 to 14); until the contract exposes it, the app shows at most 14.
 */
export const PLAYER_HORIZON_DAYS = 14;

export const CLUB_TIMEZONE = 'America/Argentina/Buenos_Aires';

const DAY_MS = 24 * 60 * 60 * 1000;

/** `YYYY-MM-DD` of `date` in `timeZone`. */
export function localDate(date: Date, timeZone = CLUB_TIMEZONE): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * The local days a player can pick: today plus the next `horizonDays` days, never more than
 * PLAYER_HORIZON_DAYS. Uses noon UTC of each day so daylight changes never skip or repeat one.
 */
export function bookableDates(
  now: Date,
  horizonDays = PLAYER_HORIZON_DAYS,
  timeZone = CLUB_TIMEZONE,
): string[] {
  const days = Math.max(0, Math.min(horizonDays, PLAYER_HORIZON_DAYS));
  const today = localDate(now, timeZone);
  const base = Date.parse(`${today}T12:00:00Z`);
  return Array.from({ length: days + 1 }, (_, i) =>
    new Date(base + i * DAY_MS).toISOString().slice(0, 10),
  );
}

/** Short label of a local day, for example "vie 23". */
export function formatDay(date: string, locale = 'es-AR'): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`));
}

/** Local start time of a slot, `HH:MM`. */
export function formatTime(iso: string, timeZone = CLUB_TIMEZONE, locale = 'es-AR'): string {
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
  }).format(new Date(iso));
}

/** Whole pesos from cents, for example 2400000 → "$ 24.000". */
export function formatPrice(amountCents: number, locale = 'es-AR'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(amountCents / 100);
}

/** Courts a player can book now. */
export function bookableCourts(club: Schema<'Club'>): Schema<'Court'>[] {
  return club.courts.filter((court) => court.status === 'active');
}

export class BookingApiError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

const KNOWN_CODES = ['NOT_FOUND', 'RATE_LIMITED'];

/** i18n key for an API or network error. */
export function errorKey(err: unknown): string {
  if (err instanceof BookingApiError) {
    return KNOWN_CODES.includes(err.code)
      ? `findSlot.errors.${err.code}`
      : 'findSlot.errors.generic';
  }
  return 'findSlot.errors.network';
}
