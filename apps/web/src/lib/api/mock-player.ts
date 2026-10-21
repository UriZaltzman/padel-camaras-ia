import type { Schema } from '@app/contracts';

import { t } from '@/i18n';

/**
 * Player side of the API mock (auth, profile, clubs, availability and bookings), only reached
 * through `createMockFetch` when `NEXT_PUBLIC_API_MOCK` is on (never in production builds).
 *
 * Test data: any phone works and the WhatsApp code is always `MOCK_OTP_CODE`; access tokens are
 * `mock_<user id>`. The club follows the contract's time zone, America/Argentina/Buenos_Aires,
 * which has no daylight saving, so local times are UTC-3.
 */
export const MOCK_OTP_CODE = '123456';
const AR_OFFSET = '-03:00';
const HOLD_MINUTES = 10;
const WEEKDAYS: Schema<'Weekday'>[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

type Reply = (status: number, body: unknown) => Response;

export interface PlayerMockState {
  usersByPhone: Map<string, Schema<'User'>>;
  bookings: Schema<'Booking'>[];
  invites: Map<string, Schema<'BookingInvite'>>;
  now: () => Date;
}

export function newPlayerMockState(now: () => Date = () => new Date()): PlayerMockState {
  return { usersByPhone: new Map(), bookings: [], invites: new Map(), now };
}

/** Answers a player operation, or returns null when the request is not one of them. */
export async function handlePlayerRequest(
  request: Request,
  state: PlayerMockState,
  getClub: () => Schema<'Club'>,
  json: Reply,
): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^.*\/v1/, '');
  const method = request.method;
  const err = (status: number, code: Schema<'ErrorCode'>, message = t('api.notFound')) =>
    json(status, { code, message } satisfies Schema<'Error'>);

  if (path === '/auth/otp/whatsapp' && method === 'POST') {
    const body = (await request.json()) as Schema<'OtpRequest'>;
    if (!/^\+[1-9][0-9]{7,14}$/.test(body.phone ?? '')) return err(400, 'VALIDATION_FAILED');
    return json(202, { expires_in_seconds: 300, resend_after_seconds: 60 });
  }

  if (path === '/auth/otp/verify' && method === 'POST') {
    const body = (await request.json()) as Schema<'OtpVerifyRequest'>;
    if (body.code !== MOCK_OTP_CODE) return err(401, 'OTP_INVALID');
    let user = state.usersByPhone.get(body.phone);
    const isNew = !user;
    if (!user) {
      if (!body.consent) return err(403, 'TERMS_NOT_ACCEPTED');
      const at = state.now().toISOString();
      user = {
        id: crypto.randomUUID(),
        display_name: body.phone,
        phone: body.phone,
        email: null,
        photo_url: null,
        declared_category: null,
        dominant_hand: null,
        playing_side: null,
        birth_date: null,
        training_opt_out: false,
        terms_version: body.consent.terms_version,
        terms_accepted_at: at,
        privacy_version: body.consent.privacy_version,
        created_at: at,
      };
      state.usersByPhone.set(body.phone, user);
    }
    const session: Schema<'AuthSession'> = {
      access_token: `mock_${user.id}`,
      refresh_token: `rt_mock_${user.id}`,
      token_type: 'Bearer',
      expires_in: 900,
      user,
      is_new_user: isNew,
    };
    return json(200, session);
  }

  if (path === '/clubs' && method === 'GET') {
    const club = getClub();
    const summary: Schema<'ClubSummary'> = {
      id: club.id,
      name: club.name,
      address: club.address,
      city: club.city,
      logo_url: club.logo_url,
      courts_count: club.courts.length,
    };
    return json(200, { items: [summary], next_cursor: null });
  }

  const availability = /^\/courts\/([^/]+)\/availability$/.exec(path);
  if (availability && method === 'GET') {
    const court = getClub().courts.find((c) => c.id === availability[1]);
    if (!court) return err(404, 'NOT_FOUND');
    const date = url.searchParams.get('date') ?? '';
    const duration = Number(url.searchParams.get('duration_minutes')) as Schema<'BookingDuration'>;
    const result: Schema<'CourtAvailability'> = {
      court_id: court.id,
      date,
      timezone: getClub().timezone,
      duration_minutes: duration,
      slots: freeSlots(court, date, duration, state),
    };
    return json(200, result);
  }

  // Everything below needs a signed-in user.
  if (!path.startsWith('/me') && !path.startsWith('/bookings')) return null;
  const user = authUser(request, state);
  if (!user) return err(401, 'UNAUTHENTICATED');

  if (path === '/me' && method === 'GET') return json(200, user);
  if (path === '/me' && method === 'PATCH') {
    const body = (await request.json()) as Schema<'UserUpdate'>;
    Object.assign(user, body);
    return json(200, user);
  }

  if (path === '/bookings' && method === 'POST') {
    const body = (await request.json()) as Schema<'BookingCreate'>;
    const court = getClub().courts.find((c) => c.id === body.court_id);
    if (!court) return err(404, 'NOT_FOUND');
    const day = localDate(new Date(body.starts_at));
    const slot = freeSlots(court, day, body.duration_minutes, state).find(
      (s) => Date.parse(s.starts_at) === Date.parse(body.starts_at),
    );
    if (!slot) {
      const taken = freeSlots(court, day, body.duration_minutes, { ...state, bookings: [] });
      return taken.some((s) => Date.parse(s.starts_at) === Date.parse(body.starts_at))
        ? err(409, 'BOOKING_SLOT_TAKEN')
        : err(422, 'BOOKING_SLOT_INVALID');
    }
    const now = state.now();
    const held = slot.deposit_cents > 0;
    const booking: Schema<'Booking'> = {
      id: crypto.randomUUID(),
      club_id: getClub().id,
      court_id: court.id,
      starts_at: slot.starts_at,
      ends_at: slot.ends_at,
      duration_minutes: body.duration_minutes,
      status: held ? 'held' : 'confirmed',
      hold_expires_at: held ? new Date(now.getTime() + HOLD_MINUTES * 60_000).toISOString() : null,
      price_cents: slot.amount_cents,
      deposit_cents: slot.deposit_cents,
      deposit_paid_cents: 0,
      cancellation_refund_hours: court.booking.cancellation_refund_hours,
      source: 'app',
      players: [
        {
          position: 1,
          user: { id: user.id, name: user.display_name },
          accepted: true,
          guardian_consent_on_file: false,
        },
      ],
      no_record: body.no_record ?? false,
      no_record_reason: body.no_record ? 'requested' : null,
      series: null,
      created_at: now.toISOString(),
    };
    state.bookings.push(booking);
    return json(201, booking);
  }

  const action = /^\/bookings\/([^/]+)\/(invite|cancel)$/.exec(path);
  if (action && method === 'POST') {
    const booking = state.bookings.find((b) => b.id === action[1]);
    const mine = booking?.players.some((p) => p.user?.id === user.id);
    if (!booking || !mine) return err(404, 'NOT_FOUND');
    if (booking.players[0]?.user?.id !== user.id) return err(403, 'FORBIDDEN');
    if (action[2] === 'invite') {
      if (booking.status !== 'held' && booking.status !== 'confirmed') {
        return err(422, 'BOOKING_INVITE_INVALID');
      }
      const taken = new Set(booking.players.map((p) => p.position));
      const position = [2, 3, 4].find((p) => !taken.has(p));
      if (!position) return err(409, 'BOOKING_FULL');
      const token = `inv_${crypto.randomUUID().replace(/-/g, '')}`;
      const invite: Schema<'BookingInvite'> = {
        booking_id: booking.id,
        position,
        token,
        url: `https://example.com/i/${token}`,
        expires_at: booking.starts_at,
      };
      state.invites.set(`${booking.id}:${position}`, invite);
      return json(201, invite);
    }
    if (booking.status !== 'confirmed') return err(409, 'INVALID_STATE_TRANSITION');
    const now = state.now();
    const inTime =
      Date.parse(booking.starts_at) - now.getTime() >=
      booking.cancellation_refund_hours * 3_600_000;
    booking.status = 'cancelled';
    const refund = inTime ? booking.deposit_paid_cents : 0;
    const cancellation: Schema<'BookingCancellation'> = {
      booking_id: booking.id,
      status: 'cancelled',
      cancelled_at: now.toISOString(),
      refund_cents: refund,
      refund_status: refund > 0 ? 'pending' : 'none',
      cancelled_booking_ids: [booking.id],
    };
    return json(200, cancellation);
  }

  return null;
}

