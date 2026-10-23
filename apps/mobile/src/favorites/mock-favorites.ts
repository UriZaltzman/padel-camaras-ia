// Dev and test mock of the favorites, home and booking endpoints of
// packages/contracts/openapi/openapi.yaml (GET/PUT/DELETE /me/favorite-clubs, GET /me/home,
// POST /bookings, POST /bookings/{id}/cancel). Plugged into the mock server of auth/mock-api.ts,
// so it is only reachable with EXPO_PUBLIC_API_MOCK=true in a dev build, never in release builds.
import type { Schema } from '@app/contracts';

import { mockClubs, handleBookingMock } from '../booking/mock-api';
import { CLUB_TIMEZONE } from '../booking/find-slot';

const MAX_FAVORITES = 10;
const HOME_SLOTS = 3;
const MOCK_PLAYER_ID = '01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a5f';

function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'X-Request-Id': 'mock' },
  });
}

function problem(status: number, code: Schema<'ErrorCode'>): Response {
  return json(status, { code, message: code });
}

export interface FavoritesMock {
  /** Answers a favorites, home or booking request, or null when `path` is not one. */
  handle(method: string, path: string, body: unknown): Promise<Response | null>;
}

export function createFavoritesMock(now: () => Date = () => new Date()): FavoritesMock {
  let favorites: string[] = [];
  let sequence = 0;
  const bookings: Schema<'Booking'>[] = [];

  const club = (id: string) => mockClubs.find((c) => c.id === id);
  const toFavorite = (id: string, position: number): Schema<'FavoriteClub'> => {
    const c = club(id) as Schema<'Club'>;
    return {
      club_id: c.id,
      name: c.name,
      address: c.address,
      logo_url: c.logo_url,
      position,
    };
  };
  const list = () => ({ items: favorites.map(toFavorite) });

  async function freeToday(clubId: string): Promise<Schema<'HomeFavorite'>['free_slots_today']> {
    const c = club(clubId);
    if (!c) return [];
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: CLUB_TIMEZONE }).format(now());
    const slots: Schema<'HomeFavorite'>['free_slots_today'] = [];
    for (const court of c.courts.filter((k) => k.status === 'active')) {
      const url = new URL(
        `http://mock/v1/courts/${court.id}/availability?date=${today}&duration_minutes=90`,
      );
      const res = handleBookingMock(url, `/courts/${court.id}/availability`, now());
      const body = (await res?.json()) as Schema<'CourtAvailability'> | undefined;
      for (const s of body?.slots ?? []) {
        slots.push({
          court_id: court.id,
          starts_at: s.starts_at,
          ends_at: s.ends_at,
          amount_cents: s.amount_cents,
        });
      }
    }
    const seen = new Set<string>();
    return slots
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
      .filter((s) => !seen.has(s.starts_at) && !!seen.add(s.starts_at))
      .slice(0, HOME_SLOTS);
  }

  async function home(): Promise<{ favorites: Schema<'HomeFavorite'>[] }> {
    const entries = await Promise.all(
      favorites.map(async (id, position) => ({
        club: toFavorite(id, position),
        next_bookings: bookings
          .filter((b) => b.club_id === id && b.status !== 'cancelled')
          .filter((b) => Date.parse(b.ends_at) > now().getTime())
          .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
          .slice(0, 3)
          .map((b) => {
            const court = club(id)?.courts.find((k) => k.id === b.court_id);
            return {
              id: b.id,
              court_id: b.court_id,
              court_name: court?.name ?? '',
              starts_at: b.starts_at,
              ends_at: b.ends_at,
              status: b.status as 'held' | 'confirmed',
            };
          }),
        free_slots_today: await freeToday(id),
      })),
    );
    return { favorites: entries };
  }

  function createBooking(body: Schema<'BookingCreate'>): Response {
    const found = mockClubs.find((c) => c.courts.some((k) => k.id === body.court_id));
    if (!found) return problem(404, 'NOT_FOUND');
    const startsAt = new Date(body.starts_at);
    const endsAt = new Date(startsAt.getTime() + body.duration_minutes * 60_000);
    if (startsAt.getTime() <= now().getTime()) return problem(422, 'BOOKING_SLOT_INVALID');
    const taken = bookings.some(
      (b) =>
        b.court_id === body.court_id &&
        b.status !== 'cancelled' &&
        Date.parse(b.starts_at) < endsAt.getTime() &&
        Date.parse(b.ends_at) > startsAt.getTime(),
    );
    if (taken) return problem(409, 'BOOKING_SLOT_TAKEN');
    sequence += 1;
    const price =
      body.duration_minutes === 60 ? 2000000 : body.duration_minutes === 90 ? 3000000 : 4000000;
    const booking = {
      id: `01928f6e-7c1a-7d4e-9b3a-2f6c8e1d5${String(sequence).padStart(3, '0')}`,
      club_id: found.id,
      court_id: body.court_id,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      duration_minutes: body.duration_minutes,
      status: 'confirmed',
      hold_expires_at: null,
      price_cents: price,
      deposit_cents: price * 0.3,
      deposit_paid_cents: price * 0.3,
      cancellation_refund_hours: 24,
      source: 'app',
      players: [
        {
          position: 1,
          user: { id: MOCK_PLAYER_ID, name: 'Sofía Pérez' },
          accepted: true,
          guardian_consent_on_file: false,
        },
      ],
      no_record: false,
      no_record_reason: null,
      series: null,
      created_at: now().toISOString(),
    } as Schema<'Booking'>;
    bookings.push(booking);
    return json(201, booking);
  }

  return {
    async handle(method, path, body) {
      if (path === '/me/favorite-clubs') {
        if (method === 'GET') return json(200, list());
        if (method === 'PUT') {
          const ids = (body as Schema<'FavoriteClubOrder'>).club_ids ?? [];
          const same =
            ids.length === favorites.length &&
            new Set(ids).size === ids.length &&
            ids.every((id) => favorites.includes(id));
          if (!same) return problem(400, 'VALIDATION_FAILED');
          favorites = [...ids];
          return json(200, list());
        }
      }
      const one = /^\/me\/favorite-clubs\/([^/]+)$/.exec(path);
      if (one) {
        const id = one[1] ?? '';
        if (method === 'PUT') {
          if (!club(id)) return problem(404, 'NOT_FOUND');
          if (!favorites.includes(id)) {
            if (favorites.length >= MAX_FAVORITES) return problem(400, 'VALIDATION_FAILED');
            favorites.push(id);
          }
          return json(200, list());
        }
        if (method === 'DELETE') {
          favorites = favorites.filter((f) => f !== id);
          return json(204);
        }
      }
      if (path === '/me/home' && method === 'GET') return json(200, await home());
      if (path === '/bookings' && method === 'POST') {
        return createBooking(body as Schema<'BookingCreate'>);
      }
      const cancel = /^\/bookings\/([^/]+)\/cancel$/.exec(path);
      if (cancel && method === 'POST') {
        const booking = bookings.find((b) => b.id === cancel[1]);
        if (!booking) return problem(404, 'NOT_FOUND');
        booking.status = 'cancelled';
        return json(200, {
          booking_id: booking.id,
          status: 'cancelled',
          cancelled_at: now().toISOString(),
          refund_cents: 0,
          refund_status: 'none',
          cancelled_booking_ids: [booking.id],
        });
      }
      return null;
    },
  };
}
