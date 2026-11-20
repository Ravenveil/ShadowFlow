#!/usr/bin/env node
/**
 * check-conventions.mjs — 守两条「好改」纪律（CI/提之前跑 `npm run check`）：
 *
 *   1. 组件(.tsx)里不许出现色值：颜色只能来自 CSS 变量或 data-tone。
 *      例外：`src/data/identities.ts`（dicebear 生成 SVG 时必须有真实 hex）。
 *   2. 组件(.tsx)里不许出现中文文案：文案只能在 `src/content/**`。
 *      检测前先剥掉注释，所以中文注释是合法的。
 *
 * 目的不是洁癖，而是保证「改文案/改配色」永远只需动 content 或 tokens，
 * 不必回头翻组件 —— 低耦合是能被机器守住的。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const SRC = join(ROOT, 'src');

/** 允许出现色值的文件（相对 src）。 */
const HEX_ALLOW = new Set(['data/identities.ts']);

/** 允许出现中文的文件类型（非 .tsx 一律放行：content/data 本来就是文案与数据）。 */
const CJK_EXEMPT_DIRS = ['content'];

const HEX_RE = /#[0-9a-fA-F]{3,8}\b/;
const CJK_RE = /[\u4e00-\u9fa5]/;

/** 去掉 // 与 /* *\/ 注释，避免注释里的色值/中文触发规则。 */
function stripComments(code) {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const problems = [];

for (const file of walk(SRC)) {
  const rel = relative(SRC, file).split(sep).join('/');
  if (!rel.endsWith('.tsx')) continue;
  if (CJK_EXEMPT_DIRS.some((d) => rel.startsWith(`${d}/`))) continue;

  const raw = readFileSync(file, 'utf8');
  const code = stripComments(raw);
  const lines = code.split('\n');

  lines.forEach((line, i) => {
    if (HEX_RE.test(line) && !HEX_ALLOW.has(rel)) {
      problems.push(`${rel}:${i + 1}  色值硬编码 → 用 var(--token) 或 data-tone: ${line.trim()}`);
    }
    if (CJK_RE.test(line)) {
      const at = raw.split('\n')[i]?.trim() ?? line.trim();
      problems.push(`${rel}:${i + 1}  中文文案硬编码 → 挪到 src/content: ${at}`);
    }
  });
}

if (problems.length) {
  console.error(`✗ 发现 ${problems.length} 处硬编码：\n`);
  for (const p of problems) console.error(`  ${p}`);
  console.error('\n规则：文案 → src/content/**，色值 → theme/tokens.css 的 --tone-*（组件用 data-tone）。');
  process.exit(1);
}

console.log('✓ 约定检查通过：组件无色值、无文案硬编码。');
