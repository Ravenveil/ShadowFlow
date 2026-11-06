/**
 * first-order-replay.test.ts — 「第一单一键复现」脚本的离线契约测试（2026-11-06）。
 *
 * 不启动 dev 栈、不另起端口：真实 Express Router + 真实 SQLite（临时 cwd 隔离），
 * 把脚本的 fetch 注入成 supertest 客户端，因此能完整验证
 *   计划 dry-run → 建商品/埋点/下单/支付 → 第一单五步 → 看板 → 账实 → 证据包
 * 这条链，以及幂等短路、token 透传、HTTP 错误上抛。
 *
 * 脚本是 .mjs（Node 原生 fetch，不想给它套 TS/tsx 运行链），测试用 file:// URL
 * 动态导入，避免 tsc 在 CommonJS 模式下解析 ESM 声明。
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

interface FetchLike {
  status: number;
  ok?: boolean;
  json?: () => Promise<unknown>;
  text?: () => Promise<string>;
}

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

interface ReplayModule {
  DEFAULT_BASE_URL: string;
  SCRIPT_NAME: string;
  parseArgs(argv?: string[]): {
    baseUrl: string;
    token: string;
    apply: boolean;
    json: boolean;
    help: boolean;
    traceId: string;
    priceCents: number;
    costCents: number;
    explicitTraceId: boolean;
  };
  planSteps(traceId: string): Array<{ step: string; write: boolean }>;
  replay(options?: Record<string, unknown>): Promise<ReplayResult>;
}

let tmp: string;
let origCwd: string;
let mod: ReplayModule;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let router: typeof import('../routes/merchant-board').default;
let sqlite: typeof import('../storage/sqlite');

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/merchant', router);
  return a;
}

/** 把脚本里的 fetch 接到临时库的真 Express Router 上，顺便记录调用与 header。 */
function fakeFetch(failOn?: (method: string, pathname: string) => boolean) {
  const calls: string[] = [];
  const headersSeen: Array<Record<string, string>> = [];
  const fetchImpl = async (url: string, init: Record<string, any> = {}): Promise<FetchLike> => {
    const u = new URL(url);
    const method = String(init.method ?? 'GET').toUpperCase();
    calls.push(`${method} ${u.pathname}`);
    headersSeen.push((init.headers ?? {}) as Record<string, string>);
    if (failOn?.(method, u.pathname)) {
      return { status: 409, ok: false, json: async () => ({ error: { message: 'forced conflict' } }) };
    }
    let r = (request(app()) as any)[method.toLowerCase()](u.pathname + u.search);
    for (const [k, v] of Object.entries((init.headers ?? {}) as Record<string, string>)) {
      r = r.set(k, String(v));
    }
    if (init.body !== undefined) r = r.send(JSON.parse(String(init.body)));
    const res = await r;
    const status = Number(res.status);
    return {
      status,
      ok: status >= 200 && status < 300,
      json: async () => res.body,
      text: async () => res.text,
    };
  };
  return { fetchImpl, calls, headersSeen };
}

function orderCount(): number {
  // merchant-board 的 DDL 是首次请求时才跑的；dry-run 没发过请求，表可能还不存在。
  const conn = sqlite.getDb();
  const exists = conn.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='mb_orders'").get();
  if (!exists) return 0;
  return (conn.prepare('SELECT COUNT(*) AS n FROM mb_orders').get() as { n: number }).n;
}

beforeAll(async () => {
  origCwd = process.cwd();
  tmp = mkdtempSync(path.join(tmpdir(), 'sf-replay-'));
  process.chdir(tmp);
  sqlite = await import('../storage/sqlite');
  sqlite._resetForTests();
  router = (await import('../routes/merchant-board')).default;
  sqlite.getDb();
  const scriptUrl = pathToFileURL(path.join(origCwd, 'scripts', 'first-order-replay.mjs')).href;
  mod = (await import(scriptUrl)) as unknown as ReplayModule;
});

afterAll(() => {
  process.chdir(origCwd);
  try {
    rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* Windows 临时目录偶发 EBUSY，忽略即可 */
  }
});

