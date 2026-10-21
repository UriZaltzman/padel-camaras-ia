import type { Schema } from '@app/contracts';
import { cookies } from 'next/headers';
import { z } from 'zod';

/**
 * Player session for the web. Tokens never reach browser JavaScript: they live in an httpOnly,
 * SameSite=Lax cookie written only by server actions, and every authenticated call to the API is
 * made from the server. Server actions only accept same-origin POSTs (Next checks Origin against
 * Host), which is the CSRF protection already used by the contact form.
 */
const SESSION_COOKIE = 'player_session';
const BOOKINGS_COOKIE = 'player_bookings';
const REFRESH_TTL_SECONDS = 30 * 24 * 3600;
const MAX_BOOKINGS = 20;

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
} as const;

const sessionSchema = z.object({ access_token: z.string().min(1), refresh_token: z.string() });

export async function getAccessToken(): Promise<string | null> {
  const raw = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  try {
    const parsed = sessionSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data.access_token : null;
  } catch {
    return null;
  }
}

export async function saveSession(session: Schema<'TokenPair'>): Promise<void> {
  const value = JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  (await cookies()).set(SESSION_COOKIE, value, { ...cookieOptions, maxAge: REFRESH_TTL_SECONDS });
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(BOOKINGS_COOKIE);
}

/**
 * Bookings made from this browser. INTERIM: the contract has no "list my bookings" operation
 * yet, so "Mis reservas" shows the bookings this session created, as the API returned them.
 * Replace with the API list once the contract has it.
 */
const bookingRefSchema = z.object({
  id: z.uuid(),
  court_id: z.uuid(),
  starts_at: z.string(),
  ends_at: z.string(),
  status: z.string(),
  price_cents: z.number().int(),
  deposit_cents: z.number().int(),
  hold_expires_at: z.string().nullable(),
});
export type BookingRef = z.infer<typeof bookingRefSchema>;

export async function getBookingRefs(): Promise<BookingRef[]> {
  const raw = (await cookies()).get(BOOKINGS_COOKIE)?.value;
  if (!raw) return [];
  try {
    const parsed = z.array(bookingRefSchema).safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export async function saveBookingRef(booking: Partial<BookingRef> & { id: string }): Promise<void> {
  const refs = await getBookingRefs();
  const existing = refs.find((r) => r.id === booking.id);
  const next = existing
    ? refs.map((r) => (r.id === booking.id ? { ...r, ...booking } : r))
    : [bookingRefSchema.parse(booking), ...refs].slice(0, MAX_BOOKINGS);
  (await cookies()).set(BOOKINGS_COOKIE, JSON.stringify(next), {
    ...cookieOptions,
    maxAge: REFRESH_TTL_SECONDS,
  });
}
