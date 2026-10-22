import { expect, test } from '@playwright/test';

import esAR from '../src/i18n/es-AR.json' with { type: 'json' };

const DEMO_CLUB = '01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a60';

test('the club sees today’s turns and cancels one', async ({ page }) => {
  await page.goto(`/panel/clubes/${DEMO_CLUB}/calendario`);
  await expect(page.getByRole('heading', { name: esAR['calendar.title'] })).toBeVisible();
  const turn = page.getByRole('button', { name: /Lucía Pérez/ });
  await expect(turn).toBeVisible();

  await turn.click();
  const dialog = page.getByRole('dialog', { name: esAR['calendar.detail.title'] });
  await dialog.getByRole('button', { name: esAR['calendar.cancel'] }).click();
  await dialog.getByRole('button', { name: esAR['calendar.cancel.confirm'] }).click();
  await expect(dialog.getByText(esAR['calendar.cancel.done'])).toBeVisible();
  await dialog.getByRole('button', { name: esAR['calendar.detail.close'] }).click();
  await expect(turn).toHaveCount(0);
});
