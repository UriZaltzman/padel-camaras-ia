import { expect, test } from '@playwright/test';

import { messages as esAR } from '../src/i18n/messages';

test('the console simulates a club of 900 players and shows its band', async ({ page }) => {
  await page.goto('/admin/tarifas');
  await expect(page.getByRole('heading', { name: esAR['admin.tariffs.title'] })).toBeVisible();
  await page.getByLabel(esAR['admin.sim.players']).fill('900');
  await page.getByRole('button', { name: esAR['admin.sim.run'] }).click();
  await expect(page.getByTestId('sim-tier')).toHaveText('401 a 1000 jugadores');
});
