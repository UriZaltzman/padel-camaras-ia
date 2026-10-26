import { expect } from '@playwright/test';

import {
  expectAccessible,
  expectResponsive,
  expectScreenshot,
  screenTitle,
  test,
} from '../support/responsive';

test(screenTitle('landing', 'the landing page fits the device'), async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expectResponsive(page);
  await expectAccessible(page);
  await expectScreenshot(page, 'landing');
});
