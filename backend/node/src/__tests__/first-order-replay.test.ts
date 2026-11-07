/**
 * first-order-replay.test.ts — 「第一单一键复现」脚本的离线契约测试（2026-11-06）。
 *
 * 不启动 dev 栈：真实 Express Router + 真实 SQLite（临时 cwd 隔离）挂在一个随机
 * 端口的本地 HTTP server 上，脚本以**子进程真跑 CLI**（裸 node，默认 dry-run /
 * --apply / --json / --token），从两面断言：
 *   - HTTP 层：调用序列、写端点、Authorization 透传、错误传播；
 *   - --json 输出：计划 dry-run → 建商品/埋点/下单/支付 → 第一单五步 → 看板 →
 *     账实 → 证据包，以及显式 trace-id 的幂等短路。
 *
 * 为什么子进程而不是 import()（2026-11-07，缺口⑥）：vitest 会把非 node_modules
 * 的 .mjs 强制塞进 vite-node SSR 转换（inline 判定先于 external，externals 配置
 * 救不了），Windows 下 file:// URL 动态导入有历史故障面；且脚本靠 import.meta.url
 * 判别 CLI。子进程用裸 node 执行，与 `node scripts/first-order-replay.mjs` 生产
 * 用法同语义，脏参数的退出码/报错文案也在真实入口上钉死。
 *
 * 用例顺序即库状态契约：overview 是全局口径，「五步链路」对全局数字的精确断言
 * 必须落在库最干净时（默认金额 19900/4300 就在这条里被钉死）；后续带显式金额的
 * 用例断「跑前跑后差值」，且金额映射只在「无商品时新建商品」生效——要钉显式
 * 金额得先四表成套清干净（见「两种写法」用例），别让前序商品复用掩盖映射错误。
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';

// 模块加载时捕获仓库根（beforeAll 会把 cwd 切到临时库）。
// 2026-11 repo 拆分：从本文件位置锚定（backend/node/src/__tests__ → 上爬 4 级），
// 不再依赖调用方 cwd。
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'first-order-replay.mjs');

interface ReplayResult {
  ok: boolean;
  dry_run: boolean;
  reused?: boolean;
  base_url?: string;
  trace_id?: string;
  plan?: Array<{ step: string; write: boolean }>;
  steps?: Array<{ step: string; method?: string; path?: string; ok: boolean; note?: string }>;
  checks?: {
    first_order: { complete: boolean; chain: string[]; order_id: string | null };
    overview: { paid_orders: number; revenue_cents: number; gross_profit_cents: number };
    reconcile: { balanced: boolean; issues: string[] };
    evidence: { schema_version: string; first_order_complete: boolean };
  };
}

interface CliResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

let tmp: string;
let origCwd: string;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let router: typeof import('../routes/dashboard/merchant-board').default;
let sqlite: typeof import('../storage/sqlite');
let server: ReturnType<express.Express['listen']>;
let baseUrl = '';
/** 本测试窗口内打到服务端的请求（HTTP 层观察点）。 */
let calls: Array<{ method: string; path: string; headers: Record<string, string> }> = [];
/** 挂上即强制某些请求返回 409，验证脚本不伪装成功。 */
let failOn: ((method: string, pathname: string) => boolean) | null = null;

function buildApp() {
  const a = express();
  a.use(express.json());
  a.use((req, res, next) => {
    calls.push({
      method: req.method,
      path: req.path,
      headers: req.headers as Record<string, string>,
    });
    if (failOn?.(req.method, req.path)) {
      res.status(409).json({ error: { message: 'forced conflict' } });
      return;
    }
    next();
  });
  a.use('/api/merchant', router);
  return a;
}

/**
 * 子进程真跑 CLI；不 throw —— 调用方按 status/stderr 断言成功与失败两种形态。
 *
 * 必须异步 spawn（不能 spawnSync）：脚本会 HTTP 回调本进程的 express 测试服务，
 * 同步 spawn 阻塞事件循环 = 服务端永远不应答 = 子进程挂死。
 */
function runCli(args: string[], env?: Record<string, string>): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SCRIPT, ...args], {
      cwd: REPO_ROOT,
      env: env ? { ...process.env, ...env } : process.env,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (d: string) => { stdout += d; });
    child.stderr.on('data', (d: string) => { stderr += d; });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`CLI 超时：${args.join(' ')}`));
    }, 120000);
    child.on('error', (err) => { clearTimeout(timer); reject(err); });
    child.on('close', (status) => {
      clearTimeout(timer);
      resolve({ status, stdout, stderr });
    });
  });
}

