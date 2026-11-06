#!/usr/bin/env node
/**
 * demo-readiness.mjs — 上台前「材料就绪」自检（2026-11-06）。
 *
 * 为什么需要：现在已有四份材料（七章报告 / 评委速览 / 订单 CSV / 异常处理样例）
 * 和两条一键复现脚本，但**没有一条命令能回答「现在能不能上台」**。评委现场最怕
 * 两件事：① 材料缺一份或数字对不上；② 附件和页面口径漂移（页面说营收 199，附件
 * 写 199.00 还是 0 —— 这类问题一露馅整场就崩）。本脚本把这两件事变成可执行的检查。
 *
 * 分两段：
 *   离线段（不需要 dev 栈）：样例脚本还能不能造出数、产物齐不齐、CSV 有没有 BOM、
 *     样例有没有被误标成线上数据、报告复现步骤里有没有那两条一键命令。
 *   在线段（需要 dev 栈在跑）：服务健康、证据包四个端点可用、**附件数字与看板
 *     overview 逐字段一致**、账实一致、第一单链路通、CSV BOM 正确。
 *
 * 纪律：
 *   - 全程只读：只 GET，不 POST/DELETE，不写任何业务数据，不调模型。
 *   - 离线段在 %TEMP% 的独立 SQLite 里造数，不碰演示库/主库。
 *   - 401/403 一律提示「配 SF_API_TOKEN 或从本机访问」，不打印 token。
 *
 * 运行（仓库根目录）：
 *   node server/node_modules/tsx/dist/cli.mjs scripts/demo-readiness.mjs
 *   node server/node_modules/tsx/dist/cli.mjs scripts/demo-readiness.mjs --offline
 *   node server/node_modules/tsx/dist/cli.mjs scripts/demo-readiness.mjs --base-url=http://localhost:8002 --token=xxx
 *   node server/node_modules/tsx/dist/cli.mjs scripts/demo-readiness.mjs --json
 */

import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const SCRIPT_NAME = 'demo-readiness.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

const BOM = [0xef, 0xbb, 0xbf];
const SAMPLE_MARK = '演示样例 · 非线上数据';

function item(name, level, detail) {
  return { name, level, detail };
}
function pass(name, detail = 'OK') { return item(name, 'pass', detail); }
function fail(name, detail) { return item(name, 'fail', detail); }
function warn(name, detail) { return item(name, 'warn', detail); }
function skip(name, detail) { return item(name, 'skip', detail); }

/** 汇总：ok = 没有 fail（warn/skip 不阻断）。 */
export function summarize(items) {
  const pass_ = items.filter((i) => i.level === 'pass').length;
  const fail_ = items.filter((i) => i.level === 'fail').length;
  const warn_ = items.filter((i) => i.level === 'warn').length;
  const skip_ = items.filter((i) => i.level === 'skip').length;
  return { total: items.length, pass: pass_, fail: fail_, warn: warn_, skip: skip_, ok: fail_ === 0 };
}

function hasBom(buf) {
  return buf.length >= 3 && buf[0] === BOM[0] && buf[1] === BOM[1] && buf[2] === BOM[2];
}

/**
 * 离线段：材料形态是否还成立。不需要 dev 栈，不碰任何现有库。
 * @param {{ tmpRoot?: string }} opts
 */
