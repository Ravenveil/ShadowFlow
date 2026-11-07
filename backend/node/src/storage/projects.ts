/**
 * projects.ts — Story 15.16 — Project CRUD over sqlite.
 *
 * A Project is the long-lived container for a series of RunSession outputs.
 * Each project owns a workspace_path on disk where artifacts accumulate.
 *
 * Schema: see server/migrations/001-init.sql `projects` table.
 */

import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { getDb } from './sqlite';

export interface ProjectRecord {
  project_id: string;
  name: string;
  workspace_path: string;
  skill_id: string | null;
  design_system_id: string | null;
  created_at: string;
  updated_at: string;
  /** T03/BE-02 营销录入：客户/机构名。 */
  client_name: string;
  /** 营销目标。 */
  goal: string;
  /** 服务周期（自由文本，如 2026-11~2026-12）。 */
  period: string;
  /** 预算（自由文本，如 ¥499/月）。 */
  budget: string;
  /** 交付物清单（结构化数组，落库为 JSON 文本）。 */
  deliverables: string[];
  /** 营销 Brief 全文。 */
  brief: string;
  /** T02/BE-02 空间归属（ws-*）。空串=未归属空间。 */
  workspace_id: string;
}

interface ProjectRow {
  project_id: string;
  name: string;
  workspace_path: string;
  skill_id: string | null;
  design_system_id: string | null;
  created_at: string;
  updated_at: string;
  client_name: string | null;
  goal: string | null;
  period: string | null;
  budget: string | null;
  deliverables: string | null;
  brief: string | null;
  workspace_id: string | null;
}

