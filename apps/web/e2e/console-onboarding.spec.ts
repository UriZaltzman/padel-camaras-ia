import { expect, test } from '@playwright/test';

import esAR from '../src/i18n/es-AR.json' with { type: 'json' };

test('a seller onboards a club in one pass and the link opens the booking page', async ({
  page,
}) => {
  await page.goto('/admin/clubes/nuevo');
  await page.getByLabel(esAR['admin.onb.f.name']).fill('Club Alta Demo');
  await page.getByLabel(esAR['admin.onb.f.legalName']).fill('Club Alta Demo S.R.L.');
  await page.getByLabel(esAR['admin.onb.f.taxId']).fill(`30${String(Date.now()).slice(-9)}`);
  await page.getByLabel(esAR['admin.onb.f.address']).fill('Calle de prueba 123');
  await page.getByLabel(esAR['admin.onb.f.city']).fill('CABA');
  await page.getByLabel(esAR['admin.onb.f.ownerName']).fill('Dueño de prueba');
  await page.getByLabel(esAR['admin.onb.f.ownerPhone']).fill('+5491155550000');
  await page.getByRole('button', { name: esAR['admin.onb.next'] }).click();

  await page.getByLabel(esAR['admin.onb.f.tariff']).selectOption({ index: 1 });
  await expect(page.getByTestId('monthly-price')).toContainText('$');
  await page.getByRole('button', { name: esAR['admin.onb.next'] }).click();

  await page.getByLabel(esAR['admin.onb.f.amount']).fill('100000');
  await page.getByRole('button', { name: esAR['admin.onb.next'] }).click();

  await page.getByLabel(`${esAR['admin.onb.f.courtPrice']} 1`).fill('12000');
  await page.getByRole('button', { name: esAR['admin.onb.create'] }).click();

  await expect(page.getByRole('heading', { name: esAR['admin.onb.done'] })).toBeVisible();
  await expect(page.getByRole('img', { name: esAR['admin.onb.qr'] })).toBeVisible();
  await page.getByTestId('club-link').click();
  await expect(page).toHaveURL(/\/reservar$/);
});
