/**
 * agent-store.ts — 本地 agent 记录读取（单后端 fallback 真源）。
 *
 * 背景（2026-11-19）：Catalog fork（`routes/projects/catalog.ts` 的
 * `saveAgentFile`）把物化出来的 agent 写成 `.shadowflow/agents/<id>.json`，
 * 与 Python agent store 同目录同格式。但单后端不启 Python 时：
 *   - `GET /api/agents/:id` 先打 Python（连不上）→ 回落 yaml 模板 → 404
 *   - `groups-chat` 的 DAG 取 agent 也打 Python → 每个节点都 Agent not found
 *
 * 本模块按「JSON 文件 → yaml 模板 → sqlite」顺序取一条 agent 记录，
 * 让单后端下 fork 出来的 agent 能被 DAG 真正调度。
 */

import fs from 'fs';
import path from 'path';
import { repoDataFile } from '../storage/repo-root';

export interface LocalAgentRecord {
  agent_id: string;
  name: string;
  soul: string;
  workspace_id?: string;
  blueprint?: Record<string, unknown>;
  source?: string;
  [key: string]: unknown;
}

const ID_RE = /^[a-zA-Z0-9_-]+$/;

/** 读 `.shadowflow/agents/<agentId>.json`。id 非法或文件缺失 → null（不猜）。 */
export function readAgentFile(agentId: string): LocalAgentRecord | null {
  if (!ID_RE.test(agentId)) return null;
  try {
    const raw = fs.readFileSync(repoDataFile('agents', `${agentId}.json`), 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const rec = parsed as Record<string, unknown>;
    const id = typeof rec['agent_id'] === 'string' && rec['agent_id'] ? rec['agent_id'] : agentId;
    const name = typeof rec['name'] === 'string' && rec['name'] ? rec['name'] : id;
    return {
      ...rec,
      agent_id: id,
      name,
      soul: typeof rec['soul'] === 'string' ? rec['soul'] : '',
    };
  } catch {
    return null;
  }
}

/** 列出本地 JSON agent 库的 id（排序稳定）。 */
export function listAgentFileIds(): string[] {
  const dir = repoDataFile('agents');
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.json') && ID_RE.test(f.slice(0, -5)))
      .map((f) => f.slice(0, -5))
      .sort();
  } catch {
    return [];
  }
}

/**
 * 取 agent：JSON 文件（Catalog fork 产物）优先，其次调用方注入的 yaml 查找，
 * 最后 sqlite。任一残缺都继续往下找，不提前返回空壳。
 */
export function resolveAgent(
  agentId: string,
  fallbacks: Array<() => LocalAgentRecord | null> = [],
): LocalAgentRecord | null {
  const fromFile = readAgentFile(agentId);
  if (fromFile) return fromFile;
  for (const fn of fallbacks) {
    try {
      const hit = fn();
      if (hit) return hit;
    } catch {
      /* 单个 fallback 失败继续下一个 */
    }
  }
  return null;
}

/** 目录是否存在（便于提示「还没有 fork 过任何 agent」）。 */
export function agentsDirExists(): boolean {
  return fs.existsSync(repoDataFile('agents'));
}

/** 校验 agent id：只许安全文件名字符（防路径穿越）。 */
function assertSafeAgentId(id: string): void {
  if (!id || /[\\/]/.test(id) || id.includes('..')) {
    throw new Error(`invalid agent_id: ${JSON.stringify(id)}`);
  }
}

/** 原子写一条本地 agent 记录（POST/PATCH /api/agents 的持久化终点）。 */
export function writeAgentFile(record: Record<string, unknown>): void {
  const id = String(record.agent_id ?? '');
  assertSafeAgentId(id);
  const file = repoDataFile('agents', `${id}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(record, null, 2), 'utf-8');
  fs.renameSync(tmp, file);
}

/** 删除本地 agent JSON；文件不存在返回 false（yaml 模板删除走 agent-yaml）。 */
export function deleteAgentFile(agentId: string): boolean {
  assertSafeAgentId(agentId);
  const file = repoDataFile('agents', `${agentId}.json`);
  if (!fs.existsSync(file)) return false;
  fs.unlinkSync(file);
  return true;
}

/** 转成 /api/agents 的 wire 记录形状（缺失字段补安全默认）。 */
export function toAgentWireRecord(rec: LocalAgentRecord): Record<string, unknown> {
  return {
    agent_id: rec.agent_id,
    name: rec.name,
    soul: rec.soul,
    workspace_id: typeof rec['workspace_id'] === 'string' ? rec['workspace_id'] : 'default',
    blueprint:
      rec['blueprint'] && typeof rec['blueprint'] === 'object'
        ? (rec['blueprint'] as Record<string, unknown>)
        : {},
    status: typeof rec['status'] === 'string' ? rec['status'] : 'idle',
    source: typeof rec['source'] === 'string' ? rec['source'] : 'catalog',
    created_at: typeof rec['created_at'] === 'string' ? rec['created_at'] : '',
  };
}

/** 保留 path 依赖（未来按需扩展 workspace 子目录时用）。 */
export const _agentsDir = (): string => path.join(repoDataFile('agents'));
