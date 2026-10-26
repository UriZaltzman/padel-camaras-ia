import { expect } from '@playwright/test';

import esAR from '../../src/i18n/es-AR.json' with { type: 'json' };
import {
  expectAccessible,
  expectResponsive,
  expectScreenshot,
  screenTitle,
  test,
} from '../support/responsive';

const DEMO_CLUB = '01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a60';

test(screenTitle('club-calendar', 'the booking calendar fits the device'), async ({ page }) => {
  const width = page.viewportSize()?.width ?? 0;
  await page.goto(`/panel/clubes/${DEMO_CLUB}/calendario`);
  await expect(page.getByRole('heading', { name: esAR['calendar.title'] })).toBeVisible();
  await expect(page.getByRole('grid')).toBeVisible();

  // Booking-grid rule: one court on a phone, two or three on a tablet, all from the laptop up.
  // Below the laptop a selector moves the window over the courts.
  const columns = await page.getByRole('columnheader').count();
  if (width < 640) expect(columns).toBe(1);
  else if (width < 1024) expect([2, 3]).toContain(columns);
  else expect(columns).toBeGreaterThanOrEqual(2); // the mock club has two courts, all of them

  // Navigation: side menu from the laptop, drawer below.
  const nav = page.getByRole('navigation');
  if (width >= 1024) {
    await expect(nav).toBeVisible();
  } else {
    await expect(nav).toBeHidden();
    await page.getByRole('button', { name: 'Abrir el menú' }).click();
    await expect(nav).toBeVisible();
    await expectResponsive(page);
    await page.getByRole('button', { name: 'Cerrar el menú' }).click();
    await expect(nav).toBeHidden();
  }

  await expectResponsive(page);
  await expectAccessible(page);
  await expectScreenshot(page, 'club-calendar');
});

test(
  screenTitle('club-calendar', 'the booking detail is a sheet on a phone, a dialog beyond'),
  async ({ page }) => {
    const width = page.viewportSize()?.width ?? 0;
    await page.goto(`/panel/clubes/${DEMO_CLUB}/calendario`);
    await page
      .getByRole('button', { name: /Lucía Pérez/ })
      .first()
      .click();
    const dialog = page.getByRole('dialog', { name: esAR['calendar.detail.title'] });
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    const viewport = page.viewportSize();
    if (!box || !viewport) throw new Error('no geometry');
    if (width < 640) {
      // Bottom sheet: as wide as the screen and stuck to the bottom edge.
      expect(box.width).toBeGreaterThanOrEqual(viewport.width - 1);
      expect(box.y + box.height).toBeGreaterThanOrEqual(viewport.height - 1);
    } else {
      expect(box.width).toBeLessThan(viewport.width);
    }
    await expectResponsive(page);
  },
);
