import { expect } from '@playwright/test';

import {
  expectAccessible,
  expectResponsive,
  expectScreenshot,
  screenTitle,
  test,
} from '../support/responsive';

test(screenTitle('console-clubs', 'the clubs list fits the device'), async ({ page }) => {
  const width = page.viewportSize()?.width ?? 0;
  await page.goto('/admin/clubes');
  await expect(page.getByRole('heading', { name: 'Clubes', level: 1 })).toBeVisible();
  await expect(page.getByText('Club Demo Norte').first()).toBeVisible();

  // Tables rule: cards on a phone, a real table from the tablet up.
  if (width < 640) {
    await expect(page.getByRole('table')).toHaveCount(0);
    await expect(page.getByRole('list', { name: 'Lista de clubes' })).toBeVisible();
  } else {
    await expect(page.getByRole('table')).toBeVisible();
  }

  await expectResponsive(page);
  await expectAccessible(page);
  await expectScreenshot(page, 'console-clubs');
});
