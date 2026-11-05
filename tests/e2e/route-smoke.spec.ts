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
  // Backend not running in CI — expected.
  // 503 是 Node 网关对 legacy Python 的 proxyFallback：e2e 只起 npm run dev
  // --no-python（不为一个退役服务在 runner 上装整套 pip 依赖），所以 /api/legacy/*
  // 必然 503。这条仅放行「资源加载失败」本身，ErrorBoundary 断言照旧生效。
  'ERR_CONNECTION_REFUSED',
  'net::ERR',
  'status of 503',
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

    // waitUntil 固定用 domcontentloaded：默认的 'load' 会等所有子资源，
    // 而页面引了 fonts.googleapis.com 的样式表 —— 外网一抖动（或用 tunnel
    // 跑 CI）整条用例就卡到超时，红的却不是我们的代码。
    await page.goto(path, { waitUntil: 'domcontentloaded' });

    // 但 domcontentloaded 只保证 HTML 到了，React 可能还没挂载。不先等挂载，
    // 下面「不含错误文案」会因为 #root 是空的而假通过，门禁就形同虚设。
    await page.waitForFunction(
      () => (document.querySelector('#root')?.childElementCount ?? 0) > 0,
      undefined,
      { timeout: 15_000 },
    );

    // ErrorBoundary must NOT have caught anything
    await expect(page.locator('#root')).not.toContainText(ERROR_BOUNDARY_TEXT);

    // No unallowlisted JS errors
    expect(jsErrors, `JS errors on ${path}: ${jsErrors.join(' | ')}`).toHaveLength(0);
  });
}
