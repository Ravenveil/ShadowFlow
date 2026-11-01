import { test, expect } from '@playwright/test';

/**
 * Route smoke tests — every public route must render without a JS crash.
 *
 * Gate: React ErrorBoundary must NOT catch anything on these routes.
 * Added after 2026-04-23 incident: /editor blew up with "zh is not defined"
 * (EditorPage.tsx RunButton missing `const zh = lang === 'CN'`), but CI
 * never caught it because Playwright wasn't wired into the pipeline.
 */

const ROUTES = [
  { path: '/',                    label: 'Landing'          },
  { path: '/editor',              label: 'Editor (blank)'   },
  { path: '/editor/academic-paper', label: 'Editor (template)' },
  { path: '/templates',           label: 'Templates'        },
  { path: '/import',              label: 'Import by CID'    },
  { path: '/about',               label: 'About'             },
];

const ERROR_BOUNDARY_TEXT = '组件加载出错';
const CONSOLE_ERROR_ALLOWLIST = [
  // React Router v7 future-flag warnings — non-blocking, tracked separately
  'v7_startTransition',
  'v7_relativeSplatPath',
  // Backend not running in CI — expected
  'ERR_CONNECTION_REFUSED',
  'net::ERR',
  '404',
];

function isAllowlisted(msg: string): boolean {
  return CONSOLE_ERROR_ALLOWLIST.some(s => msg.includes(s));
}

for (const { path, label } of ROUTES) {
  test(`[smoke] ${label} — no crash, no ErrorBoundary`, async ({ page }) => {
    const jsErrors: string[] = [];

    page.on('pageerror', err => {
      jsErrors.push(err.message);
    });

    page.on('console', msg => {
      if (msg.type() === 'error' && !isAllowlisted(msg.text())) {
        jsErrors.push(`[console.error] ${msg.text()}`);
      }
    });

    await page.goto(path);
    await page.waitForLoadState('domcontentloaded');

    // ErrorBoundary must NOT have caught anything
    await expect(page.locator('#root')).not.toContainText(ERROR_BOUNDARY_TEXT);

    // No unallowlisted JS errors
    expect(jsErrors, `JS errors on ${path}: ${jsErrors.join(' | ')}`).toHaveLength(0);
  });
}
