/**
 * routes/projects/catalog.ts — 单后端迁移：Agent Catalog API（Story 8.7）
 *
 * 移植自 python backend/python/shadowflow/api/projects/catalog.py +
 * runtime/catalog_service.py。三个端点，全走 {data, meta} 信封：
 *
 *   GET  /api/catalog/apps                 — 列表 + 过滤 + 搜索 + 分页
 *   GET  /api/catalog/apps/:app_id         — 脱敏详情（AC3：无敏感字段）
 *   POST /api/catalog/apps/:app_id/fork    — 克隆快照 → 新 Blueprint（AC6）
 *
 * mode=='team' 的模板 fork 额外物化（T04 一键 fork 黄金路径，_materialize_team_fork
 * 同构移植）：role_profiles → .shadowflow/agents/*.json，metadata.team_dag →
 * .shadowflow/teams/team-*.json（workflow nodes/edges；approve 边 = L6 审批门，
 * conditional 边 = 驳回回炉）+ .shadowflow/team_workflow_versions/{team_id}.json
 * 初始版本快照。写前走 team_validation 的 D1（DAG 结构）+ D2（agent 存在性），
 * 与 Python teams.py 写路径同一套规则，失败抛 CATALOG_BLUEPRINT_INVALID。
 *
 * 错误体 {error:{code,message}}（数据层错误码）：
 *   400 INVALID_APP_ID / 404 CATALOG_APP_NOT_FOUND / 500 CATALOG_SNAPSHOT_MISSING /
 *   422 CATALOG_BLUEPRINT_INVALID；成功 meta 带 trace_id（'trace-' + 12 位 hex）。
 */

import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import {
  CatalogError,
  getApp,
  forkRecord,
  listApps,
  redactBlueprintSnapshot,
} from '../../storage/catalog';
import { repoDataFile } from '../../storage/repo-root';

const router = Router();

// ---------------------------------------------------------------------------
// helpers — _ok / trace_id
// ---------------------------------------------------------------------------

function ok(res: Response, data: unknown, meta: Record<string, unknown> = {}): void {
  res.json({ data, meta });
}

