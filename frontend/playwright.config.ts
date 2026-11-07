import { defineConfig, devices } from '@playwright/test';

// The dev stack lives on 3007 (vite, see vite.config.ts `server.port`), not
// 3000 — the old value meant `webServer` waited 30s for a port nothing ever
// bound, so the e2e gate could never go green no matter what the app did.
const DEV_URL = 'http://localhost:3007';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',

  use: {
    baseURL: DEV_URL,
    trace: 'on-first-retry',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],

  webServer: {
    // --no-python: the smoke suite only asserts that frontend routes render
    // without a JS crash. Pulling up the legacy FastAPI side would require a
    // full pip install on the runner, and its absence is already allowlisted
    // by the spec (ERR_CONNECTION_REFUSED / net::ERR).
    command: 'npm --prefix .. run dev -- --no-python --no-open',
    url: DEV_URL,
    reuseExistingServer: !process.env.CI,
    // vite cold start + tsx compiling the gateway; 30s was too tight on a
    // 2-core runner.
    timeout: 120_000,
  },
});
