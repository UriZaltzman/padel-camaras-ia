import { defineConfig, devices } from '@playwright/test';

import { deviceProjects } from './e2e/support/devices';

// End-to-end tests of the web against the API mock (`next dev` with NEXT_PUBLIC_API_MOCK).
// Two kinds of project:
//  - `chromium`: functional flows (every spec outside e2e/responsive).
//  - one per device of the matrix: only the specs in e2e/responsive, see docs/testing/responsive.md.
const PORT = 3101;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: process.env.CI ? 2 : undefined,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.02, animations: 'disabled', caret: 'hide' },
  },
  // Same baseline for every project of the same device; one folder per OS (fonts differ).
  snapshotPathTemplate: '{testDir}/__screenshots__/{platform}/{projectName}/{arg}{ext}',
  use: { baseURL: `http://localhost:${PORT}`, locale: 'es-AR', trace: 'retain-on-failure' },
  projects: [
    {
      name: 'chromium',
      testIgnore: '**/responsive/**',
      use: { ...devices['Desktop Chrome'] },
    },
    ...deviceProjects.map((project) => ({
      ...project,
      testMatch: '**/responsive/**/*.spec.ts',
    })),
  ],
  webServer: {
    command: `pnpm exec next dev --port ${PORT}`,
    url: `http://localhost:${PORT}/ingresar`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { NEXT_PUBLIC_API_MOCK: 'true' },
  },
});
