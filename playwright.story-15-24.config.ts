/**
 * Story 15.24 — playwright config for the local browser-real verification.
 *
 * Standalone config that points at the running dev server on :3007 (where this
 * project's `npm run dev` actually serves) and skips the auto-launched
 * webServer block from the main playwright.config.ts. Used only for ad-hoc
 * Story-level smoke tests; CI continues to use the default config.
 */
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /projects-page\.spec\.ts/,
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: 'line',
  use: {
    baseURL: 'http://localhost:3007',
    trace: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
