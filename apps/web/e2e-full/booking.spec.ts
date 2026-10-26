import { randomUUID } from 'node:crypto';

import { expect, test } from '@playwright/test';

import {
  API_URL,
  PALERMO,
  PALERMO_COURT_1,
  PALERMO_PLAYER_PHONE,
  PALERMO_STAFF_PHONE,
  bearer,
  localDate,
  signIn,
  webhookHeaders,
} from './stack';

interface Slot {
  starts_at: string;
  ends_at: string;
  amount_cents: number;
  deposit_cents: number;
}

// Real API, real database with the seeded clubs, fake payment provider.
test('a player books a turn, pays the deposit and the club sees it in its calendar', async ({
  request,
}) => {
  const date = localDate(1);

  // 1. The player signs in (seeded account, code read from the API log) and finds a free turn.
  const player = await signIn(request, PALERMO_PLAYER_PHONE);
  const availability = await request.get(
    `${API_URL}/courts/${PALERMO_COURT_1}/availability?date=${date}&duration_minutes=90`,
  );
  expect(availability.ok()).toBe(true);
  const slots = ((await availability.json()) as { slots: Slot[] }).slots;
  // The seed only books evenings, so the first turn of the day is free.
  const slot = slots.at(0);
  expect(slot, 'a turn is offered tomorrow').toBeDefined();
  expect(slot?.deposit_cents).toBeGreaterThan(0);

  // 2. Books it: held until the deposit is paid.
  const created = await request.post(`${API_URL}/bookings`, {
    headers: { ...bearer(player), 'Idempotency-Key': randomUUID() },
    data: { court_id: PALERMO_COURT_1, starts_at: slot?.starts_at, duration_minutes: 90 },
  });
  expect(created.status()).toBe(201);
  const booking = (await created.json()) as { id: string; status: string; deposit_cents: number };
  expect(booking.status).toBe('held');

  // 3. Checkout of the deposit with the fake provider, then its signed webhook.
  const checkout = await request.post(`${API_URL}/payments/checkout`, {
    headers: { ...bearer(player), 'Idempotency-Key': randomUUID() },
    data: { concept: 'deposit', booking_id: booking.id },
  });
  expect(checkout.status()).toBe(201);
  const { checkout_url: checkoutUrl, amount_cents: amountCents } = (await checkout.json()) as {
    checkout_url: string;
    amount_cents: number;
  };
  expect(amountCents).toBe(booking.deposit_cents);
  const preferenceId = new URL(checkoutUrl).searchParams.get('pref_id') ?? '';
  expect(preferenceId).not.toBe('');

  const unsigned = await request.post(
    `${API_URL}/webhooks/mercadopago?data.id=${preferenceId}&type=payment`,
  );
  expect(unsigned.status(), 'a webhook without signature is refused').toBeGreaterThanOrEqual(400);
  const webhook = await request.post(
    `${API_URL}/webhooks/mercadopago?data.id=${preferenceId}&type=payment`,
    { headers: webhookHeaders(preferenceId) },
  );
  expect(webhook.status()).toBe(200);

  // 4. The slot is gone for everyone else.
  const after = await request.get(
    `${API_URL}/courts/${PALERMO_COURT_1}/availability?date=${date}&duration_minutes=90`,
  );
  const stillFree = ((await after.json()) as { slots: Slot[] }).slots.find(
    (s) => s.starts_at === slot?.starts_at,
  );
  expect(stillFree, 'the booked turn is no longer offered').toBeUndefined();

  // 5. The club's staff sees the confirmed booking, with the booker, in its calendar.
  const staff = await signIn(request, PALERMO_STAFF_PHONE);
  const calendar = await request.get(`${API_URL}/club-admin/bookings`, {
    headers: bearer(staff),
    params: {
      club_id: PALERMO,
      from: `${date}T03:00:00.000Z`,
      to: `${localDate(2)}T03:00:00.000Z`,
      limit: 50,
    },
  });
  expect(calendar.ok()).toBe(true);
  const items = (
    (await calendar.json()) as {
      items: {
        id: string;
        status: string;
        deposit_paid_cents: number;
        court_name: string;
        booker: { user_id: string };
      }[];
    }
  ).items;
  const mine = items.find((b) => b.id === booking.id);
  expect(mine).toMatchObject({ status: 'confirmed', court_name: 'Cancha 1' });
  expect(mine?.deposit_paid_cents).toBe(booking.deposit_cents);
  expect(mine?.booker.user_id).toBe(player.userId);
});