describe('first-order-replay CLI 参数', () => {
  it('默认 dry-run，且不读环境变量以外的隐式写入', () => {
    const opts = mod.parseArgs([]);
    expect(opts.apply).toBe(false);
    expect(opts.json).toBe(false);
    expect(opts.baseUrl).toBe(mod.DEFAULT_BASE_URL);
    expect(opts.priceCents).toBe(19900);
    expect(opts.costCents).toBe(4300);
    expect(opts.explicitTraceId).toBe(false);
  });

  it('支持 --k=v / --k v 两种写法与显式 trace-id 幂等标记', () => {
    const opts = mod.parseArgs([
      '--apply', '--json', '--base-url=http://127.0.0.1:8002/',
      '--token', 'tk-1', '--trace-id=sf-demo-1106', '--price-cents=8800', '--cost-cents', '1200',
    ]);
    expect(opts.apply).toBe(true);
    expect(opts.json).toBe(true);
    expect(opts.baseUrl).toBe('http://127.0.0.1:8002');
    expect(opts.token).toBe('tk-1');
    expect(opts.traceId).toBe('sf-demo-1106');
    expect(opts.explicitTraceId).toBe(true);
    expect(opts.priceCents).toBe(8800);
    expect(opts.costCents).toBe(1200);
  });

  it('脏参数不静默吞掉：非法 URL / 非整数金额 / 未知开关都报错', () => {
    expect(() => mod.parseArgs(['--base-url=not-a-url'])).toThrow(/合法 URL/);
    expect(() => mod.parseArgs(['--base-url=ftp://x'])).toThrow(/http\/https/);
    expect(() => mod.parseArgs(['--price-cents=-1'])).toThrow(/非负整数/);
    expect(() => mod.parseArgs(['--bogus'])).toThrow(/未知参数/);
    expect(() => mod.parseArgs(['--token'])).toThrow(/缺少参数值/);
  });
});

describe('first-order-replay 链路', () => {
  it('dry-run 只给计划，不发任何请求、不写库', async () => {
    const { fetchImpl, calls } = fakeFetch(() => {
      throw new Error('dry-run 不该发请求');
    });
    const result = await mod.replay({ apply: false, fetchImpl, traceId: 'sf-dry' });
    expect(result.ok).toBe(true);
    expect(result.dry_run).toBe(true);
    expect(result.plan).toHaveLength(8);
    expect(result.plan?.filter((s) => s.write)).toHaveLength(4);
    expect(calls).toHaveLength(0);
    expect(orderCount()).toBe(0);
  });

  it('--apply 跑通五步链路，看板/账实/证据包三处口径一致', async () => {
    const { fetchImpl, calls } = fakeFetch();
    const result = await mod.replay({
      apply: true,
      fetchImpl,
      baseUrl: 'http://127.0.0.1:8002',
      traceId: 'sf-replay-main',
      priceCents: 19900,
      costCents: 4300,
    });
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
    expect(calls).toContain('POST /api/merchant/visits');
    expect(calls).toContain('POST /api/merchant/orders');
    expect(calls.some((c) => c.startsWith('POST /api/merchant/orders/') && c.endsWith('/pay'))).toBe(true);
    expect(calls).toContain('GET /api/merchant/evidence');
    expect(orderCount()).toBe(1);
  });

  it('显式 trace-id 重跑走幂等短路，不新增订单，仍然完成全部校验', async () => {
    const before = orderCount();
    const { fetchImpl, calls } = fakeFetch();
    const result = await mod.replay({
      apply: true,
      fetchImpl,
      traceId: 'sf-replay-main',
      explicitTraceId: true,
    });
    expect(result.ok).toBe(true);
    expect(result.reused).toBe(true);
    expect(result.steps?.some((s) => s.step === 'write_skipped')).toBe(true);
    expect(calls.filter((c) => c.startsWith('POST'))).toHaveLength(0);
    expect(result.checks?.reconcile.balanced).toBe(true);
    expect(orderCount()).toBe(before);
  });

  it('token 以 Bearer 透传，写端点在设置了 token 时也能通过', async () => {
    process.env.SF_API_TOKEN = 'tk-test';
    try {
      const { fetchImpl, headersSeen } = fakeFetch();
      const result = await mod.replay({
        apply: true,
        fetchImpl,
        token: 'tk-test',
        traceId: 'sf-replay-token',
      });
      expect(result.ok).toBe(true);
      expect(headersSeen.length).toBeGreaterThan(0);
      expect(headersSeen.every((h) => h.Authorization === 'Bearer tk-test')).toBe(true);
    } finally {
      delete process.env.SF_API_TOKEN;
    }
  });

  it('任意一步 HTTP 非 2xx 就明确上抛，不伪装成链路成功', async () => {
    const { fetchImpl } = fakeFetch((method, pathname) =>
      method === 'POST' && /\/pay$/.test(pathname));
    await expect(mod.replay({
      apply: true,
      fetchImpl,
      traceId: 'sf-replay-fail',
    })).rejects.toThrow(/HTTP 409/);
  });
});
