/**
 * projects.ts — Story 15.16 — Project CRUD over sqlite.
 *
 * A Project is the long-lived container for a series of RunSession outputs.
 * Each project owns a workspace_path on disk where artifacts accumulate.
 *
 * Schema: see server/migrations/001-init.sql `projects` table.
 *
 * BE-02（2026-11-08，T02/T03 缺口修复）：
 *   - workspace_id 空间维度——listProjects 支持严格相等过滤（语义镜像
 *     groups-store：不传=不过滤；null/字符串=严格相等，null 只匹配 NULL 行）。
 *   - 营销 Brief 落库（marketing_projects/craft 域口径，产品说明书阶段一
 *     「产品资料档案」的系统承接）：7 个规范字段（customer/goals/cycle/
 *     budget/deliverables/brief/notes）各占一列 + extra_json 捕获袋。
 *     请求里 7 字段之外的未识别键**整体进捕获袋**，回读平铺回 record 顶层
 *     ——「静默丢弃」缺陷类消灭：任何提交过的键回读都还在。
 *     值按 JSON 文本存（字符串/数组/对象无损回读）；显式 null = 清除该
 *     字段（回读不再出现）。
 */

import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { getDb } from './sqlite';

/** 营销 Brief 规范字段（T03「客户/目标/周期/预算/交付物/Brief 全字段」+ notes）。 */
export const MARKETING_FIELDS = [
  'customer',
  'goals',
  'cycle',
  'budget',
  'deliverables',
  'brief',
  'notes',
] as const;

export interface ProjectRecord {
  project_id: string;
  name: string;
  workspace_path: string;
  skill_id: string | null;
  design_system_id: string | null;
  /** BE-02：空间归属；null=未归属空间。 */
  workspace_id: string | null;
  created_at: string;
  updated_at: string;
  /**
   * BE-02：营销 Brief（7 规范字段 + 未识别键）回读时平铺在 record 顶层，
   * 与 POST/PATCH 提交的键一一对应（值按 JSON 原样还原）。
   */
  [extra: string]: unknown;
}

interface ProjectRow {
  project_id: string;
  name: string;
  workspace_path: string;
  skill_id: string | null;
  design_system_id: string | null;
  workspace_id: string | null;
  created_at: string;
  updated_at: string;
}

