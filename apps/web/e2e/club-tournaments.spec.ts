import { expect, test } from '@playwright/test';

import { messages as esAR } from '../src/i18n/messages';

const DEMO_CLUB = '01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a60';

test('the club creates a tournament, draws the seeded one and enters a result', async ({
  page,
}) => {
  await page.goto(`/panel/clubes/${DEMO_CLUB}/torneos`);
  await expect(
    page.getByRole('heading', { name: esAR['tournaments.title'], level: 1 }),
  ).toBeVisible();

  await page.getByRole('button', { name: esAR['tournaments.new'] }).click();
  await page.getByLabel(esAR['tournaments.wizard.name']).fill('Copa Primavera');
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: esAR['tournaments.wizard.next'] }).click();
  }
  await page.getByRole('button', { name: esAR['tournaments.wizard.create'] }).click();
  await expect(page.getByText('Copa Primavera')).toBeVisible();

  await page.goto(`/panel/clubes/${DEMO_CLUB}/torneos`);
  await page.getByRole('link', { name: 'Abrir Torneo Apertura 4ª' }).click();
  await page.getByLabel('Cancha 1').check();
  await page.getByLabel('Cancha 2').check();
  await page.getByRole('button', { name: esAR['tournaments.draw.submit'] }).click();
  await expect(page.getByRole('table', { name: 'Grupo A' })).toBeVisible();

  await page
    .getByRole('button', { name: /^Cargar resultado de/ })
    .first()
    .click();
  const form = page.getByRole('form', { name: /^Resultado:/ });
  const boxes = form.getByRole('textbox');
  for (const [i, v] of ['6', '3', '6', '2'].entries()) await boxes.nth(i).fill(v);
  await form.getByRole('button', { name: esAR['tournaments.result.save'] }).click();
  await expect(page.getByText(/6-3 6-2/)).toBeVisible();
});
