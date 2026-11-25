/**
 * teams-store.ts — 单后端迁移：/api/teams 的 Node 数据层
 * （移植自 Python backend/python/shadowflow/api/agents/teams.py 的存储与校验段）。
 *
 * 存储：<repo>/.shadowflow/teams/{team_id}.json，一队一文件，原子写 tmp+rename，
 * 与 Python legacy 读写同一目录（SHADOWFLOW_DATA_DIR 可覆盖，语义对齐 wallet.py）。
 *
 * 移植的三条关键语义（D1/D2/D3，注释与 Python 侧逐条对齐）：
 *   D1 workflow 写前 DAG 校验：禁自环 / 边端点必须是已知节点 / 顺序边不成环
 *      （conditional 是合法回边，不参与环检测）。本仓 workflow 是前端画布的
 *      「包装形」{nodes:[{id,data:{agentId}}], edges:[{source,target,data:{mode}}]}，
 *      校验前先展平成 lib/team-dag-draft.ts 的草案形再调 validateDagDraft。
 *   D2 agent 存在校验：被引用的 agentId 必须能在本地 agent 库解析。本地来源 =
 *      repoDataFile('agents')/*.json 的 agent_id（Python /api/agents 读的也是这
 *      个目录，同源等价）∪ yaml 模板 id 在 routes 层由调用方按需并入。
 *   D3 老记录（无 workspace_id 字段）归一到 'unassigned' 哨兵：不再做跨
 *      workspace 通配符，只在 ?workspace_id=unassigned 或不过滤时出现。
 *
 * 纯存储 + 纯校验函数，路由语义在 routes/agents/teams-store.ts。
 */

import fs from 'fs';
import path from 'path';
import { repoDataFile } from '../adapters/infra-repo-root';
// 纯规则已迁至 domains/collaboration（D1/D2/D3），单一真源、可独立单测；
// 本文件保留 JSON 文件 I/O（一队一文件、原子写）与装配，导出名原样保留。
import {
  UNASSIGNED_WORKSPACE,
  isValidTeamId,
  normalizeWorkspaceId,
  defaultWorkflow,
  workflowStoredAgentIds,
  roleFromSoul,
  type TeamWorkflowGraph,
  type TeamRecord,
  type LocalAgentSummary,
} from './collaboration-models/teams-model';
import { validateWorkflowStoredShape } from './collaboration-models/use_cases/teams';

export {
  UNASSIGNED_WORKSPACE,
  isValidTeamId,
  normalizeWorkspaceId,
  defaultWorkflow,
  workflowStoredAgentIds,
  validateWorkflowStoredShape,
};
export type { TeamWorkflowGraph, TeamRecord, LocalAgentSummary };

function teamFile(teamId: string): string {
  return repoDataFile('teams', `${teamId}.json`);
}

export function loadTeamRecord(teamId: string): TeamRecord | null {
  const file = teamFile(teamId);
  try {
    if (!fs.existsSync(file)) return null;
    const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf-8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as TeamRecord;
  } catch {
    return null;
  }
}

/** 原子写：tmp + rename（同 Python _save_team 的 mkstemp/os.replace 手法）。 */
export function saveTeamRecord(record: TeamRecord): void {
  const file = teamFile(record.team_id);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(record), 'utf-8');
  fs.renameSync(tmp, file);
}

/**
 * 列出团队记录，按文件名排序（与 Python sorted(d.glob('*.json')) 同序）。
 * workspaceId 为 null 表示不过滤（返回全部）；否则按 D3 归一后精确匹配。
 */
export function listTeams(workspaceId: string | null): TeamRecord[] {
  const dir = repoDataFile('teams');
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const out: TeamRecord[] = [];
  for (const name of entries.filter((f) => f.endsWith('.json')).sort()) {
    const rec = loadTeamRecord(name.slice(0, -'.json'.length));
    if (!rec) continue;
    if (workspaceId === null) {
      out.push(rec);
      continue;
    }
    const recWs = typeof rec.workspace_id === 'string' ? rec.workspace_id : undefined;
    if (normalizeWorkspaceId(recWs) === workspaceId) out.push(rec);
  }
  return out;
}

export function deleteTeamFile(teamId: string): boolean {
  const file = teamFile(teamId);
  try {
    if (!fs.existsSync(file)) return false;
    fs.unlinkSync(file);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// 本地 agent 库（D2 的存在性来源；也是 dag-draft roster 的本地化来源）
// ---------------------------------------------------------------------------

/**
 * 扫 repoDataFile('agents')/*.json 取 agent 摘要。Python 的 agent store
 * （shadowflow.api.agents.agents._AGENTS_DIR）读的是同一目录，因此
 * single 模式本地化后与 legacy Python /api/agents 同源等价。
 */
export function listLocalAgentSummaries(): LocalAgentSummary[] {
  const dir = repoDataFile('agents');
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const out: LocalAgentSummary[] = [];
  for (const name of entries.filter((f) => f.endsWith('.json')).sort()) {
    let rec: Record<string, unknown> | null = null;
    try {
      rec = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf-8')) as Record<string, unknown>;
    } catch {
      rec = null;
    }
    const id =
      typeof rec?.agent_id === 'string' && rec.agent_id
        ? rec.agent_id
        : name.slice(0, -'.json'.length);
    const rawName = typeof rec?.name === 'string' && rec.name ? rec.name : id;
    const role = roleFromSoul(rec?.soul);
    out.push({ id, name: rawName, ...(role ? { role } : {}) });
  }
  return out;
}

export function listLocalAgentIds(): string[] {
  return listLocalAgentSummaries().map((a) => a.id);
}