/** deliverables 落库为 JSON 文本；坏数据/缺列回退空数组，绝不炸读取链。 */
function parseDeliverables(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function rowToRecord(r: ProjectRow): ProjectRecord {
  return {
    project_id: r.project_id,
    name: r.name,
    workspace_path: r.workspace_path,
    skill_id: r.skill_id,
    design_system_id: r.design_system_id,
    created_at: r.created_at,
    updated_at: r.updated_at,
    client_name: r.client_name ?? '',
    goal: r.goal ?? '',
    period: r.period ?? '',
    budget: r.budget ?? '',
    deliverables: parseDeliverables(r.deliverables),
    brief: r.brief ?? '',
    workspace_id: r.workspace_id ?? '',
  };
}

/**
 * 项目列表。`workspace_id` 传入时只返回该空间的项目（T02/BE-02 空间隔离：
 * 此前 ?workspace_id= 被忽略返回全量，多机构并行必串数据）。
 */
export function listProjects(workspace_id?: string): ProjectRecord[] {
  const rows =
    workspace_id && workspace_id.length > 0
      ? (getDb()
          .prepare(`SELECT * FROM projects WHERE workspace_id = ? ORDER BY updated_at DESC`)
          .all(workspace_id) as ProjectRow[])
      : (getDb()
          .prepare(`SELECT * FROM projects ORDER BY updated_at DESC`)
          .all() as ProjectRow[]);
  return rows.map(rowToRecord);
}

export function getProject(id: string): ProjectRecord | null {
  const row = getDb()
    .prepare(`SELECT * FROM projects WHERE project_id = ?`)
    .get(id) as ProjectRow | undefined;
  return row ? rowToRecord(row) : null;
}

export interface CreateProjectInput {
  name: string;
  workspace_path?: string;
  skill_id?: string | null;
  design_system_id?: string | null;
  /** T03/BE-02 营销录入七字段（全部可选，缺省空）。 */
  client_name?: string;
  goal?: string;
  period?: string;
  budget?: string;
  deliverables?: string[];
  brief?: string;
  workspace_id?: string;
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

  const row: ProjectRow = {
    project_id,
    name: input.name,
    workspace_path,
    skill_id: input.skill_id ?? null,
    design_system_id: input.design_system_id ?? null,
    created_at: now,
    updated_at: now,
    client_name: input.client_name ?? '',
    goal: input.goal ?? '',
    period: input.period ?? '',
    budget: input.budget ?? '',
    deliverables: JSON.stringify(input.deliverables ?? []),
    brief: input.brief ?? '',
    workspace_id: input.workspace_id ?? '',
  };

  getDb()
    .prepare(
      `INSERT INTO projects
       (project_id, name, workspace_path, skill_id, design_system_id, created_at, updated_at,
        client_name, goal, period, budget, deliverables, brief, workspace_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      row.project_id,
      row.name,
      row.workspace_path,
      row.skill_id,
      row.design_system_id,
      row.created_at,
      row.updated_at,
      row.client_name,
      row.goal,
      row.period,
      row.budget,
      row.deliverables,
      row.brief,
      row.workspace_id,
    );

  return rowToRecord(row);
}

export interface UpdateProjectInput {
  name?: string;
  workspace_path?: string;
  skill_id?: string | null;
  design_system_id?: string | null;
  client_name?: string;
  goal?: string;
  period?: string;
  budget?: string;
  deliverables?: string[];
  brief?: string;
  workspace_id?: string;
}

export function updateProject(
  id: string,
  patch: UpdateProjectInput,
): ProjectRecord | null {
  const existing = getProject(id);
  if (!existing) return null;

  const merged: ProjectRecord = {
    ...existing,
    ...('name' in patch && patch.name !== undefined ? { name: patch.name } : {}),
    ...('workspace_path' in patch && patch.workspace_path !== undefined
      ? { workspace_path: patch.workspace_path }
      : {}),
    ...('skill_id' in patch ? { skill_id: patch.skill_id ?? null } : {}),
    ...('design_system_id' in patch
      ? { design_system_id: patch.design_system_id ?? null }
      : {}),
    ...('client_name' in patch && patch.client_name !== undefined
      ? { client_name: patch.client_name }
      : {}),
    ...('goal' in patch && patch.goal !== undefined ? { goal: patch.goal } : {}),
    ...('period' in patch && patch.period !== undefined ? { period: patch.period } : {}),
    ...('budget' in patch && patch.budget !== undefined ? { budget: patch.budget } : {}),
    ...('deliverables' in patch && patch.deliverables !== undefined
      ? { deliverables: patch.deliverables }
      : {}),
    ...('brief' in patch && patch.brief !== undefined ? { brief: patch.brief } : {}),
    ...('workspace_id' in patch && patch.workspace_id !== undefined
      ? { workspace_id: patch.workspace_id }
      : {}),
    updated_at: new Date().toISOString(),
  };

  getDb()
    .prepare(
      `UPDATE projects
       SET name = ?, workspace_path = ?, skill_id = ?, design_system_id = ?, updated_at = ?,
           client_name = ?, goal = ?, period = ?, budget = ?, deliverables = ?, brief = ?, workspace_id = ?
       WHERE project_id = ?`,
    )
    .run(
      merged.name,
      merged.workspace_path,
      merged.skill_id,
      merged.design_system_id,
      merged.updated_at,
      merged.client_name,
      merged.goal,
      merged.period,
      merged.budget,
      JSON.stringify(merged.deliverables),
      merged.brief,
      merged.workspace_id,
      id,
    );

  return merged;
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
         (project_id, name, workspace_path, skill_id, design_system_id, created_at, updated_at,
          client_name, goal, period, budget, deliverables, brief, workspace_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, '', '', '', '', '[]', '', '')`,
      )
      .run(project_id, name, workspace_path, null, null, now, now);
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
    created_at: now,
    updated_at: now,
    client_name: '',
    goal: '',
    period: '',
    budget: '',
    deliverables: [],
    brief: '',
    workspace_id: '',
  };
}

/** Returns true if a row was deleted (FK CASCADE handles dependents). */
export function deleteProject(id: string): boolean {
  const info = getDb()
    .prepare(`DELETE FROM projects WHERE project_id = ?`)
    .run(id);
  return info.changes > 0;
}
