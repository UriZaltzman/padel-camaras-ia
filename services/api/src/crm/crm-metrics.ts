/** Windows and thresholds of the club CRM (CL-06). One place, no magic numbers elsewhere. */
export const CRM = {
  /** Frequency and recurrence look at this many weeks back. */
  windowWeeks: 8,
  /** `frequent`: played in at least this many of the weeks. */
  frequentMinActiveWeeks: 4,
  /** `dormant`: last visit older than this many days (or none). */
  dormantAfterDays: 30,
  /** `no_show`: at least this many no-shows. */
  noShowMin: 2,
  recentBookings: 20,
} as const;

export type ClubPlayerSegment = 'frequent' | 'dormant' | 'no_show';

export type CrmBookingStatus =
  'held' | 'confirmed' | 'completed' | 'cancelled' | 'no_show' | 'expired';

/** One booking a person took part in, as the metrics need it. */
export interface CrmBooking {
  id: string;
  startsAt: Date;
  endsAt: Date;
  status: CrmBookingStatus;
  /** 1 = whoever booked; only the booker is charged with a no-show. */
  position: number;
}

export interface CrmMetrics {
  bookingsPerMonth: number;
  activeWeeks: number;
  noShows: number;
  lastVisitAt: Date | null;
  segments: ClubPlayerSegment[];
}

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

/** A booking the person actually played: confirmed or completed, already over. */
function isVisit(b: CrmBooking, now: Date): boolean {
  return (b.status === 'confirmed' || b.status === 'completed') && b.endsAt <= now;
}

export function computeMetrics(bookings: readonly CrmBooking[], now: Date): CrmMetrics {
  const visits = bookings.filter((b) => isVisit(b, now));
  const windowStart = now.getTime() - CRM.windowWeeks * WEEK_MS;
  const inWindow = visits.filter((b) => b.startsAt.getTime() >= windowStart);
  // Week 0 is the last 7 days, week 7 the oldest one.
  const weeks = new Set(
    inWindow.map((b) => Math.floor((now.getTime() - b.startsAt.getTime()) / WEEK_MS)),
  );
  const lastVisit = visits.reduce<Date | null>(
    (last, b) => (last === null || b.startsAt > last ? b.startsAt : last),
    null,
  );
  const noShows = bookings.filter((b) => b.status === 'no_show' && b.position === 1).length;
  const bookingsPerMonth = Math.round(((inWindow.length * 30) / (CRM.windowWeeks * 7)) * 10) / 10;

  const segments: ClubPlayerSegment[] = [];
  if (weeks.size >= CRM.frequentMinActiveWeeks) segments.push('frequent');
  if (lastVisit === null || now.getTime() - lastVisit.getTime() > CRM.dormantAfterDays * DAY_MS) {
    segments.push('dormant');
  }
  if (noShows >= CRM.noShowMin) segments.push('no_show');

  return { bookingsPerMonth, activeWeeks: weeks.size, noShows, lastVisitAt: lastVisit, segments };
}
