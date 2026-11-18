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
import {
  validateDagDraft,
  normalizeDraftEdgeMode,
  type DagDraftEdge,
  type DagDraftNode,
} from '../lib/team-dag-draft';
import { repoDataFile } from './repo-root';

/** D3：pre-workspace 老记录的哨兵 workspace（Python UNASSIGNED_WORKSPACE）。 */
export const UNASSIGNED_WORKSPACE = 'unassigned';

/** 对齐 Python _TEAM_ID_RE：常见 id 字符，禁路径穿越。 */
const TEAM_ID_RE = /^[a-zA-Z0-9_-]+$/;

export function isValidTeamId(teamId: string): boolean {
  return TEAM_ID_RE.test(teamId);
}

/** 缺失/空白 → 'unassigned' 哨兵；显式 id（含 legacy 字面 'default'）原样返回。 */
export function normalizeWorkspaceId(workspaceId: string | null | undefined): string {
  if (workspaceId === null || workspaceId === undefined || !workspaceId.trim()) {
    return UNASSIGNED_WORKSPACE;
  }
  return workspaceId;
}

function teamFile(teamId: string): string {
  return repoDataFile('teams', `${teamId}.json`);
}

/** 团队工作流图的「存储形」——前端画布落库的原样包装。 */
export interface TeamWorkflowGraph {
  nodes: unknown[];
  edges: unknown[];
}

export interface TeamRecord {
  team_id: string;
  name: string;
  description: string;
  workspace_id: string;
  agent_ids: string[];
  created_at: string;
  updated_at: string;
  workflow?: TeamWorkflowGraph;
  policy_matrix?: Record<string, unknown>;
  validation_hooks?: unknown[];
  // 老记录可能带未知字段（Python json.dumps 原样落盘）——读写全量透传，不丢弃。
  [key: string]: unknown;
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

/** GET …/workflow 无保存图时的缺省返回（对齐 Python teams.py:333）。 */
export function defaultWorkflow(): TeamWorkflowGraph {
  return { nodes: [], edges: [] };
}

// ---------------------------------------------------------------------------
// 存储形 workflow ↔ 草案形展平（喂给 validateDagDraft 做 D1）
// ---------------------------------------------------------------------------

/** 从节点对象抽 (id, agentId)：兼容包装形 {id,data:{agentId}} 与裸形 {id,agentId}。 */
function nodeIdentity(n: unknown): { id: string; agentId?: string } | null {
  if (!n || typeof n !== 'object' || Array.isArray(n)) return null;
  const o = n as Record<string, unknown>;
  if (typeof o.id !== 'string') return null;
  let agentId: string | undefined;
  const data = o.data;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const d = data as Record<string, unknown>;
    if (typeof d.agentId === 'string' && d.agentId.trim()) agentId = d.agentId.trim();
  }
  if (!agentId && typeof o.agentId === 'string' && o.agentId.trim()) {
    agentId = o.agentId.trim();
  }
  return { id: o.id, ...(agentId ? { agentId } : {}) };
}

function edgeIdentity(e: unknown): { source: string; target: string; mode: unknown } | null {
  if (!e || typeof e !== 'object' || Array.isArray(e)) return null;
  const o = e as Record<string, unknown>;
  if (typeof o.source !== 'string' || typeof o.target !== 'string') return null;
  const data = o.data;
  const mode =
    data && typeof data === 'object' && !Array.isArray(data)
      ? (data as Record<string, unknown>).mode
      : o.mode;
  return { source: o.source, target: o.target, mode };
}

/**
 * D1（Python team_validation.validate_workflow 的存储形镜像）：结构错误返回
 * 错误串列表（空 = 合法），绝不抛。畸形节点静默跳过（端点缺失由边报错），
 * 与 Python 一致。
 */
export function validateWorkflowStoredShape(workflow: TeamWorkflowGraph): string[] {
  const nodes: DagDraftNode[] = [];
  const edges: DagDraftEdge[] = [];
  for (const n of workflow.nodes) {
    const id = nodeIdentity(n);
    if (id) nodes.push({ id: id.id, ...(id.agentId ? { agentId: id.agentId } : {}) });
  }
  for (const e of workflow.edges) {
    const ee = edgeIdentity(e);
    if (ee) edges.push({ source: ee.source, target: ee.target, mode: normalizeDraftEdgeMode(ee.mode) });
  }
  return validateDagDraft({ nodes, edges });
}

/** 抽取节点引用的非空 agentId（D2 用；coordinator 占位节点的空 agentId 跳过）。 */
export function workflowStoredAgentIds(workflow: TeamWorkflowGraph): string[] {
  const out: string[] = [];
  for (const n of workflow.nodes) {
    const id = nodeIdentity(n);
    if (id?.agentId) out.push(id.agentId);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 本地 agent 库（D2 的存在性来源；也是 dag-draft roster 的本地化来源）
// ---------------------------------------------------------------------------

export interface LocalAgentSummary {
  id: string;
  name: string;
  /** soul 首个非空行（对齐 Python /api/agents 把 soul 当 role 摘要带出）。 */
  role?: string;
}

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
    const soul = typeof rec?.soul === 'string' ? rec.soul : '';
    const role = soul.split('\n').find((l) => l.trim().length > 0)?.trim();
    out.push({ id, name: rawName, ...(role ? { role } : {}) });
  }
  return out;
}

export function listLocalAgentIds(): string[] {
  return listLocalAgentSummaries().map((a) => a.id);
}
