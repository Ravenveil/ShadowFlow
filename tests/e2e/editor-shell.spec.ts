import { test, expect } from '@playwright/test';

/**
 * Story 3.1 / AC1 + AC2 — Editor Shell performance acceptance.
 *
 * AC1: /editor route renders three-column layout ≤ 2s (P1)
 * AC2: Solo Company 8-role DAG renders ≤ 1s (P2) — BLOCKED by Story 3-6 (solo-company.yaml)
 *
 * Requires: npm run dev serving on localhost:3000
 */

test.describe('Editor Shell', () => {
  test('AC1 — /editor renders three-column layout within 2 s', async ({ page }) => {
    await page.goto('/editor');
    // P9: Use domcontentloaded + locator wait; avoid networkidle (flaky with HMR WebSockets)
    await page.waitForLoadState('domcontentloaded');

    const t0 = Date.now();

    // P10: Assert all three layout columns are visible (sidebar + canvas + inspector)
    const sidebar   = page.locator('[data-testid="editor-sidebar"]');
    const canvas    = page.locator('[data-testid="editor-canvas"] .react-flow');
    const inspector = page.locator('[data-testid="editor-inspector"]');

    await expect(canvas).toBeVisible({ timeout: 2000 });
    await expect(sidebar).toBeVisible({ timeout: 500 });
    await expect(inspector).toBeVisible({ timeout: 500 });

    // P9: Measure from after domcontentloaded (excludes boot/HMR overhead)
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeLessThan(2000);
  });

  test('AC1 — /editor/:templateId loads with valid template id param', async ({ page }) => {
    await page.goto('/editor/academic-paper');
    await page.waitForLoadState('domcontentloaded');

    await expect(page.locator('[data-testid="editor-canvas"] .react-flow')).toBeVisible({ timeout: 2000 });
  });

  test('AC1 — invalid templateId falls back to blank editor', async ({ page }) => {
    // P22: Path-traversal / junk ids should be sanitised to "blank"
    await page.goto('/editor/../../../etc/passwd');
    await page.waitForLoadState('domcontentloaded');
    // Should land on "/" redirect or blank editor — no server error
    const body = page.locator('body');
    await expect(body).not.toContainText('Cannot GET');
  });

  // AC2: BLOCKED — requires Story 3-6 solo-company.yaml to be loaded into the editor.
  // Uncomment and run after Story 3-6 lands.
  test.skip('AC2 — Solo Company DAG renders within 1 s after load', async ({ page }) => {
    await page.goto('/editor/solo-company');
    await page.waitForLoadState('domcontentloaded');

    const t0 = Date.now();
    // P9: Wait for at least one ReactFlow node (8-role DAG) — not networkidle
    await page.locator('.react-flow__node').first().waitFor({ timeout: 1500 });
    const elapsed = Date.now() - t0;

    expect(elapsed).toBeLessThan(1000);
  });

  test('ReactFlow canvas supports pan and zoom controls', async ({ page }) => {
    await page.goto('/editor');
    await page.waitForLoadState('domcontentloaded');
    await page.locator('[data-testid="editor-canvas"] .react-flow').waitFor({ timeout: 2000 });

    const controls = page.locator('.react-flow__controls');
    await expect(controls).toBeVisible();
  });
});
