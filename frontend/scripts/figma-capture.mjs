#!/usr/bin/env node
/**
 * figma-capture.mjs — 用 Playwright 把本地运行中的页面抓成 Figma 图层。
 *
 * 对应 Figma「Code to Canvas」本地流程（Step 1B）：页面必须加载
 *   https://mcp.figma.com/mcp/html-to-design/capture.js
 * 并从 URL hash（#figmacapture=…&figmaendpoint=…&figmadelay=…）读取参数自动提交。
 *
 * 本脚本不修改应用源码：用 Playwright 拦截文档响应，在 </head> 前注入该
 * script 标签，再带 hash 打开目标页。这样既满足官方契约，又不给 Vite 的
 * index.html 留测试代码。
 *
 * 用法（cwd 需在 frontend/，因为 playwright 装在那里）：
 *   node scripts/figma-capture.mjs <captureId> [url] [outDir]
 */
import { chromium } from 'playwright';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** 项目里的 playwright 期望的浏览器版本可能没装；回落到本机已有的 chromium 构建。 */
function resolveChromium() {
  if (process.env.FIGMA_CHROME) return process.env.FIGMA_CHROME;
  const root = join(process.env.LOCALAPPDATA ?? '', 'ms-playwright');
  if (!existsSync(root)) return undefined;
  const builds = readdirSync(root)
    .filter((d) => /^chromium-\d+$/.test(d))
    .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
  for (const b of builds) {
    const exe = join(root, b, 'chrome-win64', 'chrome.exe');
    if (existsSync(exe)) return exe;
  }
  return undefined;
}

const CAPTURE_ID = process.argv[2];
const URL_ARG = process.argv[3] ?? 'http://localhost:3007';
if (!CAPTURE_ID) {
  console.error('用法: node scripts/figma-capture.mjs <captureId> [url]');
  process.exit(2);
}

const endpoint = `https://mcp.figma.com/mcp/capture/${CAPTURE_ID}/submit?bindVariables=true`;
const hash =
  `#figmacapture=${CAPTURE_ID}` +
  `&figmaendpoint=${encodeURIComponent(endpoint)}` +
  `&figmadelay=${process.env.FIGMA_DELAY ?? 1500}`;
const target = `${URL_ARG.replace(/#.*$/, '')}${hash}`;

const browser = await chromium.launch({ headless: true, executablePath: resolveChromium() });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // 文档响应：剥掉 CSP 并注入 capture.js（其余请求原样放行）
  await page.route('**/*', async (route) => {
    const req = route.request();
    if (req.resourceType() !== 'document') return route.continue();
    const res = await route.fetch();
    const headers = { ...res.headers() };
    delete headers['content-security-policy'];
    delete headers['content-security-policy-report-only'];
    let body = await res.text();
    const tag = '<script src="https://mcp.figma.com/mcp/html-to-design/capture.js" async></script>';
    if (body.includes('</head>')) body = body.replace('</head>', `${tag}</head>`);
    else body = tag + body;
    await route.fulfill({ status: res.status(), headers, body });
  });

  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  page.on('console', (m) => {
    const t = m.text();
    if (/figma|capture/i.test(t)) console.log('  [page]', t.slice(0, 220));
  });

  console.log(`打开 ${URL_ARG}（captureId=${CAPTURE_ID}）`);
  await page.goto(target, { waitUntil: 'load', timeout: 60000 });
  // 等 Vite 首屏渲染 + 字体就位，官方默认 delay 是 1000ms，这里给足
  await page.waitForTimeout(4000);

  const hasCapture = await page.evaluate(() => typeof window.figma?.captureForDesign === 'function');
  console.log('capture.js 就绪:', hasCapture);

  if (!hasCapture) {
    console.error('未检测到 window.figma.captureForDesign，capture.js 可能被网络拦截');
    if (errors.length) console.error('页面错误:', errors.slice(0, 3));
    process.exit(1);
  }

  // 官方脚本会依据 URL hash 自动抓取并提交（figmadelay 之后）。这里只等待，
  // 不再手动调 captureForDesign——两条路径同时跑会让页面 evel 的 promise 被回收。
  console.log('等待自动抓取与提交（约 12s）…');
  await page.waitForTimeout(12000);
  console.log('页面仍存活:', !page.isClosed());
} finally {
  await browser.close();
}