/** --json 输出直接是 JSON；防御性地从第一个 '{' 开始解析。 */
function parseJson(result: CliResult): ReplayResult {
  const start = result.stdout.indexOf('{');
  if (start < 0) throw new Error(`CLI 没有输出 JSON：${result.stdout.slice(0, 200)}`);
  return JSON.parse(result.stdout.slice(start)) as ReplayResult;
}

function orderCount(): number {
  // merchant-board 的 DDL 是首次请求时才跑的；dry-run 没发过请求，表可能还不存在。
  const conn = sqlite.getDb();
  const exists = conn.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='mb_orders'").get();
  if (!exists) return 0;
  return (conn.prepare('SELECT COUNT(*) AS n FROM mb_orders').get() as { n: number }).n;
}

/** 直接问服务端要全局口径，用于「差值」断言（金额映射契约）。 */
async function overviewCents(): Promise<{ revenue: number; gross: number }> {
  // 观察点与脚本同凭据：router 的 token 守卫按 SF_API_TOKEN env 生效，
  // 测试窗口内设了 token 就必须带 Bearer，否则自己先 401。
  const token = process.env.SF_API_TOKEN;
  const res = await fetch(`${baseUrl}/api/merchant/overview`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const body = (await res.json()) as { revenue_cents?: number; gross_profit_cents?: number };
  if (typeof body.revenue_cents !== 'number' || typeof body.gross_profit_cents !== 'number') {
    throw new Error(`overview 响应形态异常：HTTP ${res.status} ${JSON.stringify(body).slice(0, 300)}`);
  }
  return { revenue: body.revenue_cents, gross: body.gross_profit_cents };
}

beforeAll(async () => {
  origCwd = process.cwd();
  tmp = mkdtempSync(path.join(tmpdir(), 'sf-replay-'));
  process.chdir(tmp);
  sqlite = await import('../storage/sqlite');
  sqlite._resetForTests();
  router = (await import('../routes/dashboard/merchant-board')).default;
  sqlite.getDb();
  server = buildApp().listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  try { server?.close(); } catch { /* ignore */ }
  process.chdir(origCwd);
  try {
    rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* Windows 临时目录偶发 EBUSY，忽略即可 */
  }
});

describe('first-order-replay CLI 参数', () => {
  it('默认 dry-run，且不读环境变量以外的隐式写入', async () => {
    calls = [];
    const r = await runCli(['--json']);
    expect(r.status).toBe(0);
    const result = parseJson(r);
    expect(result.ok).toBe(true);
    expect(result.dry_run).toBe(true);
    expect(result.base_url).toBe('http://127.0.0.1:8002');
    expect(result.trace_id).toMatch(/^sf-replay-/);
    expect(result.plan).toHaveLength(8);
    expect(result.plan?.filter((s) => s.write)).toHaveLength(4);
  });

  it('脏参数不静默吞掉：非法 URL / 非整数金额 / 未知开关都报错', async () => {
    const cases: Array<[string[], RegExp]> = [
      [['--base-url=not-a-url'], /合法 URL/],
      [['--base-url=ftp://x'], /http\/https/],
      [['--price-cents=-1'], /非负整数/],
      [['--bogus'], /未知参数/],
      [['--token'], /缺少参数值/],
    ];
    for (const [args, re] of cases) {
      const r = await runCli(args);
      expect(r.status, `${args.join(' ')} 应退出 2`).toBe(2);
      expect(r.stderr).toMatch(re);
    }
  });
});

describe('first-order-replay 链路', () => {
  it('dry-run 只给计划，不发任何请求、不写库', async () => {
    calls = [];
    const r = await runCli(['--json', `--base-url=${baseUrl}`]);
    expect(r.status).toBe(0);
    const result = parseJson(r);
    expect(result.ok).toBe(true);
    expect(result.dry_run).toBe(true);
    expect(result.plan).toHaveLength(8);
    expect(result.plan?.filter((s) => s.write)).toHaveLength(4);
    expect(calls).toHaveLength(0);
    expect(orderCount()).toBe(0);
  });

  it('--apply 跑通五步链路，看板/账实/证据包三处口径一致（默认金额 19900/4300）', async () => {
    calls = [];
    const r = await runCli(['--apply', '--json', `--base-url=${baseUrl}`, '--trace-id=sf-replay-main']);
    expect(r.status).toBe(0);
    const result = parseJson(r);
    expect(result.ok).toBe(true);
    expect(result.reused).toBe(false);
    expect(result.checks?.first_order.complete).toBe(true);
    expect(result.checks?.first_order.chain).toEqual([
      'visit_landed', 'order_created', 'order_paid', 'ledger_income', 'dashboard_visible',
    ]);
    expect(result.checks?.first_order.order_id).toBeTruthy();
    expect(result.checks?.overview.paid_orders).toBe(1);
    expect(result.checks?.overview.revenue_cents).toBe(19900);
    expect(result.checks?.overview.gross_profit_cents).toBe(19900 - 4300);
    expect(result.checks?.reconcile.balanced).toBe(true);
    expect(result.checks?.evidence.first_order_complete).toBe(true);
    expect(result.checks?.evidence.schema_version).toBe('evidence-1');
    const paths = calls.map((c) => `${c.method} ${c.path}`);
    expect(paths).toContain('POST /api/merchant/visits');
    expect(paths).toContain('POST /api/merchant/orders');
    expect(paths.some((p) => p.startsWith('POST /api/merchant/orders/') && p.endsWith('/pay'))).toBe(true);
    expect(paths).toContain('GET /api/merchant/evidence');
    expect(orderCount()).toBe(1);
  });

  it('显式 trace-id 重跑走幂等短路，不新增订单，仍然完成全部校验', async () => {
    const before = orderCount();
    calls = [];
    const r = await runCli(['--apply', '--json', `--base-url=${baseUrl}`, '--trace-id=sf-replay-main']);
    expect(r.status).toBe(0);
    const result = parseJson(r);
    expect(result.ok).toBe(true);
    expect(result.reused).toBe(true);
    expect(result.steps?.some((s) => s.step === 'write_skipped')).toBe(true);
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);
    expect(result.checks?.reconcile.balanced).toBe(true);
    expect(orderCount()).toBe(before);
  });

  it('支持 --k=v / --k v 两种写法：金额映射按差值钉死，token 空格写法 Bearer 透传', async () => {
    // price-cents/cost-cents 只在「无商品时新建商品」生效（plan 原文：有商品就复用）。
    // 前序用例已建默认价商品，先四表成套清干净（账实对账必须 balanced），显式金额
    // 才走新建商品路径，差值才能钉在 8800 / (8800-1200)。
    const conn = sqlite.getDb();
    for (const t of ['mb_ledger', 'mb_orders', 'mb_visits', 'mb_products']) {
      conn.prepare(`DELETE FROM ${t}`).run();
    }
    process.env.SF_API_TOKEN = 'tk-1';
    try {
      const before = await overviewCents();
      calls = [];
      const r = await runCli([
        '--apply', '--json', `--base-url=${baseUrl}/`,
        '--token', 'tk-1', '--trace-id=sf-demo-1106', '--price-cents=8800', '--cost-cents', '1200',
      ]);
      expect(r.status).toBe(0);
      const result = parseJson(r);
      expect(result.ok).toBe(true);
      expect(result.trace_id).toBe('sf-demo-1106');
      // 尾斜杠被规范掉。
      expect(result.base_url).toBe(baseUrl);
      // 显式金额进账：营收 +8800、毛利 +(8800-1200)。
      const after = await overviewCents();
      expect(after.revenue - before.revenue).toBe(8800);
      expect(after.gross - before.gross).toBe(8800 - 1200);
      expect(calls.length).toBeGreaterThan(0);
      expect(calls.every((c) => c.headers.authorization === 'Bearer tk-1')).toBe(true);
    } finally {
      delete process.env.SF_API_TOKEN;
    }
  });

  it('任意一步 HTTP 非 2xx 就明确上抛，不伪装成链路成功', async () => {
    failOn = (method, pathname) => method === 'POST' && /\/pay$/.test(pathname);
    try {
      const r = await runCli(['--apply', '--json', `--base-url=${baseUrl}`, '--trace-id=sf-replay-fail']);
      expect(r.status).toBe(1);
      expect(r.stderr).toMatch(/HTTP 409/);
    } finally {
      failOn = null;
    }
  });
});