export async function runOfflineChecks(opts = {}) {
  const items = [];

  // —— 1. 两个一键脚本还在（现场要靠它们重放）——
  for (const s of ['first-order-replay.mjs', 'demo-exception-replay.mjs']) {
    const p = path.join(repoRoot, 'scripts', s);
    items.push(existsSync(p) ? pass(`脚本存在 scripts/${s}`) : fail(`脚本存在 scripts/${s}`, '文件缺失，现场无法重放'));
  }

  // —— 2. 样例还能不能造出来（真跑一次，防止脚本静默退化）——
  let summary = null;
  let verdict = null;
  // 产物必须在临时目录被删掉之前读完 —— 统一在 try 内读进内存，finally 只负责清理。
  const artifacts = { exists: {}, csvBom: null, mdText: '', cardText: '', noticeText: '' };
  const tmp = mkdtempSync(path.join(opts.tmpRoot ?? tmpdir(), 'sf-readiness-'));
  const prevCwd = process.cwd();
  try {
    process.chdir(tmp);
    const sqlite = await import('../server/src/storage/sqlite');
    sqlite._resetForTests();
    sqlite.getDb();
    const demo = await import('./demo-exception-replay.mjs');
    const outDir = path.join(tmp, 'out');
    const gen = await demo.generateDemoEvidence({ outDir });
    summary = gen.summary;
    verdict = demo.verifyDemoEvidence(summary);
    items.push(verdict.ok
      ? pass('异常处理样例可重新生成', '三类人工决策 / 协作异常 / 退款冲成本同框')
      : fail('异常处理样例可重新生成', verdict.problems.join('；')));

    for (const [k, name] of Object.entries(summary.files)) {
      artifacts.exists[k] = existsSync(path.join(outDir, name));
    }
    const csvPath = path.join(outDir, summary.files.csv);
    if (artifacts.exists.csv) {
      artifacts.csvBom = hasBom(readFileSync(csvPath));
    }
    if (artifacts.exists.markdown) {
      artifacts.mdText = readFileSync(path.join(outDir, summary.files.markdown), 'utf8');
    }
    if (artifacts.exists.scorecard) {
      artifacts.cardText = readFileSync(path.join(outDir, summary.files.scorecard), 'utf8');
    }
    if (artifacts.exists.notice) {
      artifacts.noticeText = readFileSync(path.join(outDir, summary.files.notice), 'utf8');
    }
  } catch (err) {
    items.push(fail('异常处理样例可重新生成', `脚本抛错：${err?.message ?? err}`));
  } finally {
    try {
      const sqlite = await import('../server/src/storage/sqlite').catch(() => null);
      try { sqlite?._resetForTests(); } catch { /* best-effort */ }
    } catch { /* best-effort */ }
    process.chdir(prevCwd);
    try { rmSync(tmp, { recursive: true, force: true }); } catch { /* Windows EBUSY，忽略 */ }
  }

  // —— 3. 四份产物齐全 + 格式合规 ——
  if (summary) {
    for (const [k, name] of Object.entries(summary.files)) {
      items.push(artifacts.exists[k] ? pass(`产物齐全 ${k}`) : fail(`产物齐全 ${k}`, `缺 ${name}`));
    }
    if (artifacts.exists.csv) {
      items.push(artifacts.csvBom
        ? pass('订单 CSV 带 UTF-8 BOM')
        : fail('订单 CSV 带 UTF-8 BOM', 'Excel 会乱码'));
    }
    if (artifacts.exists.markdown) {
      items.push(artifacts.mdText.includes(SAMPLE_MARK)
        ? pass('markdown 标注为演示样例')
        : fail('markdown 标注为演示样例', '缺「非线上数据」标注，可能被误当成线上导出'));
    }
    if (artifacts.exists.scorecard) {
      items.push(artifacts.cardText.includes(SAMPLE_MARK)
        ? pass('scorecard 标注为演示样例')
        : fail('scorecard 标注为演示样例', '缺「非线上数据」标注，可能被误当成线上导出'));
    }
    if (artifacts.exists.notice) {
      items.push(artifacts.noticeText.includes('非线上数据')
        ? pass('样例 README 有使用说明')
        : fail('样例 README 有使用说明', 'README 未声明样例身份'));
    }
  }

  // —— 4. 报告复现步骤里必须有那两条命令（材料与现场操作一一对应）——
  if (summary && artifacts.mdText) {
    for (const s of ['first-order-replay.mjs', 'demo-exception-replay.mjs']) {
      items.push(artifacts.mdText.includes(s)
        ? pass(`复现步骤含 ${s}`)
        : fail(`复现步骤含 ${s}`, '报告里找不到这条命令，评委拿到材料也重放不了'));
    }
  }

  return items;
}

/**
 * 在线段：服务在跑时，材料与线上数据是否自洽。全部只读 GET。
 * @param {{ baseUrl?: string, token?: string, fetchImpl?: typeof fetch }} opts
 */
