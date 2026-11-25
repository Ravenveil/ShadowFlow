#!/usr/bin/env node
/**
 * check-conventions.mjs — 守三条「好改」纪律（CI/提之前跑 `npm run check`）：
 *
 *   1. 组件(.tsx)里不许出现色值：颜色只能来自 CSS 变量或 data-tone。
 *      例外：`src/data/identities.ts`（dicebear 生成 SVG 时必须有真实 hex）。
 *   2. 组件(.tsx)里不许出现中文文案：文案只能在 `src/content/**`。
 *      检测前先剥掉注释，所以中文注释是合法的。
 *   3. 除了 `src/data/source.ts`，谁都不许直接 import `data/mock`：
 *      数据一律从 WorkspaceSource 进来，换后端才只需要改一个文件。
 *
 * 目的不是洁癖，而是保证「改文案/改配色/换数据源」永远只需动一个地方，
 * 不必回头翻组件 —— 低耦合是能被机器守住的。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const SRC = join(ROOT, 'src');

/** 允许出现色值的文件（相对 src）。 */
const HEX_ALLOW = new Set(['shared/data/identities.ts']);

/** 允许出现中文的文件类型（非 .tsx 一律放行：content/data 本来就是文案与数据）。 */
const CJK_EXEMPT_DIRS = ['shared/content'];

/** 唯一允许直连 mock 数据的文件；别的文件必须走 WorkspaceSource。 */
const MOCK_CONSUMERS = new Set(['shared/data/source.ts']);

const HEX_RE = /#[0-9a-fA-F]{3,8}\b/;
/** 跨层 import 只许「往里指」：外层可以依赖内层，内层不许回头认外层。 */
const ALIAS_IMPORT_RE = /from\s+['"]@\/([a-z]+)\//;
const LAYERS = ['shared', 'runtime', 'business', 'app', 'landing'];
const LAYER_RANK = { shared: 0, runtime: 1, business: 2, app: 3, landing: 3 };
/** business 可以复用 runtime 的通用件；landing 是独立营销站，只认 shared。 */
const LAYER_ALLOW = {
  shared: ['shared'],
  runtime: ['shared', 'runtime'],
  business: ['shared', 'runtime', 'business'],
  app: ['shared', 'runtime', 'business', 'app'],
  landing: ['shared', 'landing'],
};
const CJK_RE = /[\u4e00-\u9fa5]/;
const MOCK_IMPORT_RE = /from\s+['"][^'"]*\/mock['"]/;
/** 后端路径与 fetch 只许出现在 data/http/（映射层是唯一懂后端的地方）。 */
const API_CALL_RE = /\bfetch\s*\(|['"`]\/api\//;

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
  if (!rel.endsWith('.ts') && !rel.endsWith('.tsx')) continue;

  const raw = readFileSync(file, 'utf8');
  const code = stripComments(raw);

  // 规则 3：数据入口唯一（data/source.ts 是适配器，别处不许自己拿 mock）
  if (!MOCK_CONSUMERS.has(rel) && MOCK_IMPORT_RE.test(code)) {
    problems.push(
      `${rel}  直接 import 了 data/mock → 改走 data/source.ts 的 WorkspaceSource（否则换后端要改多处）`,
    );
  }

  // 规则 5：分层方向（inner 不许依赖 outer）
  const fromLayer = LAYERS.find((l) => rel.startsWith(`${l}/`));
  if (fromLayer) {
    for (const line of code.split('\n')) {
      const m = line.match(ALIAS_IMPORT_RE);
      if (!m) continue;
      const to = m[1];
      if (!LAYERS.includes(to)) continue;
      if (!LAYER_ALLOW[fromLayer].includes(to)) {
        problems.push(
          `${rel}  跨层 import 反向：${fromLayer} → ${to}（${line.trim()}）→ ${fromLayer} 只许依赖 ${LAYER_ALLOW[fromLayer].join(' / ')}`,
        );
      } else if (LAYER_RANK[to] > LAYER_RANK[fromLayer]) {
        problems.push(`${rel}  跨层 import 反向：${fromLayer} → ${to}（${line.trim()}）`);
      }
    }
  }

  // 规则 4：只有 data/http/ 认识后端；组件和别的数据文件不许自己 fetch
  if (!rel.startsWith('shared/data/http/') && API_CALL_RE.test(code)) {
    problems.push(
      `${rel}  直接写了后端地址或 fetch → 收进 data/http/（组件只认 WorkspaceSource）`,
    );
  }

  if (!rel.endsWith('.tsx')) continue;
  if (CJK_EXEMPT_DIRS.some((d) => rel.startsWith(`${d}/`))) continue;

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
  console.error('\n规则：文案 → src/content/**，色值 → theme/tokens.css 的 --tone-*（组件用 data-tone），');
  console.error('      数据 → 只从 src/data/source.ts 的 WorkspaceSource 取。');
  process.exit(1);
}

console.log('✓ 约定检查通过：组件无色值、无文案硬编码、数据入口唯一。');
