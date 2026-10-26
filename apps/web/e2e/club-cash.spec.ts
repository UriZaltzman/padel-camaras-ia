import { expect, test } from '@playwright/test';

import { messages as esAR } from '../src/i18n/messages';

const DEMO_CLUB = '01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a60';

test('the club adds an expense and closes the cash register with no difference', async ({
  page,
}) => {
  await page.goto(`/panel/clubes/${DEMO_CLUB}/caja`);
  await expect(page.getByRole('heading', { name: esAR['cash.title'], level: 1 })).toBeVisible();
  await expect(page.getByText('Marcos Gil · Cancha 1')).toBeVisible();

  await page.getByLabel(esAR['cash.expense.description']).fill('Pelotas');
  await page.getByLabel(esAR['cash.expense.amount']).fill('500');
  await page.getByRole('button', { name: esAR['cash.expense.add'] }).click();
  await expect(page.getByText('Pelotas')).toBeVisible();

  await page.getByLabel(esAR['cash.close.counted']).fill('29.500');
  await page.getByRole('button', { name: esAR['cash.close.submit'] }).click();
  await expect(page.getByText(esAR['cash.closed.balanced'])).toBeVisible();
  await expect(page.getByRole('link', { name: esAR['cash.closed.pdf'] })).toBeVisible();
});
