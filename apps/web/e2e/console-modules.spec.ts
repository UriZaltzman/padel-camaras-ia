import { expect, test } from '@playwright/test';

import { messages as esAR } from '../src/i18n/messages';

const club = '01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a01';

test('switching the deposit off is saved and shown again after reload', async ({ page }) => {
  await page.goto(`/admin/clubes/${club}/modulos`);
  const deposit = page.getByLabel(esAR['admin.modules.deposit.on']);
  await deposit.check();
  await page.getByLabel(esAR['admin.modules.deposit.percentValue']).fill('30');
  await page.getByRole('button', { name: esAR['admin.modules.save'] }).click();
  await expect(page.getByText(esAR['admin.modules.saved'])).toBeVisible();

  await deposit.uncheck();
  await page.getByRole('button', { name: esAR['admin.modules.save'] }).click();
  await expect(page.getByText(esAR['admin.modules.saved'])).toBeVisible();
  await page.reload();
  await expect(page.getByLabel(esAR['admin.modules.deposit.on'])).not.toBeChecked();
});
