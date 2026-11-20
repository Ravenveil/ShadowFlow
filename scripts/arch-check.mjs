#!/usr/bin/env node
/**
 * arch-check.mjs — ARCHITECTURE.md 红线的可执行门禁（2026-11-20，架构评审 Q5-①）。
 *
 * 「一条落地当天就被 17 个文件违反、CI 一条都测不出的红线，等于没有红线。」
 * 本脚本把规范的四条硬约束变成 CI 断言，违反即退出 1 并报 file:line。
 *
 * 四条断言（对应 ARCHITECTURE.md §8 红线）：
 *   1. domains/**\/*-model.ts / model.ts 禁 import express/sqlite/fs/crypto/child_process
 *      （§8 第一条：model 纯领域）
 *   2. domains/**\/use_cases/** 禁 import storage/ transport/ routes/
 *      （用例只认 model + repository 接口；堵 teams.ts:14 那类泄漏）
 *   3. lib/** 禁 import routes/
 *      （lib 是被 routes 消费的底层；堵 gateway-run.ts:25 那类反向依赖）
 *   4. 非测试文件 >600 行白名单棘轮：现有超标文件记入 BASELINE，只许减不许增；
 *      新文件超 600 行直接报错（§8「600 行先想是不是两个域」的可执行版——
 *      存量用棘轮而非红线，因为红线要求全员立刻改完，做不到就没人信）。
 *
 * 用法：node scripts/arch-check.mjs   （退出码 0 = 全过）
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BACKEND = path.join(ROOT, 'backend', 'node', 'src');
const FRONTEND = path.join(ROOT, 'frontend', 'src');

const errors = [];
function err(file, line, rule, msg) {
  errors.push(`${path.relative(ROOT, file).replace(/\\/g, '/')}:${line} [${rule}] ${msg}`);
}

/** 递归收集 .ts 文件（跳过 node_modules / .d.ts）。 */
function walk(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '__pycache__') continue;
      walk(p, out);
    } else if (e.name.endsWith('.ts') && !e.name.endsWith('.d.ts')) {
      out.push(p);
    }
  }
  return out;
}

