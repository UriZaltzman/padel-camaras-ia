/** Booking window rules (spec §9, §3.2). Only here: no number lives in the services. */
export const HOLD_MINUTES = 10;
export const AVAILABILITY_CACHE_SECONDS = 30;
/** A player books at least this long before the start. */
export const MIN_NOTICE_MINUTES = 30;
export const PLAYER_HORIZON_MIN_DAYS = 1;
export const PLAYER_HORIZON_MAX_DAYS = 14;
export const PLAYER_HORIZON_DEFAULT_DAYS = 14;
export const STAFF_HORIZON_MAX_DAYS = 365;
/** Statuses that keep a court busy; mirrors the exclusion constraint (#39). */
export const OCCUPYING_STATUSES = ['held', 'confirmed', 'completed', 'no_show'] as const;

/** Clamps a club's configured player horizon to 1..14 days (default 14). */
export function playerHorizonDays(configured?: number | null): number {
  if (configured === undefined || configured === null || !Number.isFinite(configured)) {
    return PLAYER_HORIZON_DEFAULT_DAYS;
  }
  return Math.min(
    PLAYER_HORIZON_MAX_DAYS,
    Math.max(PLAYER_HORIZON_MIN_DAYS, Math.trunc(configured)),
  );
}
