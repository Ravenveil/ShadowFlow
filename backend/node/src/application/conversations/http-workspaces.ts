/**
 * routes/projects/workspaces.ts — 单后端迁移：Workspace CRUD（Story 12.4 移植）
 *
 * 移植自 python backend/python/shadowflow/api/projects/workspaces.py：
 *   POST   /api/workspaces                — create（201）
 *   GET    /api/workspaces                — list（含 agent_count/team_count）
 *   GET    /api/workspaces/:workspace_id  — get
 *   PATCH  /api/workspaces/:workspace_id  — update name/color
 *   DELETE /api/workspaces/:workspace_id  — delete（204）
 *
 * 数据源：<repo>/.shadowflow/workspaces/*.json — 与 Python 逐字节同源（共享仓库
 * 根 JSON），legacy↔single 数据兼容 → 按挂载裁决无条件挂载。
 *
 * 对齐要点：
 *   - 响应 {data, meta}；错误 {error:{code,message}}（FastAPI HTTPException 等价体）
 *   - count 扫描 .shadowflow/agents + .shadowflow/teams 的 JSON（Python 同款），
 *     另并入 sqlite agent 库（storage/agents.ts，Quick Hire 落库在 sqlite——
 *     Python 读不到它，Node 必须补上，否则 quick-hire 的 agent 不计入）
 *   - ws id 白名单 ^[a-zA-Z0-9_-]+$ + 路径穿越防御（Python _ws_path 同款）
 *   - 无默认工作区（2026-06-01 A 设计）：GET 列表空就空，不自动建「我的工作区」
 */

import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { repoDataFile } from '../adapters/infra-repo-root';
import { listAgents } from '../../application/agents/infra-persistence';

const router = Router();

type Obj = Record<string, unknown>;

const WS_ID_RE = /^[a-zA-Z0-9_-]+$/;

/** FastAPI HTTPException(detail={error:{code,message}}) 的 JSON 等价体。 */
function fail(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ error: { code, message } });
}

function readJson(file: string): Obj | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as Obj;
  } catch {
    return null;
  }
}

/** 原子写 JSON（tmp + rename，与 python os.replace 等价）。 */
function writeJsonAtomic(file: string, data: Obj): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = path.join(
    path.dirname(file),
    `.tmp-${process.pid}-${Math.random().toString(36).slice(2)}`,
  );
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmp, file);
}

// ── 存储（.shadowflow/workspaces/*.json，Python _ws_path 同款防御）──────────

function wsFilePath(workspaceId: string): string | null {
  if (!WS_ID_RE.test(workspaceId)) return null;
  const dir = repoDataFile('workspaces');
  const resolved = path.resolve(path.join(dir, `${workspaceId}.json`));
  // 路径穿越防御：解析后必须仍落在 workspaces 目录的下一层
  if (path.dirname(resolved) !== path.resolve(dir)) return null;
  return resolved;
}

function loadWorkspace(workspaceId: string): Obj | null {
  const p = wsFilePath(workspaceId);
  if (!p || !fs.existsSync(p)) return null;
  return readJson(p);
}

function listWorkspaceRecords(): Obj[] {
  const dir = repoDataFile('workspaces');
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const records: Obj[] = [];
  for (const name of entries.filter((f) => f.endsWith('.json')).sort()) {
    const rec = readJson(path.join(dir, name));
    if (rec) records.push(rec);
  }
  return records;
}

// ── count 扫描（Python _count_for_workspace 同款 + sqlite agent 补源）───────

/** JSON agent/team 库（Python 读的那份）里 workspace_id 匹配的记录数。 */
function countInJsonDir(dir: string, workspaceId: string): number {
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return 0;
  }
  let count = 0;
  for (const name of entries.filter((f) => f.endsWith('.json'))) {
    const rec = readJson(path.join(dir, name));
    if (rec && rec['workspace_id'] === workspaceId) count += 1;
  }
  return count;
}

/**
 * agent_count：JSON 库 + sqlite 库（Quick Hire 落 sqlite，Python JSON 扫描看不到）。
 * 同一 agent 两边同源时按 agent_id 去重。
 */
function agentCount(workspaceId: string): number {
  const jsonDir = repoDataFile('agents');
  const jsonIds = new Set<string>();
  let entries: string[];
  try {
    entries = fs.readdirSync(jsonDir);
  } catch {
    entries = [];
  }
  let count = 0;
  for (const name of entries.filter((f) => f.endsWith('.json'))) {
    const rec = readJson(path.join(jsonDir, name));
    if (!rec) continue;
    if (rec['workspace_id'] === workspaceId) {
      count += 1;
      const id = rec['agent_id'];
      if (typeof id === 'string') jsonIds.add(id);
    }
  }
  for (const a of listAgents(workspaceId)) {
    if (!jsonIds.has(a.agent_id)) count += 1;
  }
  return count;
}

