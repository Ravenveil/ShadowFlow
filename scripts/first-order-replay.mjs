#!/usr/bin/env node
/**
 * first-order-replay.mjs — 一键重放「第一单五步链路」（功能线① 演示材料）。
 *
 * 为什么需要：赛题要求「运行与演示材料」可核实。七章报告是**已落库事实**的
 * 快照，评委现场如果只看到历史数据，没法确认链路真的能跑通。本脚本把
 *   商品就绪 → 落地页埋点 → 下单 → 支付（入账）→ 第一单链路 → 看板 → 账实核对 → 证据包
 * 串成一条命令，跑完立即告诉评委哪一步通了、数字是否自洽。
 *
 * 设计纪律（与 ①③ 模块一致）：
 *   - 不另起后端、不另起端口、不用 Python；纯 HTTP 调用现有 Express Router。
 *   - 默认 dry-run：只打印计划，不写库、不发请求。要真的造第一单必须显式 --apply。
 *   - --apply 会往**当前库**写 1 商品（仅当没有商品）/ 1 访客 / 1 单 / 1 笔支付。
 *     演示库上台前请按项目纪律 reset；生产库别跑。
 *   - 显式 --trace-id 时幂等：若该 trace 已有 paid 且五步全通的订单，跳过写库，
 *     只重新校验并导出，避免评委多点几次把库堆满。
 *   - 只读校验段的数字全部取自服务端（overview / reconcile / evidence），
 *     脚本不自己算营收，避免又出现「页面一个数、附件另一个数」。
 *
 * 用法：
 *   node scripts/first-order-replay.mjs                      # dry-run 计划
 *   node scripts/first-order-replay.mjs --apply              # 真跑并落库
 *   node scripts/first-order-replay.mjs --apply --json       # 机器可读结果
 *   node scripts/first-order-replay.mjs --apply --trace-id=sf-demo-1106  # 可重复跑
 *   node scripts/first-order-replay.mjs --apply --base-url=http://host:8002 --token=xxx
 *
 * 远程调用若服务端设了 SF_API_TOKEN，必须带 --token（或环境变量 SF_API_TOKEN）；
 * 本机回环地址无需 token（apiGuard 默认放行 127.0.0.1 / ::1）。
 */

import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const DEFAULT_BASE_URL = 'http://127.0.0.1:8002';
export const SCRIPT_NAME = 'first-order-replay.mjs';

const HELP = `ShadowFlow · 第一单一键复现

  node scripts/${SCRIPT_NAME} [选项]

选项：
  --apply                 真的执行（默认 dry-run，只打印计划，不写库）
  --json                  以 JSON 输出结果（配合 --apply 使用）
  --base-url=<url>        网关地址，默认 ${DEFAULT_BASE_URL}（可用 SF_BASE_URL）
  --token=<token>         Bearer token，默认读环境变量 SF_API_TOKEN
  --trace-id=<id>         固定链路 trace；已跑通则跳过写库，只重新校验
  --price-cents=<n>       无商品时新建商品的售价（分），默认 19900
  --cost-cents=<n>        无商品时新建商品的成本（分），默认 4300
  -h, --help              显示本帮助

注意：--apply 会往当前库写入演示数据，生产库请勿运行；演示库上台前按纪律 reset。
`;

