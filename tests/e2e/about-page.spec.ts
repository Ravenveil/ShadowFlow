import { test, expect } from '@playwright/test';

const VS_IDS = [
  'chatgpt',
  'cherry-studio',
  'n8n',
  'langgraph',
  'autogen',
  'crewai',
  'edict',
  'aiverse',
  'dify',
];

test.describe('AboutPage', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/about');
    await page.waitForLoadState('domcontentloaded');
  });

  test('[smoke] /about renders without crash or ErrorBoundary', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', err => jsErrors.push(err.message));
    await expect(page.locator('#root')).not.toContainText('组件加载出错');
    expect(jsErrors).toHaveLength(0);
  });

  test('[AC1] sticky nav has 3 anchor buttons', async ({ page }) => {
    const nav = page.getByRole('navigation', { name: '页面内导航' });
    await expect(nav.getByRole('button', { name: '差异化对比' })).toBeVisible();
    await expect(nav.getByRole('button', { name: '链上证据' })).toBeVisible();
    await expect(nav.getByRole('button', { name: '路线图' })).toBeVisible();
  });

  test('[AC1] all 9 vs-X accordion items exist and are clickable', async ({ page }) => {
    for (const id of VS_IDS) {
      const btn = page.locator(`#vs-btn-${id}`);
      await expect(btn).toBeVisible();
      await expect(btn).toHaveAttribute('aria-expanded', 'false');
    }
  });

  test('[AC1] clicking each accordion item reveals detail content ≥ 100 chars', async ({ page }) => {
    for (const id of VS_IDS) {
      const btn = page.locator(`#vs-btn-${id}`);
      const panel = page.locator(`#vs-panel-${id}`);

      // Initially hidden
      await expect(btn).toHaveAttribute('aria-expanded', 'false');

      // Click to open
      await btn.click();
      await expect(btn).toHaveAttribute('aria-expanded', 'true');

      // Panel is visible and has substantial content
      const text = await panel.innerText();
      expect(text.length, `Panel ${id} content too short`).toBeGreaterThanOrEqual(100);

      // Click again to close
      await btn.click();
      await expect(btn).toHaveAttribute('aria-expanded', 'false');
    }
  });

  test('[AC1] Enter key opens accordion, Escape key closes it', async ({ page }) => {
    const btn = page.locator('#vs-btn-chatgpt');

    await btn.focus();
    await page.keyboard.press('Enter');
    await expect(btn).toHaveAttribute('aria-expanded', 'true');

    await page.keyboard.press('Escape');
    await expect(btn).toHaveAttribute('aria-expanded', 'false');
  });

  test('[AC1] QuadrantChart is visible in differentiation section', async ({ page }) => {
    const chart = page.locator('#differentiation svg[role="img"]');
    await expect(chart).toBeVisible();
    // ShadowFlow dot should be labeled
    await expect(chart).toContainText('ShadowFlow');
  });

  test('[AC2] onchain section renders CID card with Explorer link', async ({ page }) => {
    const onchainSection = page.locator('#onchain');
    await expect(onchainSection).toBeVisible();

    // Explorer link exists and points to 0G
    const explorerLink = onchainSection.locator('a[href*="0g"]');
    await expect(explorerLink).toBeVisible();
    const href = await explorerLink.getAttribute('href');
    expect(href).toMatch(/chainscan|0g\.ai/);

    // Merkle Root, archive time, author lineage all present
    await expect(onchainSection).toContainText('Merkle Root');
    await expect(onchainSection).toContainText('归档时间');
    await expect(onchainSection).toContainText('Author Chain');
    await expect(onchainSection).toContainText('Academic Paper');
  });

  test('[AC3] roadmap section shows 3 phases', async ({ page }) => {
    const roadmapSection = page.locator('#roadmap');
    await expect(roadmapSection).toContainText('Phase 1');
    await expect(roadmapSection).toContainText('Phase 2');
    await expect(roadmapSection).toContainText('Phase 3');
    await expect(roadmapSection).toContainText('MVP Done');
    await expect(roadmapSection).toContainText('INFT Marketplace');
  });

  test('[AC3] academic citations section shows 5 papers with external links', async ({ page }) => {
    const roadmapSection = page.locator('#roadmap');
    const paperLinks = roadmapSection.locator('a[href*="arxiv"], a[href*="aclanthology"]');
    const count = await paperLinks.count();
    expect(count, 'Should have 5 academic paper links').toBeGreaterThanOrEqual(5);
  });

  test('[AC3] footer CTA buttons navigate correctly', async ({ page }) => {
    const editorBtn = page.getByRole('button', { name: '▶ 打开编辑器' }).last();
    await editorBtn.click();
    await expect(page).toHaveURL('/editor');
  });
});
