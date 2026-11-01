import { defineConfig, devices } from '@playwright/test';

// Needs `pnpm infra:up` (Postgres, Redis, Mailpit). Starts the API and the web app if not running.
export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://localhost:3000' },
  // Tests run against the real API, B2, ClamAV and dev servers; 5 s is too tight under parallel load.
  expect: { timeout: 10_000 },
  // Two browsers at a time: more starves the API, ClamAV and Postgres on a dev machine.
  workers: 2,
  projects: [
    // CLAUDE.md: mobile layout checked at 360 px width.
    { name: 'mobile-360', use: { ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 } } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: [
    {
      // No file watching: a watcher restart mid-run made tests fail with "could not reach".
      command: 'pnpm --dir ../backend exec nest start',
      url: 'http://localhost:4000/api/v1/health',
      reuseExistingServer: true,
      timeout: 120_000,
      // Many sign-ups/sign-ins in a few seconds; the 5/min limit itself is tested in the API suite.
      env: { AUTH_RATE_LIMIT: '1000', CONTACT_RATE_LIMIT: '1000' },
    },
    {
      // Production build: pages are compiled once up front, so tests do not wait on the dev
      // server compiling routes on first visit (that made runs slow and flaky under load).
      command: 'pnpm build && pnpm start',
      url: 'http://localhost:3000',
      reuseExistingServer: true,
      timeout: 300_000,
    },
  ],
});