function authUser(request: Request, state: PlayerMockState): Schema<'User'> | undefined {
  const token = /^Bearer mock_(.+)$/.exec(request.headers.get('Authorization') ?? '')?.[1];
  return [...state.usersByPhone.values()].find((u) => u.id === token);
}

/** `YYYY-MM-DD` of `instant` in the club's time zone. */
function localDate(instant: Date): string {
  return new Date(instant.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);
}

function minutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function freeSlots(
  court: Schema<'Court'>,
  date: string,
  duration: Schema<'BookingDuration'>,
  state: PlayerMockState,
): Schema<'AvailabilitySlot'>[] {
  if (court.status !== 'active' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
  const midnight = Date.parse(`${date}T00:00:00${AR_OFFSET}`);
  const weekday = WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()];
  const rule = court.booking.rules.find(
    (r) => weekday && r.days.includes(weekday) && r.allowed_durations.includes(duration),
  );
  if (!rule) return [];
  const now = state.now().getTime();
  const slots: Schema<'AvailabilitySlot'>[] = [];
  for (
    let start = minutes(rule.opens_at);
    start + duration <= minutes(rule.closes_at);
    start += rule.start_interval_minutes
  ) {
    const startsAt = midnight + start * 60_000;
    const endsAt = startsAt + duration * 60_000;
    if (startsAt <= now) continue;
    const overlaps = state.bookings.some(
      (b) =>
        b.court_id === court.id &&
        (b.status === 'held' || b.status === 'confirmed') &&
        Date.parse(b.starts_at) < endsAt &&
        Date.parse(b.ends_at) > startsAt,
    );
    if (overlaps) continue;
    const band = rule.price_bands.find(
      (b) => minutes(b.starts_at) <= start && start < minutes(b.ends_at),
    );
    const amount = band?.prices.find((p) => p.duration_minutes === duration)?.amount_cents;
    if (amount === undefined) continue;
    const deposit = court.booking.deposit;
    const depositCents =
      deposit.type === 'percent'
        ? Math.round((amount * deposit.percent) / 100)
        : deposit.type === 'fixed'
          ? deposit.amount_cents
          : 0;
    slots.push({
      starts_at: new Date(startsAt).toISOString(),
      ends_at: new Date(endsAt).toISOString(),
      amount_cents: amount,
      deposit_cents: depositCents,
    });
  }
  return slots;
}