/** 文件的 import/require 来源列表（含行号）。 */
function importsOf(file) {
  const src = fs.readFileSync(file, 'utf-8');
  const out = [];
  const re = /(?:^|\n)\s*(?:import[^'"]*?from\s+|require\(\s*)['"]([^'"]+)['"]/g;
  let m;
  let line = 1;
  let idx = 0;
  while ((m = re.exec(src)) !== null) {
    // 计算行号：数 spec 到 match 位置之间的换行
    for (; idx < m.index; idx++) if (src[idx] === '\n') line++;
    out.push({ spec: m[1], line });
  }
  return out;
}

/** 相对 import 的 spec → 从 src 根起算的 posix 相对路径。 */
function relSpec(file, spec) {
  if (!spec.startsWith('.')) return null;
  const abs = path.resolve(path.dirname(file), spec);
  return path.relative(BACKEND, abs).replace(/\\/g, '/');
}

// ── 1. model 层纯净 ──────────────────────────────────────────────────────
const FORBIDDEN_IN_MODEL = /(?:from\s+['"](?:express|better-sqlite3|fs|node:fs|crypto|node:crypto|child_process|node:child_process)['"]|require\(\s*['"](?:express|better-sqlite3|fs|node:fs|crypto|node:crypto|child_process|node:child_process)['"]\s*\))/;
const modelFiles = walk(path.join(BACKEND, 'domains')).filter(
  (f) => /[/\\]model\.ts$/.test(f) || /-model\.ts$/.test(f),
);
for (const f of modelFiles) {
  for (const { spec, line } of importsOf(f)) {
    if (FORBIDDEN_IN_MODEL.test(`from '${spec}'`) || FORBIDDEN_IN_MODEL.test(`require('${spec}')`)) {
      err(f, line, 'model-pure', `model 禁 import '${spec}'（express/sqlite/fs/crypto/child_process）`);
    }
  }
}

// ── 2. use_cases 禁 import 外部技术层 ────────────────────────────────────
const useCaseFiles = walk(path.join(BACKEND, 'domains')).filter((f) => f.includes('use_cases'));
for (const f of useCaseFiles) {
  for (const { spec, line } of importsOf(f)) {
    const rel = relSpec(f, spec);
    if (rel === null) continue;
    if (/^storage\//.test(rel) || /^transport\//.test(rel) || /^routes\//.test(rel)) {
      err(f, line, 'usecase-boundary', `use_cases 禁 import '${rel}'（只认 model + repository 接口）`);
    }
  }
}

// ── 3. lib 禁反向 import routes ──────────────────────────────────────────
// 例外白名单（2026-11-20）：gateway-run 需要往 run 体系注册过程事件，而
// registerGatewayRun 的真源（run-sessions/registry.ts）只依赖 lib+storage，
// 不含 express router —— 指名直取该文件不算分层倒置。白名单只收「精确文件」，
// 不收目录前缀，防止例外被泛化。
const LIB_ROUTES_ALLOWLIST = new Set([
  'routes/runs/run-sessions/registry', // lib/gateway-run.ts —— 只依赖 lib+storage 的注册器真源
]);
const libFiles = walk(path.join(BACKEND, 'lib'));
for (const f of libFiles) {
  for (const { spec, line } of importsOf(f)) {
    const rel = relSpec(f, spec);
    if (rel !== null && /^routes\//.test(rel) && !LIB_ROUTES_ALLOWLIST.has(rel)) {
      err(f, line, 'lib-no-routes', `lib 禁 import '${rel}'（lib 是底层，反向依赖即分层倒置）`);
    }
  }
}

// ── 4. 600 行棘轮 ────────────────────────────────────────────────────────
const BASELINE_PATH = path.join(ROOT, 'scripts', 'arch-line-baseline.json');
const OVER_LIMIT = 600;
const testLike = /(?:__tests__|\.test\.ts$|\.spec\.ts$)/;

/** 收集前后端非测试 TS 文件的行数超标清单。 */
function overLimitFiles() {
  const out = [];
  for (const base of [BACKEND, FRONTEND]) {
    for (const f of walk(base)) {
      if (testLike.test(f)) continue;
      const lines = fs.readFileSync(f, 'utf-8').split('\n').length;
      if (lines > OVER_LIMIT) out.push({ rel: path.relative(ROOT, f).replace(/\\/g, '/'), lines });
    }
  }
  return out.sort((a, b) => a.rel.localeCompare(b.rel));
}

const current = overLimitFiles();
let baseline = {};
try {
  baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf-8'));
} catch {
  baseline = {}; // 首次运行：下面自动落盘
}

if (!fs.existsSync(BASELINE_PATH)) {
  const init = Object.fromEntries(current.map((e) => [e.rel, e.lines]));
  fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(init, null, 2)}\n`);
  console.log(`[arch-check] 首次运行：写入 600 行棘轮基线（${current.length} 个存量超标文件）→ scripts/arch-line-baseline.json`);
} else {
  const currentMap = Object.fromEntries(current.map((e) => [e.rel, e.lines]));
  // 新超标文件（基线里没有的）
  for (const e of current) {
    if (!(e.rel in baseline)) {
      err(e.rel, 1, 'line-ratchet', `新文件 ${e.lines} 行 > ${OVER_LIMIT}（存量基线里没有它；新代码不许超 ${OVER_LIMIT} 行）`);
    }
  }
  // 基线文件进一步膨胀（只许减不许增）
  for (const [rel, recorded] of Object.entries(baseline)) {
    const now = currentMap[rel];
    if (now !== undefined && now > recorded) {
      err(rel, 1, 'line-ratchet', `${now} 行 > 基线 ${recorded}（棘轮只许减不许增；要加行先拆文件）`);
    }
  }
}

// ── 汇总 ─────────────────────────────────────────────────────────────────
if (errors.length > 0) {
  console.error(`\n[arch-check] ✗ ${errors.length} 处违反 ARCHITECTURE.md 红线：\n`);
  for (const e of errors) console.error(`  ${e}`);
  console.error('\n规范见 ARCHITECTURE.md §8；棘轮基线见 scripts/arch-line-baseline.json。');
  process.exit(1);
}
console.log('[arch-check] ✓ 红线全过（model 纯净 / use_cases 边界 / lib 不反向 / 600 行棘轮）');
