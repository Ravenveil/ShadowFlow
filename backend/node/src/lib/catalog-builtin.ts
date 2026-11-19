/**
 * catalog-builtin.ts — 内置 Catalog 团队模板的 Node 侧种子。
 *
 * 背景（2026-11-19）：内置团队模板（Auto Research Cloud 论文专家团 / T04 氢能
 * 获客团）原本只在 Python 启动时由 `runtime/catalog_templates.py`
 * 的 `ensure_builtin_templates()` 种子。单后端模式不启 Python，于是：
 *   GET /api/catalog/apps 里没有 ARC → 前端「论文专家团 · 一键即用」直接 404。
 *
 * 本模块把模板定义改成**仓库内 JSON 数据文件**（config/catalog-templates/），
 * Node 启动时幂等种子到 .shadowflow/catalog/。JSON 由 Python 的蓝图构造函数
 * 一次性导出（保证与 Python 侧同一份内容），此后以数据文件为唯一真源。
 *
 * 幂等规则与 Python 一致：已存在且快照非空 → 跳过；缺失/损坏 → 补种。
 */

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { repoDataFile } from '../storage/repo-root';

export interface BuiltinTemplateSpec {
  app_id: string;
  /** config/catalog-templates/ 下的蓝图 JSON 文件名。 */
  file: string;
  scope_hint: string;
}

/** 内置模板清单（新增模板只改这里 + 放一份 JSON）。 */
export const BUILTIN_TEMPLATES: readonly BuiltinTemplateSpec[] = [
  {
    app_id: 'app-auto-research-cloud',
    file: 'app-auto-research-cloud.blueprint.json',
    scope_hint: 'team_member_candidate',
  },
  {
    app_id: 'app-t04-hydrogen-team',
    file: 'app-t04-hydrogen-team.blueprint.json',
    scope_hint: 'team_member_candidate',
  },
] as const;

/**
 * 蓝图数据目录解析。
 *
 * 不能用 repoRoot()：dev 下 `backend/node/.shadowflow` 也存在（sqlite/settings
 * 在那），repoRoot() 候选 1 会命中 backend/node，而模板在**仓库根** config/ 下。
 * 所以这里独立按「含 config/catalog-templates 且目录里有 blueprint 文件」
 * 逐个候选探测，与 cwd 无关。
 */
export function templatesDir(): string {
  const candidates = [
    process.env.SHADOWFLOW_REPO_ROOT?.trim(),
    // src/lib → backend/node/src/lib → 上 4 级 = 仓库根（tsx 直跑）
    path.resolve(__dirname, '..', '..', '..', '..'),
    // dist/lib → backend/node/dist/lib → 上 4 级
    path.resolve(__dirname, '..', '..', '..'),
    process.cwd(),
    path.resolve(process.cwd(), '..', '..'),
  ].filter((p): p is string => !!p);

  for (const root of candidates) {
    const dir = path.join(root, 'config', 'catalog-templates');
    if (fs.existsSync(dir)) return dir;
  }
  return path.join(candidates[0] ?? process.cwd(), 'config', 'catalog-templates');
}

function readJson(file: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf-8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** 记录可用：文件存在且 snapshot 是非空对象。 */
function recordUsable(file: string): boolean {
  const rec = readJson(file);
  const snap = rec?.['blueprint_snapshot'];
  return !!snap && typeof snap === 'object' && !Array.isArray(snap) && Object.keys(snap).length > 0;
}

function writeJsonAtomic(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmp, file);
}

/**
 * 幂等种子内置模板，返回本次新写入的 app_id。
 * 任何单条失败都不影响其它模板（启动路径不能因为模板坏了起不来）。
 */
export function ensureBuiltinCatalogTemplates(): string[] {
  const seeded: string[] = [];
  const catalogDir = repoDataFile('catalog');
  for (const spec of BUILTIN_TEMPLATES) {
    try {
      const target = path.join(catalogDir, `${spec.app_id}.json`);
      if (recordUsable(target)) continue;

      const blueprint = readJson(path.join(templatesDir(), spec.file));
      if (!blueprint) continue;

      const snapshot: Record<string, unknown> = { ...blueprint };
      const bpId =
        typeof snapshot['blueprint_id'] === 'string' && snapshot['blueprint_id']
          ? snapshot['blueprint_id']
          : `bp-${randomUUID().replace(/-/g, '').slice(0, 12)}`;
      snapshot['blueprint_id'] = bpId;

      const record = {
        app_id: spec.app_id,
        name: String(snapshot['name'] ?? spec.app_id),
        goal: String(snapshot['goal'] ?? ''),
        kit_type: 'custom',
        author: 'ShadowFlow 模板库',
        published_at: new Date().toISOString(),
        fork_count: 0,
        blueprint_id: bpId,
        template_id: '',
        workflow_id: '',
        forked_from: null,
        scope_hint: spec.scope_hint,
        blueprint_snapshot: snapshot,
      };
      writeJsonAtomic(target, record);
      seeded.push(spec.app_id);
    } catch {
      /* 单个模板失败不影响启动，也不影响其它模板 */
    }
  }
  return seeded;
}
