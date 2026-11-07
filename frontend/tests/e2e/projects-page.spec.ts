/**
 * projects-page.spec.ts — Story 15.24 browser-real verification
 *
 * Drives the actual /projects route in chromium against a running
 * Vite dev server (3007) and Express backend (8002). Performs the full
 * 5-action acceptance loop: list → create → select → rename → delete.
 *
 * Run prerequisites: `npm run dev` (frontend) + `cd server && npm run dev`
 * (backend) must be running before invoking `npx playwright test`.
 *
 * Note: this spec uses a custom baseURL via page.goto('http://localhost:3007/...')
 * because the default baseURL is :3000 from playwright.config.ts and we cannot
 * mutate that for one Story.
 */
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:3007';
const SUFFIX = Date.now().toString();

test('Story 15.24 — projects page real round-trip', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('pageerror', (err) => consoleErrors.push(err.message));
  page.on('console', (m) => {
    if (m.type() === 'error') {
      const text = m.text();
      // Allowlist pre-existing 404s for unrelated endpoints noted in the spec.
      if (
        text.includes('workspaces') ||
        text.includes('settings') ||
        text.includes('appearance') ||
        text.includes('v7_') ||
        text.includes('Failed to load resource')
      ) {
        return;
      }
      consoleErrors.push(`[console.error] ${text}`);
    }
  });

  // 1. Navigate to /projects → list loads
  await page.goto(`${BASE}/projects`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('[data-testid="project-list-panel"]', { timeout: 5000 });
  expect(consoleErrors, `console errors on first load: ${consoleErrors.join(' | ')}`).toHaveLength(0);

  // 2. Create a new project via modal
  await page.getByTestId('project-list-new-btn').click();
  await page.waitForSelector('[data-testid="project-create-modal"]');
  const projectName = `e2e-${SUFFIX}`;
  await page.getByTestId('project-create-name').fill(projectName);
  await page.getByTestId('project-create-path').fill(`D:/tmp/e2e-${SUFFIX}`);
  await page.getByTestId('project-create-submit').click();

  // 3. Project appears in list and is auto-selected → meta panel shows it
  await expect(page.getByTestId('project-meta-name')).toContainText(projectName, {
    timeout: 5000,
  });

  // Find the row for our project to grab its id
  const row = page.locator(`[data-testid^="project-row-"]`).filter({ hasText: projectName });
  await expect(row).toBeVisible();
  const rowTestId = await row.getAttribute('data-testid');
  const projectId = rowTestId!.replace('project-row-', '');

  // 4. Rename via inline edit on meta header
  await page.getByTestId('project-meta-name').click();
  const input = page.getByTestId('project-meta-name-input');
  await input.fill(`${projectName}-renamed`);
  await input.press('Enter');
  await expect(page.getByTestId('project-meta-name')).toContainText(`${projectName}-renamed`);

  // 5. Delete with retype confirm
  await page.getByTestId(`project-row-delete-${projectId}`).click();
  await page.waitForSelector('[data-testid="project-delete-modal"]');
  await page.getByTestId('project-delete-confirm-input').fill(`${projectName}-renamed`);
  await page.getByTestId('project-delete-submit').click();

  // After delete, meta panel falls back to empty state
  await expect(page.getByTestId('projects-page-empty-meta')).toBeVisible({ timeout: 5000 });

  expect(consoleErrors, `console errors at end: ${consoleErrors.join(' | ')}`).toHaveLength(0);
});

test('Story 15.24 — SideNav has Projects entry that lands on /projects', async ({ page }) => {
  await page.goto(`${BASE}/start`);
  await page.waitForLoadState('domcontentloaded');
  await page.getByTestId('sidenav-projects').click();
  await page.waitForURL(/\/projects$/);
  await page.waitForSelector('[data-testid="project-list-panel"]', { timeout: 5000 });
});
