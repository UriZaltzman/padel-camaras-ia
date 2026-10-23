import type { Schema } from '@app/contracts';

import type { ClubBookingsMockState } from './mock-club-bookings';

/**
 * Club side of the court-blocks mock (`/clubs/{id}/court-blocks`). Only reached through
 * `createMockFetch` when `NEXT_PUBLIC_API_MOCK` is on (never in production). The holiday list is a
 * small stand-in for the API's national calendar.
 */
export interface ClubBlocksMockState {
  blocks: Schema<'CourtBlock'>[];
}

export const newClubBlocksMockState = (): ClubBlocksMockState => ({ blocks: [] });

const MOCK_HOLIDAYS: Record<number, string[]> = {
  2026: ['2026-11-23', '2026-12-08', '2026-12-25'],
  2027: ['2027-01-01', '2027-03-24', '2027-04-02', '2027-05-01', '2027-05-25'],
};

const DAY_MS = 24 * 3600 * 1000;
type Reply = (status: number, body: unknown) => Response;

let counter = 0;
const newId = () =>
  `01928f6e-7c1a-7d4e-9b3a-${String(Date.now()).slice(-8)}${String(++counter).padStart(4, '0')}`;

export async function handleClubBlocksRequest(
  request: Request,
  state: ClubBlocksMockState,
  bookings: ClubBookingsMockState,
  clubId: string,
  courtIds: string[],
  reply: Reply,
): Promise<Response | null> {
  const url = new URL(request.url);
  const match = /^.*\/v1\/clubs\/([^/]+)\/court-blocks(?:\/([^/]+))?$/.exec(url.pathname);
  if (!match) return null;
  if (match[1] !== clubId) return reply(404, { code: 'NOT_FOUND', message: 'No existe.' });
  const tail = match[2];

  if (request.method === 'GET' && !tail) {
    const from = Date.parse(url.searchParams.get('from') ?? '');
    const to = Date.parse(url.searchParams.get('to') ?? '');
    return reply(
      200,
      state.blocks
        .filter((b) => Date.parse(b.starts_at) < to && Date.parse(b.ends_at) > from)
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at)),
    );
  }
  if (request.method === 'DELETE' && tail) {
    const index = state.blocks.findIndex((b) => b.id === tail);
    if (index < 0) return reply(404, { code: 'NOT_FOUND', message: 'No existe.' });
    state.blocks.splice(index, 1);
    return new Response(null, { status: 204 });
  }
  if (request.method !== 'POST') return null;

  type Spans = { courtId: string; start: number; end: number }[];
  let spans: Spans = [];
  let kind: Schema<'CourtBlockKind'> = 'closure';
  let reason: string | null = null;
  let policy: Schema<'BlockBookingsPolicy'> = 'abort';
  if (tail === 'holidays') {
    const body = (await request.json()) as Schema<'CourtBlockHolidayImport'>;
    const dates = body.dates ?? MOCK_HOLIDAYS[body.year] ?? [];
    if (dates.length === 0) {
      return reply(400, { code: 'VALIDATION_FAILED', message: 'Sin feriados.' });
    }
    kind = 'holiday';
    policy = body.existing_bookings_policy ?? 'abort';
    spans = dates.flatMap((d) =>
      body.court_ids.map((courtId) => {
        const start = Date.parse(`${d}T00:00:00-03:00`);
        return { courtId, start, end: start + DAY_MS };
      }),
    );
  } else if (!tail) {
    const body = (await request.json()) as Schema<'CourtBlockCreate'>;
    const start = Date.parse(body.starts_at);
    const length = Date.parse(body.ends_at) - start;
    if (!(length > 0)) return reply(400, { code: 'VALIDATION_FAILED', message: 'Rango inválido.' });
    kind = body.kind;
    reason = body.reason ?? null;
    policy = body.existing_bookings_policy ?? 'abort';
    const step = body.recurrence?.frequency === 'weekly' ? 7 * DAY_MS : DAY_MS;
    const until = body.recurrence ? Date.parse(`${body.recurrence.until}T23:59:59-03:00`) : start;
    for (let at = start; at <= until && spans.length < 53 * body.court_ids.length; at += step) {
      for (const courtId of body.court_ids) spans.push({ courtId, start: at, end: at + length });
    }
  } else {
    return null;
  }
  if (spans.some((s) => !courtIds.includes(s.courtId))) {
    return reply(404, { code: 'NOT_FOUND', message: 'No existe.' });
  }

  const hit = bookings.bookings.filter(
    (b) =>
      b.status === 'confirmed' &&
      spans.some(
        (s) =>
          s.courtId === b.court_id &&
          Date.parse(b.starts_at) < s.end &&
          Date.parse(b.ends_at) > s.start,
      ),
  );
  if (hit.length > 0 && policy !== 'cancel_and_refund') {
    return reply(409, {
      code: 'BOOKING_SLOT_TAKEN',
      message: 'Hay turnos en ese horario.',
      details: { conflicting_booking_ids: hit.map((b) => b.id) },
    });
  }
  for (const b of hit) b.status = 'cancelled';
  const seriesId = spans.length > 1 && tail !== 'holidays' ? newId() : null;
  const blocks = spans.map((s): Schema<'CourtBlock'> => ({
    id: newId(),
    court_id: s.courtId,
    starts_at: new Date(s.start).toISOString(),
    ends_at: new Date(s.end).toISOString(),
    kind,
    reason,
    series_id: seriesId,
  }));
  state.blocks.push(...blocks);
  const result: Schema<'CourtBlockResult'> = {
    blocks,
    cancelled_booking_ids: hit.map((b) => b.id),
    refunded_cents: hit.reduce((sum, b) => sum + b.deposit_paid_cents, 0),
    moved: [],
  };
  return reply(201, result);
}
