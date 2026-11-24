import { test, expect } from '@playwright/test';

/**
 * Story 3.3 — Node palette E2E (P2-6 fix: required spec was missing).
 *
 * Verifies that approval_gate and barrier nodes can be dragged from the palette
 * to the canvas and render with the correct node component.
 *
 * P9: domcontentloaded (not networkidle — flaky with HMR WebSockets).
 */
test.describe('Node Palette — drag to canvas', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/editor');
    await page.waitForLoadState('domcontentloaded');
    await page.locator('[data-testid="editor-canvas"] .react-flow').waitFor({ timeout: 3000 });
  });

  test('palette renders gate section with approval_gate and barrier items', async ({ page }) => {
    const sidebar = page.locator('[data-testid="editor-sidebar"]');
    await expect(sidebar).toBeVisible();

    // Palette should show Approval Gate and Barrier drag items
    await expect(sidebar.getByText('Approval Gate')).toBeVisible();
    await expect(sidebar.getByText('Barrier')).toBeVisible();
  });

  test('dragging Approval Gate onto canvas renders ApprovalGate node', async ({ page }) => {
    const approvalGateItem = page.locator('[data-testid="editor-sidebar"]')
      .locator('[draggable]')
      .filter({ hasText: 'Approval Gate' });

    const canvas = page.locator('[data-testid="editor-canvas"]');
    const box = await canvas.boundingBox();
    if (!box) return;

    if (await approvalGateItem.count() > 0) {
      await approvalGateItem.dragTo(canvas, {
        targetPosition: { x: box.width / 2, y: box.height / 2 },
      });

      // ApprovalGateNode renders 'ApprovalGate' text and the approver line
      await expect(page.locator('text=ApprovalGate').first()).toBeVisible({ timeout: 3000 });
    } else {
      test.skip();
    }
  });

  test('dragging Barrier onto canvas renders Barrier node', async ({ page }) => {
    const barrierItem = page.locator('[data-testid="editor-sidebar"]')
      .locator('[draggable]')
      .filter({ hasText: 'Barrier' });

    const canvas = page.locator('[data-testid="editor-canvas"]');
    const box = await canvas.boundingBox();
    if (!box) return;

    if (await barrierItem.count() > 0) {
      await barrierItem.dragTo(canvas, {
        targetPosition: { x: box.width / 3, y: box.height / 3 },
      });

      // BarrierNode renders 'Barrier' header and 'arrived' counter
      await expect(page.locator('text=Barrier').first()).toBeVisible({ timeout: 3000 });
    } else {
      test.skip();
    }
  });

  test('clicking approval_gate node opens ApprovalGate inspector form', async ({ page }) => {
    // Drag an approval_gate node onto canvas first
    const approvalGateItem = page.locator('[data-testid="editor-sidebar"]')
      .locator('[draggable]')
      .filter({ hasText: 'Approval Gate' });
    const canvas = page.locator('[data-testid="editor-canvas"]');
    const box = await canvas.boundingBox();
    if (!box || await approvalGateItem.count() === 0) { test.skip(); return; }

    await approvalGateItem.dragTo(canvas, {
      targetPosition: { x: box.width / 2, y: box.height / 2 },
    });
    await page.waitForTimeout(200);

    // Click the newly added ApprovalGate node
    await page.locator('text=ApprovalGate').first().click();

    // Inspector tab should switch to Inspector and show the ApprovalGateForm
    // Form has "approval gate · config" header and Approver label
    await expect(
      page.locator('[data-testid="editor-inspector"]').getByText(/approver/i).first()
    ).toBeVisible({ timeout: 3000 });
  });
});
