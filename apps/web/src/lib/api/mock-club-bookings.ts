import type { Schema } from '@app/contracts';

/**
 * Club side of the booking mock: `GET /club-admin/bookings` and `POST /bookings/{id}/cancel`.
 * Only reached through `createMockFetch` when `NEXT_PUBLIC_API_MOCK` is on (never in production).
 * Seeds a few turns around today (Buenos Aires, UTC-3) so the calendar is not empty in dev.
 */
export interface ClubBookingsMockState {
  bookings: Schema<'ClubBooking'>[];
}

const HOUR_MS = 3600 * 1000;

export function newClubBookingsMockState(
  club: Schema<'Club'>,
  now: () => Date = () => new Date(),
): ClubBookingsMockState {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: club.timezone }).format(now());
  const midnight = new Date(`${today}T00:00:00-03:00`).getTime();
  const court = club.courts[0];
  const other = club.courts[1];
  if (!court || !other) return { bookings: [] };
  const make = (
    n: number,
    courtId: string,
    courtName: string,
    startHour: number,
    minutes: 60 | 90 | 120,
    price: number,
    paid: number,
    source: 'app' | 'panel',
    name: string,
  ): Schema<'ClubBooking'> => ({
    id: `01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4b${String(n).padStart(2, '0')}`,
    club_id: club.id,
    court_id: courtId,
    court_name: courtName,
    starts_at: new Date(midnight + startHour * HOUR_MS).toISOString(),
    ends_at: new Date(midnight + startHour * HOUR_MS + minutes * 60000).toISOString(),
    duration_minutes: minutes,
    status: 'confirmed',
    hold_expires_at: null,
    price_cents: price,
    deposit_cents: Math.round(price * 0.3),
    deposit_paid_cents: paid,
    cancellation_refund_hours: 24,
    source,
    players: [],
    no_record: false,
    no_record_reason: null,
    series: null,
    created_at: new Date(midnight - HOUR_MS).toISOString(),
    match_id: null,
    booker: {
      user_id: `01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4c${String(n).padStart(2, '0')}`,
      name,
      phone: '+5491155550100',
      account_pending: false,
    },
  });
  return {
    bookings: [
      make(1, court.id, court.name, 18, 90, 3_000_000, 900_000, 'app', 'Lucía Pérez'),
      make(2, court.id, court.name, 20, 60, 2_000_000, 2_000_000, 'app', 'Marcos Gil'),
      make(3, other.id, other.name, 19, 120, 4_000_000, 0, 'panel', 'Diego Ruiz'),
      make(4, court.id, court.name, 18 + 24, 90, 3_000_000, 900_000, 'app', 'Sofía Díaz'),
    ],
  };
}

type Reply = (status: number, body: unknown) => Response;

/** Answers a club booking operation, or returns null when the request is not one of them. */
export async function handleClubBookingsRequest(
  request: Request,
  state: ClubBookingsMockState,
  reply: Reply,
): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^.*\/v1/, '');
  if (request.method === 'GET' && path === '/club-admin/bookings') {
    const from = Date.parse(url.searchParams.get('from') ?? '');
    const to = Date.parse(url.searchParams.get('to') ?? '');
    const items = state.bookings
      .filter((b) => Date.parse(b.starts_at) >= from && Date.parse(b.starts_at) < to)
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    const page: Schema<'ClubBookingPage'> = {
      items,
      next_cursor: null,
    } as Schema<'ClubBookingPage'>;
    return reply(200, page);
  }
  const cancel = /^\/bookings\/([^/]+)\/cancel$/.exec(path);
  if (request.method === 'POST' && cancel) {
    const booking = state.bookings.find((b) => b.id === cancel[1]);
    // Not a seeded club turn: the player mock owns it.
    if (!booking) return null;
    booking.status = 'cancelled';
    const body: Schema<'BookingCancellation'> = {
      booking_id: booking.id,
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      refund_cents: 0,
      refund_status: 'none',
      cancelled_booking_ids: [booking.id],
    } as Schema<'BookingCancellation'>;
    return reply(200, body);
  }
  return null;
}