function rowToRecord(r: ProjectRow): ProjectRecord {
  return {
    project_id: r.project_id,
    name: r.name,
    workspace_path: r.workspace_path,
    skill_id: r.skill_id,
    design_system_id: r.design_system_id,
    workspace_id: r.workspace_id ?? null,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

// ── BE-02：营销 Brief（marketing_projects）────────────────────────────────────

/** JSON 文本 'null' = 该字段未填（区分于显式填入的字符串 "null"）。 */
const UNSET = 'null';

/** 读一个项目的营销 Brief（7 规范字段 + extra 捕获袋平铺）；无行返回 {}。 */
function loadMarketing(projectId: string): Record<string, unknown> {
  const row = getDb()
    .prepare(`SELECT * FROM marketing_projects WHERE project_id = ?`)
    .get(projectId) as
    | (Record<string, string> & { extra_json: string })
    | undefined;
  if (!row) return {};
  const out: Record<string, unknown> = {};
  for (const f of MARKETING_FIELDS) {
    const raw = row[f] ?? UNSET;
    if (raw === UNSET) continue;
    try {
      out[f] = JSON.parse(raw);
    } catch {
      out[f] = raw; // 旧数据兜底：非 JSON 文本原样返回
    }
  }
  try {
    const extra = JSON.parse(row.extra_json || '{}') as Record<string, unknown>;
    for (const [k, v] of Object.entries(extra)) out[k] = v;
  } catch {
    /* extra 损坏只丢捕获袋，规范字段照常返回 */
  }
  return out;
}

/**
 * 写营销 Brief。`mode='create'` 整行插入；`mode='patch'` 只更新提供的键
 * （规范字段按列更新，未识别键合并进 extra_json——同键覆盖、异键保留）。
 * 显式 null = 清除该键（规范字段回落 'null' 哨兵，extra 里删除该键）。
 */
function saveMarketing(
  projectId: string,
  values: Record<string, unknown>,
  mode: 'create' | 'patch',
): void {
  const db = getDb();
  const now = new Date().toISOString();
  const known: Record<string, string> = {};
  const extraSet: Record<string, unknown> = {};
  const extraDel: string[] = [];
  for (const [k, v] of Object.entries(values)) {
    if ((MARKETING_FIELDS as readonly string[]).includes(k)) {
      known[k] = v === null ? UNSET : JSON.stringify(v);
    } else if (v === null) {
      extraDel.push(k);
    } else {
      extraSet[k] = v;
    }
  }

  if (mode === 'create') {
    const cols = ['project_id', ...MARKETING_FIELDS, 'extra_json', 'created_at', 'updated_at'];
    const vals: string[] = [projectId, ...MARKETING_FIELDS.map((f) => known[f] ?? UNSET)];
    vals.push(Object.keys(extraSet).length ? JSON.stringify(extraSet) : '{}');
    vals.push(now, now);
    db.prepare(
      `INSERT INTO marketing_projects (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
    ).run(...vals);
    return;
  }

  // patch：行不存在则补建（项目可能建于 BE-02 之前）。
  db.prepare(
    `INSERT OR IGNORE INTO marketing_projects (project_id, created_at, updated_at) VALUES (?, ?, ?)`,
  ).run(projectId, now, now);

  const sets: string[] = [];
  const args: string[] = [];
  for (const [k, v] of Object.entries(known)) {
    sets.push(`${k} = ?`);
    args.push(v);
  }
  if (Object.keys(extraSet).length || extraDel.length) {
    // 读-改-写 extra_json（同键覆盖、null 删除、异键保留）。
    const row = db.prepare(`SELECT extra_json FROM marketing_projects WHERE project_id = ?`).get(projectId) as
      | { extra_json: string }
      | undefined;
    let extra: Record<string, unknown> = {};
    try {
      extra = JSON.parse(row?.extra_json || '{}') as Record<string, unknown>;
    } catch {
      extra = {};
    }
    Object.assign(extra, extraSet);
    for (const k of extraDel) delete extra[k];
    sets.push('extra_json = ?');
    args.push(JSON.stringify(extra));
  }
  if (sets.length) {
    sets.push('updated_at = ?');
    args.push(now, projectId);
    db.prepare(`UPDATE marketing_projects SET ${sets.join(', ')} WHERE project_id = ?`).run(...args);
  }
}

/** 平铺营销 Brief 到 record 顶层（回读与提交键一一对应）。 */
function withMarketing(record: ProjectRecord): ProjectRecord {
  return { ...record, ...loadMarketing(record.project_id) };
}

/**
 * 项目列表（updated_at 新→旧）。BE-02 空间过滤语义（镜像 groups-store）：
 * `workspace_id` 不传（undefined）= 不过滤；null/字符串 = 严格相等
 * （null 只匹配未归属空间的行）。
 */
export function listProjects(opts?: { workspace_id?: string | null }): ProjectRecord[] {
  const filter = opts !== undefined && opts.workspace_id !== undefined;
  const rows = filter
    ? (getDb()
        .prepare(
          opts.workspace_id === null
            ? `SELECT * FROM projects WHERE workspace_id IS NULL ORDER BY updated_at DESC`
            : `SELECT * FROM projects WHERE workspace_id = ? ORDER BY updated_at DESC`,
        )
        .all(...(opts.workspace_id === null ? [] : [opts.workspace_id])) as ProjectRow[])
    : (getDb()
        .prepare(`SELECT * FROM projects ORDER BY updated_at DESC`)
        .all() as ProjectRow[]);
  return rows.map((r) => withMarketing(rowToRecord(r)));
}

export function getProject(id: string): ProjectRecord | null {
  const row = getDb()
    .prepare(`SELECT * FROM projects WHERE project_id = ?`)
    .get(id) as ProjectRow | undefined;
  return row ? withMarketing(rowToRecord(row)) : null;
}

export interface CreateProjectInput {
  name: string;
  workspace_path?: string;
  skill_id?: string | null;
  design_system_id?: string | null;
  /** BE-02：空间归属。 */
  workspace_id?: string | null;
  /**
   * BE-02：营销 Brief（7 规范字段 + 未识别键整体捕获），任意 JSON 值。
   * 提供即整行落 marketing_projects；省略则不建行。
   */
  marketing?: Record<string, unknown>;
}

export function createProject(input: CreateProjectInput): ProjectRecord {
  const project_id = randomUUID();
  const now = new Date().toISOString();
  const workspace_path =
    input.workspace_path && input.workspace_path.trim().length > 0
      ? input.workspace_path
      : path.join(process.cwd(), '.shadowflow', 'projects', project_id);

  // 2026-05-11 review HIGH-1 (15.16): spec AC4 明确要求 createProject 时物理
  // mkdir workspace_path，否则后续 RunSession 写产物到该目录会 ENOENT。
  // OpenDesign 模式：daemon 创建 project 即落 fs structure 一并完成。
  try {
    fs.mkdirSync(workspace_path, { recursive: true });
  } catch (err) {
    // mkdir 失败不阻断 — DB 行仍写入，让上层显式 ls/use 时再发现。
    console.warn(
      `[projects] could not create workspace dir ${workspace_path}: ${(err as Error).message}`,
    );
  }

  getDb()
    .prepare(
      `INSERT INTO projects
       (project_id, name, workspace_path, skill_id, design_system_id, workspace_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      project_id,
      input.name,
      workspace_path,
      input.skill_id ?? null,
      input.design_system_id ?? null,
      input.workspace_id ?? null,
      now,
      now,
    );

  // BE-02：营销 Brief 整行落 marketing_projects（有内容才建行）。
  const marketing = input.marketing ?? {};
  if (Object.keys(marketing).length > 0) {
    saveMarketing(project_id, marketing, 'create');
  }

  return {
    project_id,
    name: input.name,
    workspace_path,
    skill_id: input.skill_id ?? null,
    design_system_id: input.design_system_id ?? null,
    workspace_id: input.workspace_id ?? null,
    created_at: now,
    updated_at: now,
    ...loadMarketing(project_id),
  };
}

export interface UpdateProjectInput {
  name?: string;
  workspace_path?: string;
  skill_id?: string | null;
  design_system_id?: string | null;
  /** BE-02：空间归属（null=解除归属）。 */
  workspace_id?: string | null;
  /** BE-02：营销 Brief 局部更新（同键覆盖，显式 null 清除）。 */
  marketing?: Record<string, unknown>;
}

export function updateProject(
  id: string,
  patch: UpdateProjectInput,
): ProjectRecord | null {
  const existing = getProject(id);
  if (!existing) return null;

  const merged = {
    project_id: existing.project_id,
    name: 'name' in patch && patch.name !== undefined ? patch.name : existing.name,
    workspace_path:
      'workspace_path' in patch && patch.workspace_path !== undefined
        ? patch.workspace_path
        : existing.workspace_path,
    skill_id: 'skill_id' in patch ? patch.skill_id ?? null : existing.skill_id,
    design_system_id:
      'design_system_id' in patch
        ? patch.design_system_id ?? null
        : existing.design_system_id,
    workspace_id:
      'workspace_id' in patch ? patch.workspace_id ?? null : existing.workspace_id,
    created_at: existing.created_at,
    updated_at: new Date().toISOString(),
  };

  getDb()
    .prepare(
      `UPDATE projects
       SET name = ?, workspace_path = ?, skill_id = ?, design_system_id = ?, workspace_id = ?, updated_at = ?
       WHERE project_id = ?`,
    )
    .run(
      merged.name,
      merged.workspace_path,
      merged.skill_id,
      merged.design_system_id,
      merged.workspace_id,
      merged.updated_at,
      id,
    );

  // BE-02：营销 Brief 局部更新（行不存在则补建；同键覆盖、null 清除）。
  const marketing = patch.marketing ?? {};
  if (Object.keys(marketing).length > 0) {
    saveMarketing(id, marketing, 'patch');
  }

  // 以 core 字段重建 + 平铺最新营销 Brief（清除的键不再回读）。
  return { ...merged, ...loadMarketing(id) };
}

/**
 * Story 15.29 — getOrCreateProject(id, name)
 *
 * Find a project by exact `project_id`; if missing, insert a row with that
 * literal id (instead of the random UUID `createProject` uses) and the given
 * display name. Used by run-sessions.ts to ensure a `'default'` project
 * exists as the home for anonymous conversations created when a client
 * starts a RunSession without an explicit `conversation_id`.
 *
 * Idempotent: repeat calls return the existing row.
 */
export function getOrCreateProject(
  project_id: string,
  name: string,
): ProjectRecord {
  const existing = getProject(project_id);
  if (existing) return existing;

  const now = new Date().toISOString();
  const workspace_path = path.join(
    process.cwd(),
    '.shadowflow',
    'projects',
    project_id,
  );
  try {
    fs.mkdirSync(workspace_path, { recursive: true });
  } catch (err) {
    console.warn(
      `[projects] could not create workspace dir ${workspace_path}: ${(err as Error).message}`,
    );
  }

  // 2026-05-11 review M3 (15.29 race window): 双 tab cold start 同时 auto-create
  // 'default' 时两个 SELECT 都看到 null → 两个 INSERT → 第二个 PK 冲突 throw 500。
  // INSERT OR IGNORE + 失败再 SELECT 是 OpenDesign 标准 upsert 模式。
  try {
    getDb()
      .prepare(
        `INSERT OR IGNORE INTO projects
         (project_id, name, workspace_path, skill_id, design_system_id, workspace_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(project_id, name, workspace_path, null, null, null, now, now);
  } catch (err) {
    // INSERT OR IGNORE 几乎不会 throw，但兜底再读一次保正确性
    console.warn(`[projects] getOrCreateProject INSERT failed (will re-select): ${(err as Error).message}`);
  }

  // 不论 INSERT 是否落地（或被 OR IGNORE 跳过），权威读 SELECT 取最终行。
  const final = getProject(project_id);
  if (final) return final;

  // 极端情况下 SELECT 仍返回 null（DB 异常）— 返回 in-memory 兜底，不阻断调用方。
  return {
    project_id,
    name,
    workspace_path,
    skill_id: null,
    design_system_id: null,
    workspace_id: null,
    created_at: now,
    updated_at: now,
  };
}

/** Returns true if a row was deleted (marketing_projects 行一并删除)。 */
export function deleteProject(id: string): boolean {
  const info = getDb()
    .prepare(`DELETE FROM projects WHERE project_id = ?`)
    .run(id);
  // BE-02：营销 Brief 行随项目删除（显式清理，不依赖 FK pragma）。
  getDb().prepare(`DELETE FROM marketing_projects WHERE project_id = ?`).run(id);
  return info.changes > 0;
}