function teamCount(workspaceId: string): number {
  return countInJsonDir(repoDataFile('teams'), workspaceId);
}

function enrich(record: Obj): Obj {
  const wsId = String(record['workspace_id'] ?? '');
  return {
    ...record,
    agent_count: agentCount(wsId),
    team_count: teamCount(wsId),
  };
}

// ── 路由 ────────────────────────────────────────────────────────────────────

router.post('/', (req: Request, res: Response) => {
  const body = (req.body ?? {}) as {
    name?: unknown;
    color?: unknown;
    owner_id?: unknown;
  };
  const name = typeof body.name === 'string' ? body.name : '';
  // Pydantic Field(min_length=1, max_length=120)
  if (!name || name.length > 120) {
    fail(res, 422, 'FIELD_INVALID', 'name must be a string of length 1-120');
    return;
  }
  const color = typeof body.color === 'string' && body.color ? body.color : '#6366f1';
  if (color.length > 20) {
    fail(res, 422, 'FIELD_INVALID', 'color must be at most 20 characters');
    return;
  }
  const ownerId = typeof body.owner_id === 'string' && body.owner_id ? body.owner_id : 'local';
  if (ownerId.length > 80) {
    fail(res, 422, 'FIELD_INVALID', 'owner_id must be at most 80 characters');
    return;
  }
  const now = new Date().toISOString();
  const workspaceId = `ws-${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const record: Obj = {
    workspace_id: workspaceId,
    name,
    color,
    owner_id: ownerId,
    created_at: now,
    updated_at: now,
  };
  writeJsonAtomic(wsFilePath(workspaceId)!, record);
  res.status(201).json({ data: enrich(record), meta: { created: true } });
});

router.get('/', (_req: Request, res: Response) => {
  const records = listWorkspaceRecords();
  const enriched = records.map(enrich);
  res.json({ data: enriched, meta: { total: enriched.length } });
});

router.get('/:workspace_id', (req: Request, res: Response) => {
  const id = req.params.workspace_id;
  if (!WS_ID_RE.test(id)) {
    fail(res, 400, 'INVALID_WORKSPACE_ID', 'Invalid workspace_id format');
    return;
  }
  const record = loadWorkspace(id);
  if (!record) {
    fail(res, 404, 'WORKSPACE_NOT_FOUND', `Workspace '${id}' not found`);
    return;
  }
  res.json({ data: enrich(record), meta: {} });
});

router.patch('/:workspace_id', (req: Request, res: Response) => {
  const id = req.params.workspace_id;
  if (!WS_ID_RE.test(id)) {
    fail(res, 400, 'INVALID_WORKSPACE_ID', 'Invalid workspace_id format');
    return;
  }
  const record = loadWorkspace(id);
  if (!record) {
    fail(res, 404, 'WORKSPACE_NOT_FOUND', `Workspace '${id}' not found`);
    return;
  }
  const body = (req.body ?? {}) as { name?: unknown; color?: unknown };
  if (body.name !== undefined && body.name !== null) {
    const name = body.name;
    if (typeof name !== 'string' || !name || name.length > 120) {
      fail(res, 422, 'FIELD_INVALID', 'name must be a string of length 1-120');
      return;
    }
    record['name'] = name;
  }
  if (body.color !== undefined && body.color !== null) {
    const color = body.color;
    if (typeof color !== 'string' || color.length > 20) {
      fail(res, 422, 'FIELD_INVALID', 'color must be at most 20 characters');
      return;
    }
    record['color'] = color;
  }
  record['updated_at'] = new Date().toISOString();
  writeJsonAtomic(wsFilePath(id)!, record);
  res.json({ data: enrich(record), meta: {} });
});

router.delete('/:workspace_id', (req: Request, res: Response) => {
  const id = req.params.workspace_id;
  if (!WS_ID_RE.test(id)) {
    fail(res, 400, 'INVALID_WORKSPACE_ID', 'Invalid workspace_id format');
    return;
  }
  const record = loadWorkspace(id);
  if (!record) {
    fail(res, 404, 'WORKSPACE_NOT_FOUND', `Workspace '${id}' not found`);
    return;
  }
  const p = wsFilePath(id)!;
  if (fs.existsSync(p)) fs.unlinkSync(p);
  res.status(204).end();
});

export default router;
