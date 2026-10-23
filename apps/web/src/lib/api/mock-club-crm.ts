import type { Schema } from '@app/contracts';

/**
 * Club side of the CRM mock: `/club-admin/players` (+ `/{id}`, `/{id}/notes`). Only reached
 * through `createMockFetch` when `NEXT_PUBLIC_API_MOCK` is on (never in production). Segments are
 * stored on the seed rows; filters and search behave like the contract.
 */
export interface ClubCrmMockState {
  clubId: string;
  players: Schema<'ClubPlayerDetail'>[];
}

const day = 24 * 3600 * 1000;

export function newClubCrmMockState(
  clubId: string,
  now: () => Date = () => new Date(),
): ClubCrmMockState {
  const ago = (days: number) => new Date(now().getTime() - days * day).toISOString();
  const visit = (n: number, days: number, status: Schema<'BookingStatus'>) => ({
    booking_id: `01928f6e-7c1a-7d4e-9b3a-2f6c8e1d${String(7000 + n)}`,
    starts_at: ago(days),
    court_name: 'Cancha 1',
    status,
    price_cents: 2_400_000,
  });
  const base = {
    email: null,
    weeks_window: 8 as const,
    tags: [] as string[],
    notes: null as string | null,
  };
  const player = (
    n: number,
    name: string,
    phone: string | null,
    rest: Partial<Schema<'ClubPlayerDetail'>>,
  ): Schema<'ClubPlayerDetail'> => ({
    ...base,
    user_id: `01928f6e-7c1a-7d4e-9b3a-2f6c8e1d${String(6000 + n)}`,
    name,
    phone,
    bookings_per_month: 0,
    active_weeks: 0,
    no_shows: 0,
    last_visit_at: null,
    total_spend_cents: 0,
    segments: [],
    recent_bookings: [],
    ...rest,
  });
  return {
    clubId,
    players: [
      player(1, 'Ana Torres', '+5491155550101', {
        bookings_per_month: 8.5,
        active_weeks: 7,
        last_visit_at: ago(2),
        total_spend_cents: 21_600_000,
        segments: ['frequent'],
        tags: ['zurdo'],
        recent_bookings: [visit(1, 2, 'completed'), visit(2, 9, 'completed')],
      }),
      player(2, 'Bruno Páez', '+5491155550102', {
        bookings_per_month: 0.5,
        active_weeks: 1,
        last_visit_at: ago(60),
        total_spend_cents: 4_800_000,
        segments: ['dormant'],
        recent_bookings: [visit(3, 60, 'completed')],
      }),
      player(3, 'Carla Ríos', '+5491155550103', {
        bookings_per_month: 1.2,
        active_weeks: 2,
        no_shows: 3,
        last_visit_at: ago(10),
        total_spend_cents: 7_200_000,
        segments: ['no_show'],
        notes: 'Avisar siempre por WhatsApp.',
        recent_bookings: [visit(4, 10, 'no_show'), visit(5, 17, 'no_show')],
      }),
      player(4, 'Dante Gil', null, {
        last_visit_at: ago(45),
        segments: ['dormant'],
      }),
    ],
  };
}

type Reply = (status: number, body: unknown) => Response;

export async function handleClubCrmRequest(
  request: Request,
  state: ClubCrmMockState,
  reply: Reply,
): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^.*\/v1/, '');
  const m = /^\/club-admin\/players(?:\/([^/]+)(\/notes)?)?$/.exec(path);
  if (!m) return null;
  const fail = (status: number, code: Schema<'ErrorCode'>, message: string) =>
    reply(status, { code, message } satisfies Schema<'Error'>);
  if (url.searchParams.get('club_id') !== state.clubId) return fail(404, 'NOT_FOUND', 'club');

  const strip = ({ recent_bookings: _r, ...p }: Schema<'ClubPlayerDetail'>) => p;
  if (!m[1] && request.method === 'GET') {
    const q = url.searchParams.get('q')?.toLowerCase();
    const segment = url.searchParams.get('segment');
    const tag = url.searchParams.get('tag');
    const items = state.players
      .filter((p) => !q || p.name.toLowerCase().includes(q) || (p.phone ?? '').includes(q))
      .filter((p) => !segment || p.segments.includes(segment as Schema<'ClubPlayerSegment'>))
      .filter((p) => !tag || p.tags.includes(tag))
      .map(strip);
    return reply(200, { items, next_cursor: null });
  }
  const found = state.players.find((p) => p.user_id === m[1]);
  if (!found) return fail(404, 'NOT_FOUND', 'player');
  if (!m[2] && request.method === 'GET') return reply(200, found);
  if (m[2] && request.method === 'PUT') {
    const body = (await request.json()) as Schema<'ClubPlayerNotesUpdate'>;
    if (!Array.isArray(body.tags) || body.tags.length > 10) {
      return fail(400, 'VALIDATION_FAILED', 'tags');
    }
    found.tags = body.tags;
    found.notes = body.notes;
    return reply(200, found);
  }
  return null;
}
