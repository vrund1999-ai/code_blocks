import { defineConfig, devices } from '@playwright/test';

const CI = !!process.env.CI;
const PORT = 4173;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  workers: CI ? 2 : 4,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: CI
    ? [['github'], ['html', { open: 'never' }], ['list']]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1500, height: 900 },
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },
  webServer: [
    {
      // CI tests the production bundle; locally the dev server is faster to start.
      command: CI
        ? `npm run build && npm run preview -- --port ${PORT} --strictPort`
        : `npm run dev -- --port ${PORT} --strictPort`,
      url: `http://localhost:${PORT}`,
      reuseExistingServer: !CI,
      timeout: 120_000,
    },
    {
      // The server runtime, which keeps table rows. The editor forwards /api to it.
      // Its database is in memory, so test runs leave nothing behind; each test's
      // project has its own id, so tests don't see each other's rows.
      command: 'npm run start:server',
      url: 'http://127.0.0.1:8787/api/health',
      env: { DB_FILE: ':memory:' },
      reuseExistingServer: !CI,
      timeout: 60_000,
    },
  ],
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1500, height: 900 } } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'], viewport: { width: 1500, height: 900 } } },
    { name: 'webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1500, height: 900 } } },
  ],
});
