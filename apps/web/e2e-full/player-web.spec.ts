import { expect, test } from '@playwright/test';

import { messages as esAR } from '../src/i18n/messages';

import {
  API_URL,
  PALERMO,
  PALERMO_COURT_1,
  PALERMO_STAFF_PHONE,
  bearer,
  localDate,
  readOtpCode,
  signIn,
} from './stack';

// A seeded player of Club Demo Palermo, other than the one of booking.spec.ts.
const PLAYER_PHONE = '+5491155501012';

// The web in real-API mode: no mock, the browser session talks to the real API through the server.
test('a seeded player signs in on the web and books a turn that the club then sees', async ({
  page,
  request,
}) => {
  const date = localDate(2);

  await page.goto('/mis-reservas');
  await expect(page).toHaveURL(/\/ingresar\?next=/);
  await page.getByLabel(esAR['player.signIn.phone']).fill('11 5550 1012');
  await page.getByRole('button', { name: esAR['player.signIn.sendCode'] }).click();
  await page.getByLabel(esAR['player.signIn.code']).fill(await readOtpCode(PLAYER_PHONE));
  await page.getByRole('button', { name: esAR['player.signIn.enter'] }).click();
  await expect(page).toHaveURL(/\/mis-reservas|\/perfil|\/$/);

  await page.goto(`/reservar?court=${PALERMO_COURT_1}&date=${date}&duration=90`);
  const slot = page.getByRole('button', { name: /11:00 a 12:30/ });
  await expect(slot).toBeVisible();
  await slot.click();
  await expect(page).toHaveURL(/\/mis-reservas\?nueva=/);
  await expect(page.getByText(esAR['player.bookings.created'])).toBeVisible();
  await expect(page.getByText(esAR['player.bookings.status.held'])).toBeVisible();

  // The club's front desk sees it (held until the deposit arrives).
  const staff = await signIn(request, PALERMO_STAFF_PHONE);
  const calendar = await request.get(`${API_URL}/club-admin/bookings`, {
    headers: bearer(staff),
    params: {
      club_id: PALERMO,
      from: `${date}T03:00:00.000Z`,
      to: `${localDate(3)}T03:00:00.000Z`,
      limit: 50,
    },
  });
  const items = ((await calendar.json()) as { items: { starts_at: string; status: string }[] })
    .items;
  expect(items.find((b) => b.starts_at === `${date}T14:00:00.000Z`)?.status).toBe('held');
});
