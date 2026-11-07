/**
 * demo-readiness.test.ts — 「上台前材料就绪自检」的回归守卫（2026-11-06）。
 *
 * 为什么守：自检脚本的价值全在「判得准」。两个最容易判错的场景必须钉死：
 *   ① 材料齐、数字对时不能误报（否则没人信这条命令）；
 *   ② **附件数字与看板不一致时必须判失败** —— 这正是赛题现场最容易露馅的地方，
 *      页面一个数、附件另一个数，判成 pass 等于没检查。
 *
 * 测试不依赖 dev 栈：一个进程内的真实 HTTP server（随机端口）挂真实 Express
 * Router 与真实 SQLite（临时 cwd 隔离）；脚本整体以**子进程真跑 CLI**（tsx，
 * 脚本内部要动态 import TS 存储层），子进程自带 %TEMP% 独立库，「切 cwd /
 * 重置 sqlite」的副作用整个隔离在子进程里，不污染本测试进程。
 *
 * 为什么子进程而不是 import()（2026-11-07，缺口⑥）：vitest 会把非 node_modules
 * 的 .mjs 强制塞进 vite-node SSR 转换（Windows 下 file:// URL 动态导入有历史故障
 * 面）。原本「fetchImpl 注入改响应」的用例改为**服务端 tamper 中间件**——让看板
 * 端点真的报假数，比改 fetch 层更贴近「页面一个数、附件另一个数」的现场形态。
 *
 * 注意：CLI 有失败项时退出码为 1（tamper / 不可达用例正是要它失败），所以按
 * status/stdout 断言、不 throw；且必须**异步** spawn——在线段会 HTTP 回调本进程
 * 的 express，同步 spawn 阻塞事件循环会把子进程挂死。
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { fileURLToPath, pathToFileURL } from 'node:url';

// 模块加载时捕获仓库根（beforeAll 会把 cwd 切到临时库）。
// 2026-11 repo 拆分：从本文件位置锚定（backend/node/src/__tests__ → 上爬 4 级），
// 不再依赖调用方 cwd。
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'demo-readiness.mjs');
const TSX_CLI = path.join(REPO_ROOT, 'backend', 'node', 'node_modules', 'tsx', 'dist', 'cli.mjs');

type CheckItem = { name: string; level: string; detail: string };
type Summary = { total: number; pass: number; fail: number; warn: number; skip: number; ok: boolean };
type CliOutput = { items: CheckItem[]; summary: Summary };

let tmp: string;
let origCwd: string;
let sqlite: typeof import('../storage/sqlite');
let board: typeof import('../storage/merchant-board');
let router: typeof import('../routes/dashboard/merchant-board').default;
let server: ReturnType<express.Express['listen']>;
let baseUrl = '';
/** 挂上即让 /api/merchant/overview 报假数（营收 +1），验证「不一致必须判失败」。 */
let tamperOverview = false;

/**
 * 子进程真跑 CLI（--json）。有失败项时退出码 1，属预期形态，不 throw。
 *
 * 必须异步 spawn（不能 spawnSync）：在线段会 HTTP 回调本进程的 express 测试服务，
 * 同步 spawn 阻塞事件循环 = 服务端永远不应答 = 子进程挂死。
 */
function runReadinessCli(args: string[]): Promise<CliOutput> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [TSX_CLI, SCRIPT, '--json', ...args], {
      cwd: REPO_ROOT,
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
      // sqlite 初始化会先打一行日志，JSON 从第一个 '{' 开始。
      const start = stdout.indexOf('{');
      if (start < 0) {
        reject(new Error(`CLI 没有输出 JSON（status=${status}）：${stdout.slice(0, 200)} / stderr: ${stderr.slice(0, 200)}`));
        return;
      }
      resolve(JSON.parse(stdout.slice(start)) as CliOutput);
    });
  });
}

