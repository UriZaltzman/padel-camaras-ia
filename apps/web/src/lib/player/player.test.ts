import type { Schema } from '@app/contracts';
import { describe, expect, it } from 'vitest';

import { DEMO_CLUB_ID, demoClub } from '@/lib/api/mock-data';
import { createMockFetch } from '@/lib/api/mock-fetch';
import { MOCK_OTP_CODE, newPlayerMockState } from '@/lib/api/mock-player';
import { nth } from '@/test-utils/nth';

import { safeNext } from './api';
import { currentConsent } from './consent';
import { errorMessage, parsePhone, parseProfile } from './forms';
import { formatCents, todayLocal } from './format';

const API = 'http://localhost:3000/v1';
const court = nth(demoClub.courts, 0);

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [k, v] of Object.entries(values)) data.set(k, v);
  return data;
}

describe('player forms', () => {
  it('only returns to same-site paths after sign-in', () => {
    expect(safeNext('/mis-reservas')).toBe('/mis-reservas');
    expect(safeNext('//evil.example')).toBe('/reservar');
    expect(safeNext('/\\evil.example')).toBe('/reservar');
    expect(safeNext('https://evil.example')).toBe('/reservar');
    expect(safeNext(undefined)).toBe('/reservar');
  });

  it('reads Argentine phones as E.164', () => {
    expect(parsePhone('11 5555-0123')).toBe('+5491155550123');
    expect(parsePhone('abc')).toBeNull();
  });

  it('turns the profile form into a UserUpdate, clearing empty fields', () => {
    expect(
      parseProfile(
        form({
          display_name: ' Sofi ',
          declared_category: '6',
          dominant_hand: '',
          playing_side: 'reves',
          birth_date: '',
          training_opt_out: 'on',
        }),
      ),
    ).toEqual({
      display_name: 'Sofi',
      declared_category: '6',
      dominant_hand: null,
      playing_side: 'reves',
      birth_date: null,
      training_opt_out: true,
    });
    expect(parseProfile(form({ display_name: '', declared_category: '9' }))).toBeNull();
  });

  it('maps API error codes to messages, with a generic fallback', () => {
    expect(errorMessage('BOOKING_SLOT_TAKEN')).toBe('player.error.slotTaken');
    expect(errorMessage('INTERNAL_ERROR')).toBe('player.error.generic');
  });

  it('formats cents and the local day', () => {
    expect(formatCents(2_400_000)).toMatch(/24\.000/);
    expect(todayLocal(new Date('2026-10-22T02:00:00Z'))).toBe('2026-10-21');
  });
});

describe('player API mock', () => {
  const now = new Date('2026-10-21T12:00:00Z');

  async function signIn(fetch: typeof globalThis.fetch) {
    const post = (path: string, body: unknown) =>
      fetch(`${API}${path}`, { method: 'POST', body: JSON.stringify(body) });
    const phone = '+5491155550123';
    expect((await post('/auth/otp/verify', { phone, code: MOCK_OTP_CODE })).status).toBe(403);
    const session = (await (
      await post('/auth/otp/verify', { phone, code: MOCK_OTP_CODE, consent: currentConsent })
    ).json()) as Schema<'AuthSession'>;
    return (path: string, body: unknown) =>
      fetch(`${API}${path}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(body),
      });
  }

  it('holds a slot with its deposit and answers BOOKING_SLOT_TAKEN to the second request', async () => {
    const fetch = createMockFetch(
      demoClub,
      newPlayerMockState(() => now),
    );
    const post = await signIn(fetch);
    const availability = (await (
      await fetch(`${API}/courts/${court.id}/availability?date=2026-10-23&duration_minutes=90`)
    ).json()) as Schema<'CourtAvailability'>;
    const slot = nth(availability.slots, 0);
    expect(slot).toEqual({
      starts_at: '2026-10-23T11:00:00.000Z',
      ends_at: '2026-10-23T12:30:00.000Z',
      amount_cents: 2_400_000,
      deposit_cents: 720_000,
    });
    const body = { court_id: court.id, starts_at: slot.starts_at, duration_minutes: 90 };
    const first = await post('/bookings', body);
    expect(first.status).toBe(201);
    const booking = (await first.json()) as Schema<'Booking'>;
    expect(booking).toMatchObject({
      status: 'held',
      club_id: DEMO_CLUB_ID,
      deposit_cents: 720_000,
    });
    expect((await post('/bookings', body)).status).toBe(409);

    // A held booking cannot be cancelled; it can invite.
    expect((await post(`/bookings/${booking.id}/cancel`, {})).status).toBe(409);
    const invite = (await (
      await post(`/bookings/${booking.id}/invite`, {})
    ).json()) as Schema<'BookingInvite'>;
    expect(invite.position).toBe(2);
  });

  it('rejects bookings without a session or outside the rules', async () => {
    const fetch = createMockFetch(
      demoClub,
      newPlayerMockState(() => now),
    );
    const anonymous = await fetch(`${API}/bookings`, { method: 'POST', body: '{}' });
    expect(anonymous.status).toBe(401);
    const post = await signIn(fetch);
    const response = await post('/bookings', {
      court_id: court.id,
      starts_at: '2026-10-23T11:10:00Z',
      duration_minutes: 90,
    });
    expect(response.status).toBe(422);
  });
});
