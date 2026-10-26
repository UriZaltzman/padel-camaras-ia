import { defineConfig, devices } from '@playwright/test';

// Full-stack e2e: the web in real-API mode (NEXT_PUBLIC_API_MOCK=false) against the real API of
// infra/e2e (started by `pnpm e2e:full`). Never uses the API mock.
const PORT = 3102;
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3300/v1';

export default defineConfig({
  testDir: './e2e-full',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: { baseURL: `http://localhost:${PORT}`, locale: 'es-AR', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm exec next dev --port ${PORT}`,
    url: `http://localhost:${PORT}/ingresar`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: { NEXT_PUBLIC_API_MOCK: 'false', NEXT_PUBLIC_API_URL: API_URL },
  },
});