export async function runOnlineChecks(opts = {}) {
  const items = [];
  const base = String(opts.baseUrl ?? process.env.SF_BASE_URL ?? 'http://localhost:8002').replace(/\/+$/, '');
  const token = String(opts.token ?? process.env.SF_API_TOKEN ?? '').trim();
  const doFetch = opts.fetchImpl ?? fetch;

  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  async function get(pathname) {
    const res = await doFetch(`${base}${pathname}`, { headers });
    return res;
  }

  // —— 1. 服务可达 + 健康 ——
  let alive = true;
  try {
    const res = await get('/health');
    const body = await res.json().catch(() => ({}));
    if (res.ok && body.status === 'ok') {
      items.push(pass('服务健康 /health', `${body.server ?? ''} ${body.version ?? ''}`.trim()));
    } else {
      alive = false;
      items.push(fail('服务健康 /health', `HTTP ${res.status}`));
    }
  } catch (err) {
    alive = false;
    items.push(fail('服务可达', `连不上 ${base}：${err?.message ?? err}（先起 dev 栈，或用 --offline 只跑离线段）`));
  }
  if (!alive) {
    items.push(skip('在线段其余检查', '服务不可达，已跳过'));
    return items;
  }

  // —— 2. 证据包 JSON ——
  let evidence = null;
  try {
    const res = await get('/api/merchant/evidence');
    if (res.status === 401 || res.status === 403) {
      items.push(fail('证据包 JSON 可读', `HTTP ${res.status}：配 SF_API_TOKEN（--token）或从本机访问`));
      return items;
    }
    if (!res.ok) {
      items.push(fail('证据包 JSON 可读', `HTTP ${res.status}`));
    } else {
      evidence = await res.json();
      items.push(evidence?.schema_version === 'evidence-1'
        ? pass('证据包 JSON 可读', `schema ${evidence.schema_version}`)
        : fail('证据包 JSON 可读', `schema_version=${evidence?.schema_version ?? '缺失'}`));
    }
  } catch (err) {
    items.push(fail('证据包 JSON 可读', err?.message ?? String(err)));
  }

  // —— 3. 看板 overview 可读 ——
  let overview = null;
  try {
    const res = await get('/api/merchant/overview');
    if (res.ok) {
      overview = await res.json();
      items.push(pass('看板概览可读 /api/merchant/overview'));
    } else {
      items.push(fail('看板概览可读 /api/merchant/overview', `HTTP ${res.status}`));
    }
  } catch (err) {
    items.push(fail('看板概览可读 /api/merchant/overview', err?.message ?? String(err)));
  }

  // —— 4. 口径一致：附件里的数 = 看板上的数（最容易露馅的地方）——
  if (evidence && overview) {
    const eo = evidence?.merchant?.overview ?? {};
    const fields = ['revenue_cents', 'gross_profit_cents', 'orders_total', 'paid_orders', 'refunded_orders'];
    const diffs = fields
      .filter((f) => Number.isFinite(eo[f]) && Number.isFinite(overview[f]) && eo[f] !== overview[f])
      .map((f) => `${f}: 附件 ${eo[f]} ≠ 看板 ${overview[f]}`);
    items.push(diffs.length === 0
      ? pass('附件与看板数字一致', fields.map((f) => `${f}=${eo[f]}`).join(' '))
      : fail('附件与看板数字一致', diffs.join('；')));
  } else {
    items.push(skip('附件与看板数字一致', '缺少证据包或概览数据'));
  }

  // —— 5. 账实一致 ——
  try {
    const res = await get('/api/merchant/reconcile');
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      items.push(fail('账实核对通过 /reconcile', `HTTP ${res.status}`));
    } else if (body?.balanced === true) {
      items.push(pass('账实核对通过 /reconcile'));
    } else {
      const issues = Array.isArray(body?.issues) ? body.issues.length : '?';
      items.push(fail('账实核对通过 /reconcile', `balanced=${body?.balanced}，差异项 ${issues} 个，先对账再上台`));
    }
  } catch (err) {
    items.push(fail('账实核对通过 /reconcile', err?.message ?? String(err)));
  }

  // —— 6. 第一单链路（赛题加分项，台上必须能演示）——
  try {
    const res = await get('/api/merchant/first-order');
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      items.push(fail('第一单五步链路通 /first-order', `HTTP ${res.status}`));
    } else if (body?.complete === true) {
      items.push(pass('第一单五步链路通 /first-order'));
    } else {
      items.push(fail('第一单五步链路通 /first-order', '库里还没有跑通的第一单：先 node scripts/first-order-replay.mjs --apply（只在演示库跑）'));
    }
  } catch (err) {
    items.push(fail('第一单五步链路通 /first-order', err?.message ?? String(err)));
  }

  // —— 7. 三份附件端点 + CSV BOM ——
  const mdRes = await get('/api/merchant/evidence.md').catch(() => null);
  if (!mdRes || !mdRes.ok) {
    items.push(fail('七章报告可下载 /evidence.md', mdRes ? `HTTP ${mdRes.status}` : '请求失败'));
  } else {
    const text = await mdRes.text();
    items.push(text.includes('〇、评委速览')
      ? pass('七章报告可下载 /evidence.md', '卷首含评委速览')
      : fail('七章报告可下载 /evidence.md', '报告卷首没有评委速览'));
  }

  const cardRes = await get('/api/merchant/evidence/scorecard.md').catch(() => null);
  if (!cardRes || !cardRes.ok) {
    items.push(fail('评委速览可下载 /evidence/scorecard.md', cardRes ? `HTTP ${cardRes.status}` : '请求失败'));
  } else {
    const text = await cardRes.text();
    items.push(text.includes('# ShadowFlow')
      ? pass('评委速览可下载 /evidence/scorecard.md')
      : fail('评委速览可下载 /evidence/scorecard.md', '内容异常'));
    // 速览里出现「待造数据」说明还有维度没有事实，提示但不阻断。
    if (text.includes('待造数据')) {
      items.push(warn('速览没有空维度', '仍有维度写着「待造数据」，上台前用 demo-exception-replay 补样例或先造数据'));
    } else {
      items.push(pass('速览没有空维度'));
    }
  }

  const csvRes = await get('/api/merchant/evidence/orders.csv').catch(() => null);
  if (!csvRes || !csvRes.ok) {
    items.push(fail('订单 CSV 可下载 /evidence/orders.csv', csvRes ? `HTTP ${csvRes.status}` : '请求失败'));
  } else {
    const buf = Buffer.from(await csvRes.arrayBuffer());
    items.push(hasBom(buf) ? pass('订单 CSV 带 UTF-8 BOM') : fail('订单 CSV 带 UTF-8 BOM', 'Excel 会乱码'));
  }

  return items;
}

