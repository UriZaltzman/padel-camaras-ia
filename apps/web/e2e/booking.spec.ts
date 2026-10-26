import { expect, test } from '@playwright/test';

import { messages as esAR } from '../src/i18n/messages';

// Test data of the API mock (src/lib/api/mock-player.ts): any phone, fixed code.
const MOCK_OTP_CODE = '123456';
const CANCHA_1 = '01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a61';

function tomorrowInBuenosAires(): string {
  const tomorrow = new Date(Date.now() + 24 * 3600 * 1000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(
    tomorrow,
  );
}

test('a new player signs in, completes the profile and books a turn end to end', async ({
  page,
}) => {
  // Mis reservas asks to sign in first.
  await page.goto('/mis-reservas');
  await expect(page).toHaveURL(/\/ingresar\?next=/);

  // Sign in with WhatsApp; a new phone has to accept the terms.
  const phone = `11 5${String(Date.now()).slice(-7)}`;
  await page.getByLabel(esAR['player.signIn.phone']).fill(phone);
  await page.getByRole('button', { name: esAR['player.signIn.sendCode'] }).click();
  await page.getByLabel(esAR['player.signIn.code']).fill(MOCK_OTP_CODE);
  await page.getByRole('button', { name: esAR['player.signIn.enter'] }).click();
  await expect(page.getByText(esAR['player.signIn.newAccount'])).toBeVisible();
  await page.getByRole('button', { name: esAR['player.signIn.enter'] }).click();
  await expect(page.locator('#sign-in-error')).toHaveText(esAR['player.error.terms']);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: esAR['player.signIn.enter'] }).click();

  // New accounts land on the profile.
  await expect(page).toHaveURL(/\/perfil/);
  await page.getByLabel(esAR['player.profile.name']).fill('Jugadora Demo');
  await page.getByLabel(esAR['player.profile.category']).selectOption('6');
  await page.getByRole('button', { name: esAR['player.profile.save'] }).click();
  await expect(page.getByText(esAR['player.profile.saved'])).toBeVisible();

  // Find a free turn tomorrow and book it.
  await page.goto(`/reservar?court=${CANCHA_1}&date=${tomorrowInBuenosAires()}&duration=90`);
  const slot = page.getByRole('button', { name: /20:00 a 21:30/ });
  await expect(slot).toContainText('Seña de');
  await slot.click();

  await expect(page).toHaveURL(/\/mis-reservas\?nueva=/);
  await expect(page.getByText(esAR['player.bookings.created'])).toBeVisible();
  await expect(page.getByText(esAR['player.bookings.status.held'])).toBeVisible();

  // Invite a partner by WhatsApp.
  await page.getByRole('button', { name: esAR['player.bookings.invite'] }).click();
  await expect(page.getByLabel(esAR['player.bookings.inviteLink'])).toHaveValue(/\/i\/inv_/);
  await expect(
    page.getByRole('link', { name: esAR['player.bookings.shareWhatsapp'] }),
  ).toHaveAttribute('href', /^https:\/\/wa\.me\//);

  // The slot is no longer offered.
  await page.goto(`/reservar?court=${CANCHA_1}&date=${tomorrowInBuenosAires()}&duration=90`);
  await expect(page.getByRole('button', { name: /^20:00 a 21:30/ })).toHaveCount(0);
});