/** 解析 CLI 参数；同时支持 `--k=v` 与 `--k v` 两种写法。 */
export function parseArgs(argv = []) {
  const opts = {
    baseUrl: process.env.SF_BASE_URL || DEFAULT_BASE_URL,
    token: process.env.SF_API_TOKEN || '',
    apply: false,
    json: false,
    help: false,
    traceId: '',
    priceCents: 19900,
    costCents: 4300,
    explicitTraceId: false,
  };
  const value = (i, flag) => {
    if (i + 1 >= argv.length || String(argv[i + 1]).startsWith('--')) {
      throw new Error(`${flag} 缺少参数值`);
    }
    return String(argv[i + 1]);
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i]);
    if (arg === '--apply') opts.apply = true;
    else if (arg === '--json') opts.json = true;
    else if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg === '--base-url') { opts.baseUrl = value(i, arg); i += 1; }
    else if (arg.startsWith('--base-url=')) opts.baseUrl = arg.slice('--base-url='.length);
    else if (arg === '--token') { opts.token = value(i, arg); i += 1; }
    else if (arg.startsWith('--token=')) opts.token = arg.slice('--token='.length);
    else if (arg === '--trace-id') { opts.traceId = value(i, arg); opts.explicitTraceId = true; i += 1; }
    else if (arg.startsWith('--trace-id=')) { opts.traceId = arg.slice('--trace-id='.length); opts.explicitTraceId = true; }
    else if (arg === '--price-cents') { opts.priceCents = Number(value(i, arg)); i += 1; }
    else if (arg.startsWith('--price-cents=')) opts.priceCents = Number(arg.slice('--price-cents='.length));
    else if (arg === '--cost-cents') { opts.costCents = Number(value(i, arg)); i += 1; }
    else if (arg.startsWith('--cost-cents=')) opts.costCents = Number(arg.slice('--cost-cents='.length));
    else throw new Error(`未知参数：${arg}（用 --help 查看用法）`);
  }
  // baseUrl 必须是可拼路径的 http(s) 根地址；不在这里发请求，dry-run 也能提前发现手误。
  let parsed;
  try {
    parsed = new URL(opts.baseUrl);
  } catch {
    throw new Error(`--base-url 不是合法 URL：${opts.baseUrl}`);
  }
  if (!/^https?:$/.test(parsed.protocol)) throw new Error('--base-url 只支持 http/https');
  if (parsed.pathname !== '/' && parsed.pathname !== '') throw new Error('--base-url 不要带路径，脚本自己拼 /api/merchant/...');
  if (!Number.isInteger(opts.priceCents) || opts.priceCents < 0) throw new Error('--price-cents 必须是非负整数（分）');
  if (!Number.isInteger(opts.costCents) || opts.costCents < 0) throw new Error('--cost-cents 必须是非负整数（分）');
  if (opts.explicitTraceId && !opts.traceId) throw new Error('--trace-id 不能为空');
  opts.baseUrl = opts.baseUrl.replace(/\/+$/, '');
  return opts;
}

/** dry-run 时展示的计划；与 --apply 实际执行顺序一一对应。 */
export function planSteps(traceId) {
  return [
    { step: 'product_ready', method: 'GET|POST', path: '/api/merchant/products', write: true, note: '有商品就复用，没有才建一条演示商品' },
    { step: 'visit_landed', method: 'POST', path: '/api/merchant/visits', write: true, note: `落地页埋点，trace_id=${traceId}` },
    { step: 'order_created', method: 'POST', path: '/api/merchant/orders', write: true, note: '带 product_id + visit_id + trace_id 下单' },
    { step: 'order_paid', method: 'POST', path: '/api/merchant/orders/:id/pay', write: true, note: '模拟支付回调（写入 income/expense 流水）' },
    { step: 'first_order', method: 'GET', path: '/api/merchant/first-order', write: false, note: '按 trace_id 校验五步链路 complete' },
    { step: 'overview', method: 'GET', path: '/api/merchant/overview', write: false, note: '校验成交单数与营收已入看板' },
    { step: 'reconcile', method: 'GET', path: '/api/merchant/reconcile', write: false, note: '校验账实一致 balanced' },
    { step: 'evidence', method: 'GET', path: '/api/merchant/evidence', write: false, note: '校验证据包第一单链路与复现步骤' },
  ];
}

/**
 * 执行（或只返回计划）。
 * fetchImpl 可注入，便于离线契约测试用 supertest 在临时库里跑完整链路，
 * 不需要真的启动 dev 栈、也不需要另起端口。
 */