function printItems(items) {
  const mark = { pass: 'PASS', fail: 'FAIL', warn: 'WARN', skip: 'SKIP' };
  for (const i of items) {
    console.log(`[${mark[i.level]}] ${i.name}${i.detail && i.detail !== 'OK' ? ` —— ${i.detail}` : ''}`);
  }
}

function parseArgs(argv) {
  const opts = { offline: false, json: false, help: false, baseUrl: undefined, token: undefined };
  for (const arg of argv) {
    if (arg === '--offline') opts.offline = true;
    else if (arg === '--json') opts.json = true;
    else if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg.startsWith('--base-url=')) opts.baseUrl = arg.slice('--base-url='.length);
    else if (arg.startsWith('--token=')) opts.token = arg.slice('--token='.length);
    else throw new Error(`未知参数：${arg}`);
  }
  return opts;
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
    console.log(`用法：node server/node_modules/tsx/dist/cli.mjs scripts/${SCRIPT_NAME} [--offline] [--base-url=<url>] [--token=<t>] [--json]\n上台前自检：材料形态（离线）+ 服务与口径一致性（在线）。全程只读。`);
    return;
  }

  const items = [...await runOfflineChecks()];
  if (!opts.offline) {
    items.push(...await runOnlineChecks({ baseUrl: opts.baseUrl, token: opts.token }));
  }

  const s = summarize(items);
  if (opts.json) {
    console.log(JSON.stringify({ items, summary: s }, null, 2));
  } else {
    console.log('ShadowFlow · 上台前材料就绪自检（只读，不写库）');
    printItems(items);
    console.log(`结果：通过 ${s.pass} · 失败 ${s.fail} · 提醒 ${s.warn} · 跳过 ${s.skip}`);
    console.log(s.ok ? '自检结论：材料就绪（提醒项可自行判断是否处理）' : '自检结论：**有失败项，先别上台**');
  }
  if (!s.ok) process.exitCode = 1;
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isCli) await main();