/** meta.trace_id = 'trace-' + uuid4().hex[:12] 同形。 */
function newTraceId(): string {
  return `trace-${randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

/** FastAPI HTTPException(detail={error:{code,message}}) 的 JSON 等价体。 */
function fail(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ error: { code, message } });
}

/** 统一把数据层 CatalogError 映射到 HTTP（稳定 error code，AC7）。 */
function failCatalog(res: Response, err: unknown): void {
  // fork 物化校验（validateWorkflow 失败路径）抛的是带 .code 的普通 Error 而
  // 非 CatalogError 实例——凡带 CATALOG_* code 的一律按同一张码表映射。
  const plainCode = (err as { code?: unknown })?.code;
  const code =
    err instanceof CatalogError
      ? err.code
      : typeof plainCode === 'string' && plainCode.startsWith('CATALOG_')
        ? plainCode
        : null;
  if (code) {
    const status =
      code === 'CATALOG_APP_NOT_FOUND'
        ? 404
        : code === 'CATALOG_BLUEPRINT_INVALID'
          ? 422
          : code === 'CATALOG_SNAPSHOT_MISSING'
            ? 500
            : 400;
    fail(res, status, code, (err as Error).message);
    return;
  }
  fail(res, 400, 'INVALID_APP_ID', (err as Error)?.message ?? 'invalid app_id');
}

// ---------------------------------------------------------------------------
// Team fork 物化（_materialize_team_fork 同构移植，落库用 repoDataFile）
// ---------------------------------------------------------------------------

/** 允许的边 mode（对齐 team_validation._map_mode / 前端 TeamWorkflowEdge） */
const EDGE_MODES = new Set(['direct', 'approve', 'conditional', 'parallel']);

type Obj = Record<string, unknown>;

/** 原子写 JSON（tmp + rename，与 python os.replace 等价）。 */
function writeJsonAtomic(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmp, file);
}

/** Python agents._save_agent 同构：.shadowflow/agents/{agent_id}.json。 */
function saveAgentFile(record: Obj): void {
  const agentId = String(record['agent_id'] ?? '');
  if (!/^[a-zA-Z0-9_-]+$/.test(agentId)) {
    throw new Error(`Invalid agent_id: ${JSON.stringify(agentId)}`);
  }
  writeJsonAtomic(repoDataFile('agents', `${agentId}.json`), record);
}

/** Python teams._save_team 同构：.shadowflow/teams/{team_id}.json。 */
function saveTeamFile(record: Obj): void {
  const teamId = String(record['team_id'] ?? '');
  if (!/^[a-zA-Z0-9_-]+$/.test(teamId)) {
    throw new Error(`Invalid team_id: ${JSON.stringify(teamId)}`);
  }
  writeJsonAtomic(repoDataFile('teams', `${teamId}.json`), record);
}

// ── D1：DAG 结构校验（team_validation.validate_workflow 同构移植） ────────────

/** cycle 检测只看 sequential 边；conditional/parallel 合法回边，排除在外。 */
function mapEdgeMode(mode: unknown): string {
  if (mode === 'conditional') return 'conditional';
  if (mode === 'parallel') return 'parallel';
  return 'sequential';
}

function findCycle(nodes: string[], edges: Array<{ from: string; to: string }>): string[] | null {
  const graph = new Map<string, string[]>();
  for (const n of nodes) graph.set(n, []);
  for (const e of edges) {
    const list = graph.get(e.from) ?? [];
    list.push(e.to);
    graph.set(e.from, list);
  }
  const visited = new Set<string>();
  const stack = new Set<string>();
  const path: string[] = [];

  const dfs = (n: string): string[] | null => {
    if (stack.has(n)) {
      const start = path.indexOf(n);
      return path.slice(start).concat([n]);
    }
    if (visited.has(n)) return null;
    visited.add(n);
    stack.add(n);
    path.push(n);
    for (const nxt of graph.get(n) ?? []) {
      const r = dfs(nxt);
      if (r) return r;
    }
    stack.delete(n);
    path.pop();
    return null;
  };

  for (const n of Array.from(graph.keys())) {
    if (!visited.has(n)) {
      const r = dfs(n);
      if (r) return r;
    }
  }
  return null;
}

/** 返回错误串数组（空 = 合法）。校验对象是 node id（运行时形状）。 */
function validateWorkflow(workflow: Obj): string[] {
  const rawNodes = Array.isArray(workflow['nodes']) ? workflow['nodes'] : [];
  const rawEdges = Array.isArray(workflow['edges']) ? workflow['edges'] : [];
  const nodeIds: string[] = [];
  for (const n of rawNodes) {
    if (n && typeof n === 'object' && typeof (n as Obj)['id'] === 'string') {
      nodeIds.push(String((n as Obj)['id']));
    }
  }
  const generic: Array<{ from: unknown; to: unknown; kind: string }> = rawEdges.map((e) => {
    if (!e || typeof e !== 'object') return { from: null, to: null, kind: 'sequential' };
    const o = e as Obj;
    const data = o['data'];
    const mode = data && typeof data === 'object' ? (data as Obj)['mode'] : null;
    return { from: o['source'], to: o['target'], kind: mapEdgeMode(mode) };
  });

  const errs: string[] = [];
  const memberSet = new Set(nodeIds);
  const cleanEdges: Array<{ from: string; to: string; kind: string }> = [];
  for (const e of generic) {
    if (typeof e.from !== 'string' || typeof e.to !== 'string') {
      errs.push(`malformed edge entry (needs string 'from'/'to')`);
      continue;
    }
    if (e.from === e.to) {
      errs.push(`self-loop edge "${e.from}" → "${e.to}" is not allowed`);
      continue;
    }
    if (!memberSet.has(e.from)) {
      errs.push(`edge "${e.from}" → "${e.to}": "${e.from}" is not a team member`);
    }
    if (!memberSet.has(e.to)) {
      errs.push(`edge "${e.from}" → "${e.to}": "${e.to}" is not a team member`);
    }
    cleanEdges.push({ from: e.from, to: e.to, kind: e.kind });
  }
  const seqEdges = cleanEdges.filter((e) => e.kind === 'sequential');
  const cycle = findCycle(nodeIds, seqEdges);
  if (cycle) errs.push('cycle detected via sequential edges: ' + cycle.join(' → '));
  return errs;
}

function workflowAgentIds(workflow: Obj): string[] {
  const out: string[] = [];
  const nodes = Array.isArray(workflow['nodes']) ? workflow['nodes'] : [];
  for (const n of nodes) {
    if (!n || typeof n !== 'object') continue;
    const data = (n as Obj)['data'];
    if (data && typeof data === 'object') {
      const aid = (data as Obj)['agentId'];
      if (typeof aid === 'string' && aid.trim()) out.push(aid);
    }
  }
  return out;
}

/** D2：agent 存在性探测 —— 直接查共享 agent 库文件（.shadowflow/agents/{id}.json）。 */
function agentExistsInStore(agentId: string): boolean {
  try {
    return fs.existsSync(repoDataFile('agents', `${agentId}.json`));
  } catch {
    return false;
  }
}

function validateAgentIds(agentIds: string[]): string[] {
  const errs: string[] = [];
  for (const aid of agentIds) {
    if (!agentExistsInStore(aid)) {
      errs.push(`agent "${aid}" does not exist in the agent store (referenced by team but not found)`);
    }
  }
  return errs;
}

// ── _build_default_blueprint 同构（agents.py quick_create 同款） ─────────────

const DEFAULT_MCP_SERVERS = ['shadowflow-shell', 'shadowflow-fs', 'shadowflow-web'];
const DEFAULT_LLM_PROVIDER = 'anthropic';
const DEFAULT_LLM_MODEL = 'claude-sonnet-4-6';
const DEFAULT_MAX_ITERATIONS = 10;
const DEFAULT_EXECUTOR_KIND = 'api';

interface ForkRole {
  role_id: string;
  name: string;
  description: string;
  persona: string;
  tools: unknown;
  raci: unknown;
  executor_provider: string;
  executor_model: string;
}

function buildDefaultBlueprint(role: ForkRole): Obj {
  const rawTools = Array.isArray(role.tools) ? role.tools : [];
  const toolIds = rawTools
    .map((t) => String(t).trim())
    .filter((t) => t.length > 0);
  const finalTools = toolIds.length > 0 ? toolIds : DEFAULT_MCP_SERVERS.slice();
  const raciRaw = role.raci && typeof role.raci === 'object' && !Array.isArray(role.raci)
    ? (role.raci as Record<string, unknown>)
    : {};
  const cleanRaci: Record<string, string> = {};
  for (const [k, v] of Object.entries(raciRaw)) {
    const up = String(v).toUpperCase();
    if (['R', 'A', 'C', 'I'].includes(up)) cleanRaci[k] = up;
  }
  const model = typeof role.executor_model === 'string' && role.executor_model.trim()
    ? role.executor_model.trim()
    : DEFAULT_LLM_MODEL;
  const soul = String(role.persona || role.description || role.name);
  return {
    blueprint_id: `bp-${randomUUID().replace(/-/g, '').slice(0, 12)}`,
    version: '1.0',
    name: role.name,
    goal: soul,
    audience: '',
    mode: 'single',
    role_profiles: [
      {
        role_id: `role-${randomUUID().replace(/-/g, '').slice(0, 8)}`,
        name: role.name,
        description: soul,
        persona: soul,
        responsibilities: [],
        raci: cleanRaci,
        constraints: [],
        tools: finalTools,
        executor_kind: DEFAULT_EXECUTOR_KIND,
        executor_provider: role.executor_provider || DEFAULT_LLM_PROVIDER,
        executor_model: model,
        capabilities: [],
        handoff_rules: [],
        persona_traits: {},
        state_fields: [],
        can_spawn_tasks: false,
        sub_agents: [],
        metadata: {},
        collaboration_contract: null,
      },
    ],
    tool_policies: finalTools.map((toolId) => ({
      tool_id: toolId,
      provider_id: null,
      credentials_ref: null,
      visibility: 'enabled',
      permission_rules: [],
      default_permission: 'allow',
      trust_level: 'external',
      side_effects: 'read_only',
      requires_confirmation: false,
      metadata: {},
    })),
    knowledge_bindings: [],
    memory_profile: {
      scope: 'session',
      writeback_target: null,
      enabled: true,
      metadata: {},
    },
    eval_profile: {
      smoke_eval_enabled: false,
      eval_criteria: [],
      regression_gate: false,
      metadata: {},
    },
    publish_profile: {
      target: 'none',
      visibility: 'private',
      publish_ref: '',
      metadata: {},
    },
    metadata: { source: 'quick_hire', max_iterations: DEFAULT_MAX_ITERATIONS },
    execution_mode: null,
  };
}

// ── _materialize_team_fork 主体 ──────────────────────────────────────────────

interface MaterializeResult {
  agents: Array<{ agent_id: string; name: string }>;
  team: Obj;
}

function materializeTeamFork(
  blueprint: Obj,
  sourceAppId: string,
  workspaceId?: string,
): MaterializeResult {
  const ws = String(workspaceId ?? '').trim() || 'default';
  const now = new Date().toISOString();

  const rolesRaw = Array.isArray(blueprint['role_profiles']) ? blueprint['role_profiles'] : [];
  const roles: ForkRole[] = [];
  for (const r of rolesRaw) {
    if (!r || typeof r !== 'object' || Array.isArray(r)) continue;
    const o = r as Obj;
    roles.push({
      role_id: String(o['role_id'] ?? ''),
      name: String(o['name'] ?? ''),
      description: String(o['description'] ?? ''),
      persona: String(o['persona'] ?? ''),
      tools: o['tools'],
      raci: o['raci'],
      executor_provider: String(o['executor_provider'] ?? DEFAULT_LLM_PROVIDER),
      executor_model: String(o['executor_model'] ?? DEFAULT_LLM_MODEL),
    });
  }

  // 1) 每个 role_profile → 一个 agent 记录（D2 前提：先落 agents 再落 team）
  const agentIdByRole = new Map<string, string>();
  const agentsOut: Array<{ agent_id: string; name: string }> = [];
  for (const role of roles) {
    const agentId = `agent-${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const soul = (role.persona || role.description || role.name).trim();
    const agentBp = buildDefaultBlueprint(role);
    const metaRaw = agentBp['metadata'];
    agentBp['metadata'] = {
      ...((metaRaw && typeof metaRaw === 'object' && !Array.isArray(metaRaw)
        ? (metaRaw as Obj)
        : {}) as Obj),
      source: 'catalog_fork',
      forked_from: sourceAppId,
    };
    const record: Obj = {
      agent_id: agentId,
      name: role.name,
      soul,
      workspace_id: ws,
      blueprint: agentBp,
      status: 'idle',
      source: 'catalog_fork',
      created_at: now,
      avatar_color: null,
    };
    saveAgentFile(record);
    agentIdByRole.set(role.role_id, agentId);
    agentsOut.push({ agent_id: agentId, name: role.name });
  }

  // 2) metadata.team_dag → team workflow（node role_id 映射到新 agent_id）
  const metaRaw = blueprint['metadata'];
  const bpMeta: Obj =
    metaRaw && typeof metaRaw === 'object' && !Array.isArray(metaRaw) ? (metaRaw as Obj) : {};
  const dagRaw = bpMeta['team_dag'];
  const dag: Obj = dagRaw && typeof dagRaw === 'object' && !Array.isArray(dagRaw) ? (dagRaw as Obj) : {};
  const roleById = new Map<string, ForkRole>();
  for (const r of roles) roleById.set(r.role_id, r);

  const nodes: Obj[] = [];
  const dagNodes = Array.isArray(dag['nodes']) ? dag['nodes'] : [];
  dagNodes.forEach((n, i) => {
    if (!n || typeof n !== 'object' || Array.isArray(n)) return;
    const o = n as Obj;
    const roleId = String(o['role_id'] ?? '');
    const role = roleById.get(roleId);
    if (!role) return;
    const posRaw = o['position'];
    const pos: Obj = posRaw && typeof posRaw === 'object' && !Array.isArray(posRaw) ? (posRaw as Obj) : {};
    nodes.push({
      id: typeof o['id'] === 'string' && o['id'] ? o['id'] : role.role_id,
      type: 'agentTask',
      position: {
        x: Number(pos['x'] ?? 60),
        y: Number(pos['y'] ?? 40 + i * 110),
      },
      data: {
        agentId: agentIdByRole.get(role.role_id),
        name: role.name,
        soul: (role.description || role.name).slice(0, 120),
      },
    });
  });
  if (nodes.length === 0) {
    // 模板没带 team_dag：退化为纵向自动布局、无边，保证 team 仍可建可跑
    roles.forEach((role, i) => {
      nodes.push({
        id: role.role_id,
        type: 'agentTask',
        position: { x: 60, y: 40 + i * 110 },
        data: {
          agentId: agentIdByRole.get(role.role_id),
          name: role.name,
          soul: (role.description || role.name).slice(0, 120),
        },
      });
    });
  }
  const edges: Obj[] = [];
  const dagEdges = Array.isArray(dag['edges']) ? dag['edges'] : [];
  for (const e of dagEdges) {
    if (!e || typeof e !== 'object' || Array.isArray(e)) continue;
    const o = e as Obj;
    const src = o['source'];
    const dst = o['target'];
    if (typeof src !== 'string' || typeof dst !== 'string') continue;
    const mode = o['mode'];
    const edge: Obj = {
      id: typeof o['id'] === 'string' && o['id'] ? o['id'] : `e-${src}-${dst}`,
      source: src,
      target: dst,
      data: { mode: EDGE_MODES.has(mode as string) ? mode : 'direct' },
    };
    if (typeof o['label'] === 'string' && o['label']) edge['label'] = o['label'];
    edges.push(edge);
  }
  const workflow: Obj = { nodes, edges };

  // 3) 与 teams.py 写路径相同的 D1+D2 校验，不过则视为模板快照损坏
  const errors = validateWorkflow(workflow);
  errors.push(...validateAgentIds(workflowAgentIds(workflow)));
  if (errors.length > 0) {
    const err = new Error(
      `Team template fork materialization failed validation: ${errors.join('; ')}`,
    ) as Error & { code?: string; details?: unknown };
    err.code = 'CATALOG_BLUEPRINT_INVALID';
    err.details = { app_id: sourceAppId, errors };
    throw err;
  }

  const teamId = `team-${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const teamRecord: Obj = {
    team_id: teamId,
    name: String(blueprint['name'] ?? ''),
    description: String(blueprint['goal'] ?? '').slice(0, 500),
    workspace_id: ws,
    agent_ids: agentsOut.map((a) => a.agent_id),
    created_at: now,
    updated_at: now,
    workflow,
    policy_matrix: {},
  };
  saveTeamFile(teamRecord);

  // 版本仓初始快照（python team_workflow_versions.record_version 同构）：
  // teams.py 的 workflow 保存路径每次成功保存自动记一版，fork 物化保持同语义。
  const store = {
    team_id: teamId,
    versions: [
      {
        version: 1,
        saved_at: now,
        summary: null,
        workflow,
      },
    ],
  };
  writeJsonAtomic(repoDataFile('team_workflow_versions', `${teamId}.json`), store);

  return { agents: agentsOut, team: teamRecord };
}

// ---------------------------------------------------------------------------
// endpoints
// ---------------------------------------------------------------------------

// GET /apps — 列表 + 过滤 + 搜索 + 分页（query: kit_type/q/page/page_size）
router.get('/apps', (req: Request, res: Response) => {
  const pageRaw = Number.parseInt(String(req.query.page ?? '1'), 10);
  const pageSizeRaw = Number.parseInt(String(req.query.page_size ?? '20'), 10);
  const result = listApps({
    kit_type: typeof req.query.kit_type === 'string' ? req.query.kit_type : 'all',
    q: typeof req.query.q === 'string' ? req.query.q : '',
    page: Number.isFinite(pageRaw) ? pageRaw : 1,
    page_size: Number.isFinite(pageSizeRaw) ? pageSizeRaw : 20,
  });
  ok(
    res,
    { apps: result.apps },
    {
      total: result.total,
      page: result.page,
      page_size: result.page_size,
      kit_type: typeof req.query.kit_type === 'string' ? req.query.kit_type : 'all',
      q: typeof req.query.q === 'string' ? req.query.q : '',
    },
  );
});

// GET /apps/:app_id — 脱敏详情（AC3 — 无敏感字段）
router.get('/apps/:app_id', (req: Request, res: Response) => {
  const appId = req.params.app_id;
  try {
    const detail = getApp(appId);
    ok(res, detail, { trace_id: newTraceId() });
  } catch (err) {
    failCatalog(res, err);
  }
});

// POST /apps/:app_id/fork — 克隆快照 → 新 Blueprint（AC6）
router.post('/apps/:app_id/fork', (req: Request, res: Response) => {
  const appId = req.params.app_id;
  const body = (req.body ?? {}) as { workspace_id?: unknown };
  const workspaceId = typeof body.workspace_id === 'string' ? body.workspace_id : undefined;
  try {
    const result = forkRecord(appId);
    const data: Obj = {
      blueprint_id: result.blueprint_id,
      forked_from: result.forked_from,
      blueprint: redactBlueprintSnapshot(result.blueprint),
    };
    if (String(result.blueprint['mode'] ?? 'single') === 'team') {
      const materialized = materializeTeamFork(result.blueprint, appId, workspaceId);
      data['agents'] = materialized.agents;
      data['team'] = materialized.team;
    }
    ok(res, data, { trace_id: newTraceId() });
  } catch (err) {
    failCatalog(res, err);
  }
});

// 兜底：/apps 下的未知子路径 → 404 CATALOG_APP_NOT_FOUND（FastAPI 404 语义等价）
router.use('/apps/:rest', (req: Request, res: Response) => {
  void req;
  fail(res, 404, 'CATALOG_APP_NOT_FOUND', 'Catalog app not found');
});

export default router;
