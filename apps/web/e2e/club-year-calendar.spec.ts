import { expect, test } from '@playwright/test';

import esAR from '../src/i18n/es-AR.json' with { type: 'json' };

const DEMO_CLUB = '01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a60';

test('the club blocks a court six months out and sees it in the year', async ({ page }) => {
  await page.goto(`/panel/clubes/${DEMO_CLUB}/calendario/anual`);
  await expect(page.getByRole('heading', { name: esAR['yearCal.title'] })).toBeVisible();

  await page.getByRole('button', { name: esAR['yearCal.newBlock'] }).click();
  const dialog = page.getByRole('dialog', { name: esAR['yearCal.modal.title'] });
  const target = new Date();
  target.setMonth(target.getMonth() + 6);
  const day = target.toISOString().slice(0, 10);
  await dialog.getByLabel(esAR['yearCal.modal.from']).fill(day);
  await dialog.getByLabel(esAR['yearCal.modal.to']).fill(day);
  await dialog.getByLabel(esAR['yearCal.modal.reason']).fill('Cambio de red');
  await dialog.getByRole('button', { name: esAR['yearCal.modal.confirm'] }).click();

  if (target.getFullYear() !== new Date().getFullYear()) {
    await page.getByRole('button', { name: esAR['yearCal.nextYear'] }).click();
  }
  await expect(page.getByText(/Cambio de red/).first()).toBeVisible();
  const cell = page.getByRole('button', {
    name: new RegExp(`^${target.getDate()} de .*bloqueos: 2$`),
  });
  await expect(cell).toHaveCount(1);
});