export async function replay(options = {}) {
  const {
    baseUrl = DEFAULT_BASE_URL,
    token = '',
    apply = false,
    fetchImpl = globalThis.fetch,
    traceId = `sf-replay-${randomUUID().slice(0, 8)}`,
    priceCents = 19900,
    costCents = 4300,
    explicitTraceId = false,
  } = options;

  const base = String(baseUrl).replace(/\/+$/, '');
  if (!apply) {
    return {
      ok: true,
      dry_run: true,
      apply: false,
      base_url: base,
      trace_id: traceId,
      plan: planSteps(traceId),
      warning: '这是 dry-run：没有发任何请求、没有写库。确认目标库后加 --apply 才会真跑。',
    };
  }
  if (typeof fetchImpl !== 'function') throw new Error('当前环境没有 fetch，请传 fetchImpl 或用 Node 18+ 运行');

  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const steps = [];
  async function call(step, method, path, body, note) {
    const res = await fetchImpl(`${base}${path}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const status = Number(res.status);
    const ok = typeof res.ok === 'boolean' ? res.ok : status >= 200 && status < 300;
    let data = null;
    if (typeof res.json === 'function') {
      try { data = await res.json(); } catch { data = null; }
    }
    if (!ok) {
      throw new Error(`${step} 失败：${method} ${path} → HTTP ${status} ${JSON.stringify(data ?? '')}`);
    }
    steps.push({ step, method, path, ok: true, ...(note ? { note } : {}) });
    return data;
  }

  let reused = false;
  // 只有显式给 --trace-id 才做幂等短路：默认每次 --apply 都是一笔新的可核实第一单。
  if (explicitTraceId) {
    const prior = await call(
      'first_order_precheck',
      'GET',
      `/api/merchant/first-order?trace_id=${encodeURIComponent(traceId)}`,
      undefined,
      '幂等检查：该 trace 是否已跑通',
    );
    reused = !!prior?.complete;
  }

  if (!reused) {
    const products = await call('product_ready', 'GET', '/api/merchant/products');
    let productId = Array.isArray(products) && products.length ? products[0].id : null;
    if (!productId) {
      const created = await call('product_ready', 'POST', '/api/merchant/products', {
        name: 'ShadowFlow 演示商品（第一单复现）',
        price_cents: priceCents,
        cost_cents: costCents,
      }, '库里没有商品，新建一条演示商品');
      productId = created?.id;
    }
    if (!productId) throw new Error('product_ready 失败：拿不到商品 id');

    const visit = await call('visit_landed', 'POST', '/api/merchant/visits', {
      visitor_id: `replay-${traceId}`.slice(0, 128),
      channel: 'demo-replay',
      trace_id: traceId,
    });
    if (!visit?.id) throw new Error('visit_landed 失败：拿不到 visit id');

    const order = await call('order_created', 'POST', '/api/merchant/orders', {
      product_id: productId,
      visit_id: visit.id,
      trace_id: traceId,
    });
    if (!order?.id) throw new Error('order_created 失败：拿不到 order id');

    await call('order_paid', 'POST', `/api/merchant/orders/${encodeURIComponent(order.id)}/pay`, {
      pay_txn_id: `replay-${traceId}`.slice(0, 128),
    });
    steps.push({ step: 'order_id', ok: true, note: order.id });
  } else {
    steps.push({ step: 'write_skipped', ok: true, note: '该 trace_id 已跑通，跳过写库，只重新校验' });
  }

  const firstOrder = await call(
    'first_order',
    'GET',
    `/api/merchant/first-order?trace_id=${encodeURIComponent(traceId)}`,
  );
  const overview = await call('overview', 'GET', '/api/merchant/overview');
  const reconcile = await call('reconcile', 'GET', '/api/merchant/reconcile');
  const evidence = await call('evidence', 'GET', '/api/merchant/evidence');

  const chainOk = firstOrder?.complete === true
    && Array.isArray(firstOrder.steps)
    && firstOrder.steps.length === 5
    && firstOrder.steps.every((s) => s.ok === true);
  if (!chainOk) throw new Error(`第一单五步链路未通：${JSON.stringify(firstOrder)}`);
  if (!overview || Number(overview.paid_orders) < 1) throw new Error('overview 没有出现已支付订单，支付可能没入账');
  if (reconcile?.balanced !== true) throw new Error(`账实核对未通过：${JSON.stringify(reconcile?.issues ?? reconcile)}`);
  // 证据包的第一单挂在 report.merchant.first_order（与七章报告「第一单链路」同源）。
  if (evidence?.merchant?.first_order?.complete !== true) throw new Error('证据包里的第一单链路未通，导出与页面口径不一致');
  if (!Array.isArray(evidence?.reproduction?.steps)
    || !evidence.reproduction.steps.some((s) => String(s).includes(SCRIPT_NAME))) {
    throw new Error('证据包复现步骤里没有本脚本，材料与现场操作对不上');
  }

  return {
    ok: true,
    dry_run: false,
    apply: true,
    base_url: base,
    trace_id: traceId,
    reused,
    steps,
    checks: {
      first_order: { complete: firstOrder.complete, chain: firstOrder.steps.map((s) => s.step), order_id: firstOrder.order_id },
      overview: { paid_orders: overview.paid_orders, revenue_cents: overview.revenue_cents, gross_profit_cents: overview.gross_profit_cents },
      reconcile: { balanced: reconcile.balanced, issues: reconcile.issues },
      evidence: { schema_version: evidence.schema_version, first_order_complete: evidence.merchant.first_order.complete },
    },
    next: [
      `GET ${base}/api/merchant/evidence/scorecard.md（评委速览一页）`,
      `GET ${base}/api/merchant/evidence.md（七章报告）`,
      `GET ${base}/api/merchant/evidence/orders.csv（订单明细）`,
    ],
  };
}

function printHuman(result) {
  if (result.dry_run) {
    console.log('ShadowFlow · 第一单一键复现（dry-run，未发任何请求 / 未写库）');
    console.log(`目标服务：${result.base_url}`);
    console.log(`链路 trace：${result.trace_id}`);
    console.log('执行计划：');
    for (const [i, s] of result.plan.entries()) {
      console.log(`  ${i + 1}. [${s.write ? '写' : '读'}] ${s.method} ${s.path} — ${s.note}`);
    }
    console.log('\n⚠ --apply 会写入当前库的演示数据：1 访客 / 1 单 / 1 笔支付（无商品时多 1 商品）。');
    console.log('  生产库请勿运行；演示库上台前按项目纪律 reset。');
    console.log(`  确认后执行：node scripts/${SCRIPT_NAME} --apply`);
    return;
  }
  console.log('ShadowFlow · 第一单一键复现结果');
  console.log(`目标服务：${result.base_url} · trace：${result.trace_id} · ${result.reused ? '复用已跑通链路（跳过写库）' : '本次新建链路'}`);
  for (const [i, s] of result.steps.entries()) {
    console.log(`  ${i + 1}. ✓ ${s.step}${s.method ? ` — ${s.method} ${s.path}` : ''}${s.note ? ` · ${s.note}` : ''}`);
  }
  console.log(`校验：五步全通 ${result.checks.first_order.chain.join(' → ')}`);
  console.log(`      看板成交 ${result.checks.overview.paid_orders} 单 · 营收 ${result.checks.overview.revenue_cents} 分 · 毛利 ${result.checks.overview.gross_profit_cents} 分`);
  console.log(`      账实一致 ${result.checks.reconcile.balanced ? '✓' : '×'} · 证据包第一单 ${result.checks.evidence.first_order_complete ? '✓' : '×'}`);
  console.log('接着导出：');
  for (const n of result.next) console.log(`  ${n}`);
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`参数错误：${err.message}`);
    process.exitCode = 2;
    return;
  }
  if (opts.help) {
    console.log(HELP);
    return;
  }
  try {
    const result = await replay({
      baseUrl: opts.baseUrl,
      token: opts.token,
      apply: opts.apply,
      traceId: opts.traceId || `sf-replay-${randomUUID().slice(0, 8)}`,
      priceCents: opts.priceCents,
      costCents: opts.costCents,
      explicitTraceId: opts.explicitTraceId,
    });
    if (opts.json) console.log(JSON.stringify(result, null, 2));
    else printHuman(result);
  } catch (err) {
    console.error(`复现失败：${err.message}`);
    if (String(err.message).includes('401') || String(err.message).includes('403')) {
      console.error('提示：远程服务若设置了 SF_API_TOKEN，请带 --token=<token>（或设置同名环境变量）。');
    }
    process.exitCode = 1;
  }
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isCli) {
  await main();
}
