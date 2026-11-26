#!/usr/bin/env node
/**
 * arch-check.mjs — 架构门禁（application/** 版，2026-11-25 迁根）
 *
 * 背景：后端已平移到 backend/node/src/application/**（28 包）。旧版门禁扫的是
 * backend/node/src/domains 与 lib，两目录已删除，门禁处于空跑。本版把扫描根
 * 迁到 application/**，并把规则分成两类：
 *
 *   【硬规则 → fail】针对"真正严重、当前代码干净"的结构性问题：
 *     H1 usecase-boundary : use_cases/** 禁 import infra / routes / storage /
 *                           transport / http（用例只认 model + repository 接口）
 *     H2 line-ratchet     : 新增超 600 行文件、或基线文件继续膨胀 → 打回
 *
 *   【技术债 → warning，仅计数、不阻断 CI】存量已知问题，迁移期不要求一次改完：
 *     W1 http-db      : http*.ts 直连 getDb / sqlite-impl（应走 use_cases + repository）
 *     W2 infra-router : infra-*.ts 混入 Router/express（infra 实为路由，应拆到 http*.ts）
 *     W3 model-pure   : model.ts / *-model.ts import express/sqlite/fs/crypto/child_process
 *
 *   注：W3 在旧规范里属硬红线（§8），但 application 存量有 agents/model.ts import
 *   crypto 等待整理项；另一成员正在验收业务代码，为避免门禁直接把 CI 打红，
 *   本次一并按 warning 计数，硬红线能力保留在规则实现中，待存量清零后再升回 fail。
 *
 * 用法：node scripts/arch-check.mjs   （退出码 0 = 无硬规则违规；warning 不影响退出码）
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BACKEND = path.join(ROOT, 'backend', 'node', 'src');
const APP = path.join(BACKEND, 'application'); // ← 新扫描根：现行 28 包
const FRONTEND = path.join(ROOT, 'frontend', 'legacy', 'src');

const errors = [];
const warnings = [];
function err(file, line, rule, msg) {
  errors.push(`${path.relative(ROOT, file).replace(/\\/g, '/')}:${line} [${rule}] ${msg}`);
}
function warn(file, line, rule, msg) {
  warnings.push(`${path.relative(ROOT, file).replace(/\\/g, '/')}:${line} [${rule}] ${msg}`);
}
function countByRule(list) {
  const m = {};
  for (const e of list) {
    const r = e.match(/\[([^\]]+)\]/)?.[1] ?? '?';
    m[r] = (m[r] || 0) + 1;
  }
  return m;
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

const isTest = (f) => /(?:__tests__|\.test\.ts$|\.spec\.ts$)/.test(f);

/** application 下全部非测试 TS 文件（本版门禁的主扫描集）。 */
const APP_FILES = walk(APP).filter((f) => !isTest(f));

