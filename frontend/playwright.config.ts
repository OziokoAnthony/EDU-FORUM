import { defineConfig, devices } from '@playwright/test';

// Needs `pnpm infra:up` (Postgres, Redis, Mailpit). Starts the API and the web app if not running.
export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://localhost:3000' },
  projects: [
    // CLAUDE.md: mobile layout checked at 360 px width.
    { name: 'mobile-360', use: { ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 } } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: [
    {
      command: 'pnpm --dir ../backend dev',
      url: 'http://localhost:4000/api/v1/health',
      reuseExistingServer: true,
      timeout: 120_000,
      // Many sign-ups/sign-ins in a few seconds; the 5/min limit itself is tested in the API suite.
      env: { AUTH_RATE_LIMIT: '1000' },
    },
    {
      command: 'pnpm dev',
      url: 'http://localhost:3000',
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
