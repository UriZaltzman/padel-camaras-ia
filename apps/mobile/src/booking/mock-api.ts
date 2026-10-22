// In-memory mock of the public club and availability endpoints of
// packages/contracts/openapi/openapi.yaml (GET /clubs, GET /clubs/{id},
// GET /courts/{id}/availability), plugged into the dev/test mock server of auth/mock-api.ts.
// Only reachable when EXPO_PUBLIC_API_MOCK=true in a dev build, never in release builds.
import type { Schema } from '@app/contracts';

import { CLUB_TIMEZONE, type BookingDuration } from './find-slot';

/** The only court of Club Demo Quilmes: no free start from 18:00. */
const FULL_EVENING_COURT = '01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a91';
const DEMO_CLUB_ID = '01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a60';

function court(id: string, name: string, status: Schema<'CourtStatus'>): Schema<'Court'> {
  return {
    id,
    name,
    covered: true,
    status,
    booking: {
      rules: [
        {
          days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
          opens_at: '08:00',
          closes_at: '24:00',
          allowed_durations: [60, 90, 120],
          start_interval_minutes: 30,
          price_bands: [
            {
              starts_at: '08:00',
              ends_at: '24:00',
              prices: [
                { duration_minutes: 60, amount_cents: 2000000 },
                { duration_minutes: 90, amount_cents: 3000000 },
                { duration_minutes: 120, amount_cents: 4000000 },
              ],
            },
          ],
        },
      ],
      deposit: { type: 'percent', percent: 30 },
      cancellation_refund_hours: 24,
    },
  } as Schema<'Court'>;
}

export const mockClubs: Schema<'Club'>[] = [
  {
    id: DEMO_CLUB_ID,
    name: 'Club Demo Palermo',
    address: 'Av. Santa Fe 4000',
    city: 'CABA',
    timezone: CLUB_TIMEZONE,
    logo_url: null,
    sponsor_name: null,
    plan: 'loan',
    courts: [
      court('01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a61', 'Cancha 1', 'active'),
      court('01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a62', 'Cancha 2', 'active'),
      court('01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a63', 'Cancha 3', 'maintenance'),
    ],
    charges: {
      player_extra: { enabled: false, amount_cents: null },
      coach_plan: { type: 'coach_monthly', monthly_fee_cents: 2500000 },
      lesson_payments_enabled: true,
    },
  } as Schema<'Club'>,
  {
    id: '01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a90',
    name: 'Club Demo Quilmes',
    address: 'Av. Calchaquí 1200',
    city: 'Quilmes',
    timezone: CLUB_TIMEZONE,
    logo_url: null,
    sponsor_name: null,
    plan: 'loan',
    courts: [court(FULL_EVENING_COURT, 'Cancha 1', 'active')],
    charges: {
      player_extra: { enabled: false, amount_cents: null },
      coach_plan: { type: 'coach_monthly', monthly_fee_cents: 2500000 },
      lesson_payments_enabled: true,
    },
  } as Schema<'Club'>,
];

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'X-Request-Id': 'mock' },
  });
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function summary(club: Schema<'Club'>): Schema<'ClubSummary'> {
  const { id, name, address, city, logo_url } = club;
  return { id, name, address, city, logo_url, courts_count: club.courts.length };
}

/** Buenos Aires is UTC-3 all year: local `HH:MM` of `date` to an ISO instant. */
function instant(date: string, minutes: number): string {
  return new Date(Date.parse(`${date}T00:00:00-03:00`) + minutes * 60_000).toISOString();
}

/** Free slots of a court: every 30 minutes from 08:00, minus a fake "taken" pattern. */
function availability(
  courtId: string,
  date: string,
  duration: BookingDuration,
  now: Date,
): Schema<'CourtAvailability'> {
  const slots: Schema<'AvailabilitySlot'>[] = [];
  const amount = duration === 60 ? 2000000 : duration === 90 ? 3000000 : 4000000;
  for (let start = 8 * 60; start + duration <= 24 * 60; start += 30) {
    const startsAt = instant(date, start);
    if (Date.parse(startsAt) <= now.getTime()) continue;
    if (start < 18 * 60 && (start / 30) % 3 === 1) continue; // some starts are already booked
    if (courtId === FULL_EVENING_COURT && start >= 18 * 60) continue; // booked every evening
    slots.push({
      starts_at: startsAt,
      ends_at: instant(date, start + duration),
      amount_cents: amount,
      deposit_cents: amount * 0.3,
    });
  }
  return { court_id: courtId, date, timezone: CLUB_TIMEZONE, duration_minutes: duration, slots };
}

/** Answers a public club or availability request, or null when `url` is not one. */
export function handleBookingMock(url: URL, path: string, now = new Date()): Response | null {
  if (path === '/clubs') {
    const q = url.searchParams.get('q');
    const items = mockClubs
      .filter((c) => !q || fold(`${c.name} ${c.city}`).includes(fold(q)))
      .map(summary);
    return json(200, { items, next_cursor: null });
  }
  const club = /^\/clubs\/([^/]+)$/.exec(path);
  if (club) {
    const found = mockClubs.find((c) => c.id === club[1]);
    return found ? json(200, found) : json(404, { code: 'NOT_FOUND', message: 'NOT_FOUND' });
  }
  const courtMatch = /^\/courts\/([^/]+)\/availability$/.exec(path);
  if (courtMatch) {
    const courtId = courtMatch[1] ?? '';
    const found = mockClubs.flatMap((c) => c.courts).find((c) => c.id === courtId);
    if (!found) return json(404, { code: 'NOT_FOUND', message: 'NOT_FOUND' });
    const date = url.searchParams.get('date') ?? '';
    const duration = Number(url.searchParams.get('duration_minutes')) as BookingDuration;
    if (found.status !== 'active') {
      return json(200, { ...availability(courtId, date, duration, now), slots: [] });
    }
    return json(200, availability(courtId, date, duration, now));
  }
  return null;
}