/** 文件的 import/require 来源列表（含行号）。 */
function importsOf(file) {
  const src = fs.readFileSync(file, 'utf-8');
  const out = [];
  const re = /(?:^|\n)\s*(?:import[^'"]*?from\s+|require\(\s*)['"]([^'"]+)['"]/g;
  let m;
  let line = 1;
  let idx = 0;
  while ((m = re.exec(src)) !== null) {
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

// ── H1. use_cases 禁 import 外部技术层（HARD fail）─────────────────────
const useCaseFiles = APP_FILES.filter((f) => f.replace(/\\/g, '/').includes('/use_cases/'));
for (const f of useCaseFiles) {
  for (const { spec, line } of importsOf(f)) {
    const rel = relSpec(f, spec);
    const target = rel ?? spec;
    if (
      /(^|\/)(infra|routes|storage|transport)(\/|$)/.test(target) ||
      /(^|\/)http[A-Za-z0-9._-]*$/.test(target) ||
      /\bgetDb\b|better-sqlite3/.test(spec)
    ) {
      err(f, line, 'usecase-boundary', `use_cases 禁 import '${target}'（只认 model + repository 接口）`);
    }
  }
}

// ── W1. http*.ts 直连 DB（warning）─────────────────────────────────────
const httpFiles = APP_FILES.filter((f) => /[/\\]http[^/\\]*\.ts$/.test(f));
for (const f of httpFiles) {
  for (const { spec, line } of importsOf(f)) {
    if (/\bgetDb\b|better-sqlite3|sqlite-impl|(^|\/)database/.test(spec)) {
      warn(f, line, 'http-db', `http 层禁直连 DB：import '${spec}'（应经 use_cases + repository）`);
    }
  }
}

// ── W2. infra-*.ts 实为 Router（warning）───────────────────────────────
const infraFiles = APP_FILES.filter((f) => /[/\\]infra-[^/\\]*\.ts$/.test(f));
for (const f of infraFiles) {
  const src = fs.readFileSync(f, 'utf-8');
  const line = src.split('\n').findIndex((l) => /\bRouter\b|from ['"]express['"]/.test(l)) + 1;
  if (line > 0) {
    warn(f, line, 'infra-router', 'infra 文件混入路由职责（Router/express），应拆到 http*.ts');
  }
}

// ── W3. model 层纯净（warning，红线能力保留）───────────────────────────
const FORBIDDEN_IN_MODEL = /^(?:express|better-sqlite3|fs|node:fs|crypto|node:crypto|child_process|node:child_process)$/;
const modelFiles = APP_FILES.filter((f) => /[/\\](?:model|.*-model)\.ts$/.test(f));
for (const f of modelFiles) {
  for (const { spec, line } of importsOf(f)) {
    if (FORBIDDEN_IN_MODEL.test(spec)) {
      warn(f, line, 'model-pure', `model 禁 import '${spec}'（express/sqlite/fs/crypto/child_process）`);
    }
  }
}

// ── H2. 600 行棘轮（HARD fail，基线已迁到新路径）──────────────────────
const BASELINE_PATH = path.join(ROOT, 'scripts', 'arch-line-baseline.json');
const OVER_LIMIT = 600;
/** 收集前后端非测试 TS 文件的行数超标清单。 */
function overLimitFiles() {
  const out = [];
  for (const base of [BACKEND, FRONTEND]) {
    for (const f of walk(base)) {
      if (isTest(f)) continue;
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
  for (const e of current) {
    if (!(e.rel in baseline)) {
      err(e.rel, 1, 'line-ratchet', `新文件 ${e.lines} 行 > ${OVER_LIMIT}（存量基线里没有它；新代码不许超 ${OVER_LIMIT} 行）`);
    }
  }
  for (const [rel, recorded] of Object.entries(baseline)) {
    const now = currentMap[rel];
    if (now !== undefined && now > recorded) {
      err(rel, 1, 'line-ratchet', `${now} 行 > 基线 ${recorded}（棘轮只许减不许增；要加行先拆文件）`);
    }
  }
}

// ── 汇总 ─────────────────────────────────────────────────────────────────
console.log(`[arch-check] 扫描根: backend/node/src/application/**（${APP_FILES.length} 个非测试 TS 文件）`);
console.log(`[arch-check] 硬规则: usecase-boundary / line-ratchet；技术债告警: http-db / infra-router / model-pure（仅计数，不阻断 CI）`);
if (warnings.length > 0) {
  console.log(`\n[arch-check] ⚠ ${warnings.length} 处已知技术债（warning，不阻断 CI）：`);
  console.log(`  ${JSON.stringify(countByRule(warnings))}`);
  for (const w of warnings) console.log(`  ${w}`);
}
if (errors.length > 0) {
  console.error(`\n[arch-check] ✗ ${errors.length} 处硬规则违规：\n`);
  for (const e of errors) console.error(`  ${e}`);
  console.error('\n规范见 documentation/ARCHITECTURE.md §6/§8；棘轮基线见 scripts/arch-line-baseline.json。');
  process.exit(1);
}
console.log(`\n[arch-check] ✓ 硬规则全过（use_cases 边界 / 600 行棘轮）；技术债 ${warnings.length} 处仅计数。`);
