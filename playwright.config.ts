import { defineConfig, devices } from '@playwright/test';
import { OUTBOX } from './e2e/support/mail';

const CI = !!process.env.CI;
const PORT = 4173;
/** The server serving the built editor itself, as when hosted. */
const HOSTED_PORT = 8788;

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
      // Tests reach it at 127.0.0.1 and sign up many accounts, so private
      // addresses are allowed and rate limits are off. Its emails go to a
      // file the tests read (e2e/support/mail.ts).
      command: 'npm run start:server',
      url: 'http://127.0.0.1:8787/api/health',
      env: { DB_FILE: ':memory:', ALLOW_PRIVATE_ADDRESSES: '1', RATE_LIMITS: 'off', MAIL_LOG_FILE: OUTBOX },
      reuseExistingServer: !CI,
      timeout: 60_000,
    },
    {
      // The server as it's hosted: serving the built editor, with rate limits
      // on and private addresses blocked (hosting.spec.ts). Servers start in
      // order, so in CI the editor was built by the first one.
      command: CI ? 'npm run start:server' : 'npm run build && npm run start:server',
      url: `http://127.0.0.1:${HOSTED_PORT}/api/health`,
      env: { DB_FILE: ':memory:', PORT: String(HOSTED_PORT), STATIC_DIR: '../editor/dist', TRUST_PROXY: '1' },
      reuseExistingServer: !CI,
      timeout: 120_000,
    },
  ],
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1500, height: 900 } } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'], viewport: { width: 1500, height: 900 } } },
    { name: 'webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1500, height: 900 } } },
  ],
});