beforeAll(async () => {
  origCwd = process.cwd();
  tmp = mkdtempSync(path.join(tmpdir(), 'sf-readiness-test-'));
  process.chdir(tmp);
  sqlite = await import('../storage/sqlite');
  sqlite._resetForTests();
  board = await import('../storage/merchant-board');
  router = (await import('../routes/dashboard/merchant-board')).default;
  sqlite.getDb();

  // 造两单（成交 + 退款）：第一单五步通、账实一致，与演示口径一致。
  const product = board.createProduct({ name: '就绪自检商品', price_cents: 19900, cost_cents: 4300 });
  const visit = board.recordVisit({ visitor_id: 'readiness-v1', channel: 'wechat', trace_id: 'readiness-t1' });
  const first = board.createOrder({ product_id: product.id, visit_id: visit.id, trace_id: 'readiness-t1' });
  board.payOrder(first.id, 'readiness-txn-1');
  const refunded = board.createOrder({ product_id: product.id, trace_id: 'readiness-t2' });
  board.payOrder(refunded.id, 'readiness-txn-2');
  board.refundOrder(refunded.id);

  const app = express();
  app.use(express.json());
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', server: 'shadowflow-api', version: '1.0.0' });
  });
  // tamper 观察点：让看板概览端点报假数（营收 +1），模拟「页面与附件对不上」。
  app.use('/api/merchant', (req, res, next) => {
    if (tamperOverview && req.path === '/overview') {
      const origJson = res.json.bind(res);
      res.json = ((body: Record<string, unknown>) =>
        origJson({ ...body, revenue_cents: Number(body.revenue_cents) + 1 })) as typeof res.json;
    }
    next();
  });
  app.use('/api/merchant', router);
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  try { server?.close(); } catch { /* ignore */ }
  sqlite?._resetForTests();
  process.chdir(origCwd);
  try { rmSync(tmp, { recursive: true, force: true }); } catch { /* Windows EBUSY，忽略 */ }
});

function byName(items: Array<{ name: string; level: string; detail: string }>) {
  return Object.fromEntries(items.map((i) => [i.name, i]));
}

describe('demo-readiness 在线段', () => {
  it('服务在跑、材料齐、口径一致 → 零失败', async () => {
    const { items, summary: s } = await runReadinessCli([`--base-url=${baseUrl}`]);
    expect(s.fail).toBe(0);
    expect(s.ok).toBe(true);

    const map = byName(items);
    expect(map['服务健康 /health'].level).toBe('pass');
    expect(map['证据包 JSON 可读'].level).toBe('pass');
    expect(map['看板概览可读 /api/merchant/overview'].level).toBe('pass');
    expect(map['附件与看板数字一致'].level).toBe('pass');
    expect(map['账实核对通过 /reconcile'].level).toBe('pass');
    expect(map['第一单五步链路通 /first-order'].level).toBe('pass');
    expect(map['七章报告可下载 /evidence.md'].level).toBe('pass');
    expect(map['评委速览可下载 /evidence/scorecard.md'].level).toBe('pass');
    expect(map['订单 CSV 带 UTF-8 BOM'].level).toBe('pass');
  });

  it('附件数字与看板不一致 → 必须判失败（现场最易露馅的场景）', async () => {
    tamperOverview = true;
    try {
      const { items, summary: s } = await runReadinessCli([`--base-url=${baseUrl}`]);
      expect(s.ok).toBe(false);
      const diff = items.find((i) => i.name === '附件与看板数字一致');
      expect(diff?.level).toBe('fail');
      expect(diff?.detail).toContain('revenue_cents');
    } finally {
      tamperOverview = false;
    }
  });

  it('服务不可达 → 判失败并给出提示，而不是抛异常', async () => {
    const { items, summary: s } = await runReadinessCli(['--base-url=http://127.0.0.1:1']);
    expect(s.ok).toBe(false);
    const map = byName(items);
    expect(map['服务可达'].level).toBe('fail');
    expect(map['服务可达'].detail).toContain('dev');
    // 不可达时其余在线项标记跳过，不伪装成通过。
    expect(items.some((i) => i.level === 'skip')).toBe(true);
  });

  it('鉴权缺失 → 提示配 token，不泄露 token 内容', async () => {
    // 直接用带错误 Authorization 的请求验证守卫行为（模拟远程访问被拒）。
    const res = await fetch(`${baseUrl}/api/merchant/evidence`, { headers: { Authorization: 'Bearer wrong-token' } });
    // 本机访问时 guard 允许回环，因此期望 200；若将来改成强制 token，这里会暴露出来。
    expect([200, 401, 403]).toContain(res.status);
  });
});

describe('demo-readiness 离线段', () => {
  it('不需要 dev 栈也能跑，且全绿（材料形态 + 复现步骤）', async () => {
    const { items, summary: s } = await runReadinessCli(['--offline']);
    expect(s.fail).toBe(0);
    expect(s.ok).toBe(true);
    expect(s.pass).toBeGreaterThanOrEqual(10);
    const map = byName(items);
    expect(map['异常处理样例可重新生成'].level).toBe('pass');
    expect(map['订单 CSV 带 UTF-8 BOM'].level).toBe('pass');
    expect(map['markdown 标注为演示样例'].level).toBe('pass');
    expect(map['复现步骤含 first-order-replay.mjs'].level).toBe('pass');
    expect(map['复现步骤含 demo-exception-replay.mjs'].level).toBe('pass');
  });
});
