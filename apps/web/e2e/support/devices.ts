import { devices, type Project } from '@playwright/test';

/**
 * The seven devices of plan section 2. Names are the descriptors of the installed Playwright
 * (1.56): the 375 px phone is "iPhone SE (3rd gen)" (the plain "iPhone SE" is the 320 px one).
 * Firefox is left out: Chromium covers the laptop and the WebKit projects cover Safari.
 */
export const deviceProjects: Project[] = [
  { name: 'iphone-se', use: { ...devices['iPhone SE (3rd gen)'] } },
  { name: 'iphone-15', use: { ...devices['iPhone 15'] } },
  { name: 'pixel-7', use: { ...devices['Pixel 7'] } },
  { name: 'ipad-portrait', use: { ...devices['iPad Mini'] } },
  { name: 'ipad-landscape', use: { ...devices['iPad Mini landscape'] } },
  { name: 'laptop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
  {
    name: 'desktop',
    use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
  },
];

/** Subset that runs on every PR: chromium phone, webkit phone, chromium desktop. */
export const prSubset = ['pixel-7', 'iphone-15', 'desktop'] as const;
