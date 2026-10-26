import { expect, test } from '@playwright/test';

import { messages as esAR } from '../src/i18n/messages';

const DEMO_CLUB = '01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a60';

test('the club filters dormant players and opens WhatsApp with the text prefilled', async ({
  page,
}) => {
  await page.goto(`/panel/clubes/${DEMO_CLUB}/jugadores`);
  await expect(page.getByText('Ana Torres')).toBeVisible();
  await page.getByRole('button', { name: esAR['crm.segment.dormant'] }).click();
  await expect(page.getByText('Ana Torres')).toHaveCount(0);
  await page.getByRole('button', { name: 'Abrir ficha de Bruno Páez' }).click();
  await page.getByLabel(esAR['crm.wa.template']).selectOption('reminder');
  const href = await page.getByRole('link', { name: esAR['crm.wa.send'] }).getAttribute('href');
  expect(href).toMatch(/^https:\/\/wa\.me\/5491155550102\?text=Hola%20Bruno/);
});
