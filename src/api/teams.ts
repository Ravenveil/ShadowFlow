/**
 * Teams API client — Story 12.2 Team 创建 & 角色组装
 *
 * Thin wrapper around POST/GET/PATCH/DELETE /api/teams endpoints.
 */

import { getApiBase } from './_base';
import { buildByokHeaders } from './chat';
import { markPythonDown, markPythonUp } from '../core/hooks/usePythonBackendStatus';
const API_BASE_URL = getApiBase();

export class TeamApiError extends Error {
  public readonly code: string;

  constructor(
    public status: number,
    public detail: unknown,
    code: string = '',
  ) {
    super(`Team API error ${status}`);
    this.code = code || `HTTP_${status}`;
  }
}

function _extractErrorCode(detail: unknown): string {
  if (detail && typeof detail === 'object') {
    const inner = (detail as Record<string, unknown>).error;
    if (inner && typeof inner === 'object') {
      const code = (inner as Record<string, unknown>).code;
      if (typeof code === 'string') return code;
    }
  }
  return '';
}

async function _handleResponse<T>(res: Response): Promise<T> {
  if (res.ok) {
    // Reaching Python successfully → flip the global banner off if it was on.
    markPythonUp();
    return res.json() as Promise<T>;
  }
  const body = await res.text();
  let detail: unknown = body;
  try {
    detail = JSON.parse(body);
  } catch {
    // keep raw
  }
  const code = _extractErrorCode(detail);
  // 503 + PYTHON_BACKEND_UNAVAILABLE → push status to the global banner so
  // every page mounting <PythonBackendBanner /> shows it without waiting for
  // its 20s poll.
  if (res.status === 503 && code === 'PYTHON_BACKEND_UNAVAILABLE') {
    const errInner =
      detail && typeof detail === 'object' && 'error' in (detail as Record<string, unknown>)
        ? ((detail as Record<string, unknown>).error as { code?: string; message?: string; hint?: string })
        : undefined;
    markPythonDown({
      code: errInner?.code ?? 'PYTHON_BACKEND_UNAVAILABLE',
      message: errInner?.message ?? 'Python backend not reachable',
      hint: errInner?.hint,
    });
  }
  throw new TeamApiError(res.status, detail, code);
}

interface Envelope<T> {
  data: T;
  meta: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TeamRecord {
  team_id: string;
  name: string;
  description: string;
  workspace_id: string;
  agent_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface CreateTeamRequest {
  name: string;
  description?: string;
  agent_ids: string[];
  workspace_id?: string;
}

export interface PatchTeamRequest {
  name?: string;
  description?: string;
  /** Move the team into a different workspace (e.g. user created a new one). */
  workspace_id?: string;
  add_agent_ids?: string[];
  remove_agent_ids?: string[];
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

export async function createTeam(req: CreateTeamRequest): Promise<TeamRecord> {
  const res = await fetch(`${API_BASE_URL}/api/teams`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  const env = await _handleResponse<Envelope<TeamRecord>>(res);
  return env.data;
}

export async function listTeams(workspaceId?: string): Promise<TeamRecord[]> {
  // 2026-05-11 fix — `new URL('/api/teams')` (no host) throws TypeError. When
  // API_BASE_URL is empty (default, relative URLs go through Vite proxy) we
  // build the query string manually instead. Symptom was `/teams` page
  // permanently stuck on 加载失败 even though Node proxy returned 200.
  const qs = workspaceId ? `?workspace_id=${encodeURIComponent(workspaceId)}` : '';
  const res = await fetch(`${API_BASE_URL}/api/teams${qs}`);
  const env = await _handleResponse<Envelope<TeamRecord[]>>(res);
  return env.data;
}

export async function getTeam(teamId: string): Promise<TeamRecord> {
  const res = await fetch(`${API_BASE_URL}/api/teams/${teamId}`);
  const env = await _handleResponse<Envelope<TeamRecord>>(res);
  return env.data;
}

export async function patchTeam(teamId: string, req: PatchTeamRequest): Promise<TeamRecord> {
  const res = await fetch(`${API_BASE_URL}/api/teams/${teamId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  const env = await _handleResponse<Envelope<TeamRecord>>(res);
  return env.data;
}

export async function deleteTeam(teamId: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/teams/${teamId}`, {
    method: 'DELETE',
  });
  if (!res.ok && res.status !== 204) {
    const body = await res.text();
    let detail: unknown = body;
    try { detail = JSON.parse(body); } catch { /* raw */ }
    throw new TeamApiError(res.status, detail, _extractErrorCode(detail));
  }
}

// ---------------------------------------------------------------------------
// Workflow endpoints — Story 12-3
// ---------------------------------------------------------------------------

export interface TeamWorkflow {
  nodes: TeamWorkflowNode[];
  edges: TeamWorkflowEdge[];
}

export interface TeamWorkflowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: { agentId: string; name: string; soul: string };
}

export interface TeamWorkflowEdge {
  id: string;
  source: string;
  target: string;
  /**
   * 边模式（后端 team_validation._map_mode 对齐）：direct/approve 归为
   * sequential（参与环检测），conditional（驳回回炉/条件回边）与 parallel
   * 不参与 —— 存量数据里 conditional 是真实存在的，不能收窄成 direct。
   */
  data?: { mode: 'direct' | 'approve' | 'conditional' | 'parallel' };
  label?: string;
}

export async function getTeamWorkflow(teamId: string): Promise<TeamWorkflow> {
  const res = await fetch(`${API_BASE_URL}/api/teams/${teamId}/workflow`);
  if (!res.ok) return { nodes: [], edges: [] };
  const env = await _handleResponse<Envelope<TeamWorkflow>>(res);
  return env.data ?? { nodes: [], edges: [] };
}

export async function putTeamWorkflow(teamId: string, workflow: TeamWorkflow): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/teams/${teamId}/workflow`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(workflow),
  });
  if (!res.ok) {
    const body = await res.text();
    let detail: unknown = body;
    try { detail = JSON.parse(body); } catch { /* raw */ }
    throw new TeamApiError(res.status, detail, _extractErrorCode(detail));
  }
}

// ---------------------------------------------------------------------------
// DAG layout endpoint（Node 网关 server/src/routes/teams.ts，yaml team 专属）
// ---------------------------------------------------------------------------
//
// 注意：PUT /api/teams/{id}/dag 只写 yaml team 的 dag_layout 坐标块。
// Python 后端 JSON team（team-*.json）没有对应 yaml 文件时会 404
// TEAM_NOT_FOUND —— 调用方应把它当作「无 yaml 布局层」容忍（节点坐标本来
// 也随 PUT workflow 的 node.position 持久化，dag_layout 只是 yaml 运行态
// 的镜像）。

export interface TeamDagLayoutNode {
  id: string;
  x: number;
  y: number;
}

export interface TeamDagLayout {
  mode: 'auto' | 'manual';
  nodes: TeamDagLayoutNode[];
  viewport: { zoom: number; pan_x: number; pan_y: number };
}

export async function putTeamDagLayout(teamId: string, layout: TeamDagLayout): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/teams/${teamId}/dag`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dag_layout: layout }),
  });
  if (!res.ok) {
    const body = await res.text();
    let detail: unknown = body;
    try { detail = JSON.parse(body); } catch { /* raw */ }
    throw new TeamApiError(res.status, detail, _extractErrorCode(detail));
  }
}

/**
 * POST /api/teams/{id}/dag/validate — 干跑校验服务端 yaml DAG（不落库）。
 * 注意校验的是 Node yaml team（members/edges_v1）模型，与编辑器的 Python
 * workflow 模型不是同一份数据；Python JSON team 无 yaml 层时 404
 * TEAM_NOT_FOUND，调用方按「无 yaml 层」容忍（同 putTeamDagLayout）。
 */
export interface TeamDagValidation {
  team_id: string;
  ok: boolean;
  errors: string[];
}

export async function validateTeamDag(teamId: string): Promise<TeamDagValidation> {
  const res = await fetch(`${API_BASE_URL}/api/teams/${teamId}/dag/validate`, {
    method: 'POST',
  });
  const env = await _handleResponse<Envelope<TeamDagValidation>>(res);
  return env.data;
}

// ---------------------------------------------------------------------------
// Policy endpoints — Story 12-3
// ---------------------------------------------------------------------------

export type PolicyCellState = 'permit' | 'deny' | 'warn';
export type TeamPolicyMatrix = Record<string, Record<string, PolicyCellState>>;

export async function getTeamPolicy(teamId: string): Promise<TeamPolicyMatrix> {
  const res = await fetch(`${API_BASE_URL}/api/teams/${teamId}/policy`);
  if (!res.ok) return {};
  const env = await _handleResponse<Envelope<TeamPolicyMatrix>>(res);
  return env.data ?? {};
}

export async function putTeamPolicy(teamId: string, matrix: Record<string, Record<string, string>>): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/teams/${teamId}/policy`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ matrix }),
  });
  if (!res.ok) {
    const body = await res.text();
    let detail: unknown = body;
    try { detail = JSON.parse(body); } catch { /* raw */ }
    throw new TeamApiError(res.status, detail, _extractErrorCode(detail));
  }
}

// ---------------------------------------------------------------------------
// Workflow version endpoints — 版本管理（Python 后端 team_workflow_versions 仓）
// ---------------------------------------------------------------------------

export interface TeamWorkflowVersionMeta {
  version: number;
  saved_at: string;
  summary: string | null;
}

export async function listTeamWorkflowVersions(teamId: string): Promise<TeamWorkflowVersionMeta[]> {
  const res = await fetch(`${API_BASE_URL}/api/teams/${teamId}/workflow/versions`);
  const env = await _handleResponse<Envelope<TeamWorkflowVersionMeta[]>>(res);
  return env.data ?? [];
}

/** 回滚到指定版本；返回回滚后的 workflow（回滚本身在服务端再记一个新版本）。 */
export async function restoreTeamWorkflowVersion(teamId: string, version: number): Promise<TeamWorkflow> {
  const res = await fetch(`${API_BASE_URL}/api/teams/${teamId}/workflow/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ version }),
  });
  const env = await _handleResponse<Envelope<TeamWorkflow>>(res);
  return env.data;
}

/** 把当前 team（含 workflow）复制为新变体；不传 name 时服务端自动加「· 分支」后缀。 */
export async function branchTeamWorkflow(teamId: string, name?: string): Promise<TeamRecord> {
  const res = await fetch(`${API_BASE_URL}/api/teams/${teamId}/workflow/branch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(name ? { name } : {}),
  });
  const env = await _handleResponse<Envelope<TeamRecord>>(res);
  return env.data;
}

// ---------------------------------------------------------------------------
// DAG draft endpoint（Node 网关 server/src/routes/teams.ts POST /dag-draft）
// ---------------------------------------------------------------------------
//
// 自然语言 → DAG 草稿：一句话描述协作流程，LLM 生成 { nodes, edges } 草稿，
// **只返回不落库** —— 由编辑器画进画布、标脏，用户确认后才走既有保存通路。
// BYOK key 经 buildByokHeaders 转发（与 chat/群聊同一套 X-LLM-* 约定）。

export type TeamDagDraftEdgeMode = 'direct' | 'approve' | 'conditional';

export interface TeamDagDraftNode {
  id: string;
  agentId?: string;
  name?: string;
  role?: string;
}

export interface TeamDagDraftEdge {
  source: string;
  target: string;
  mode: TeamDagDraftEdgeMode;
}

export interface TeamDagDraft {
  nodes: TeamDagDraftNode[];
  edges: TeamDagDraftEdge[];
}

export async function generateTeamDagDraft(prompt: string, agentIds?: string[]): Promise<TeamDagDraft> {
  const res = await fetch(`${API_BASE_URL}/api/teams/dag-draft`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...buildByokHeaders() },
    body: JSON.stringify({ prompt, ...(agentIds && agentIds.length > 0 ? { agentIds } : {}) }),
  });
  const env = await _handleResponse<Envelope<{ draft: TeamDagDraft }>>(res);
  return env.data.draft;
}

// ---------------------------------------------------------------------------
// Chat-driven editing
// ---------------------------------------------------------------------------

export interface TeamChatResponse {
  team: TeamRecord;
  reply: string;
  applied: boolean;
  applied_fields?: string[];
  error?: string;
}

export async function chatEditTeam(
  teamId: string,
  message: string,
  llmKey: string,
  provider = 'zhipu',
  model?: string,
): Promise<TeamChatResponse> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-LLM-Key': llmKey,
    'X-LLM-Provider': provider,
  };
  if (model) headers['X-LLM-Model'] = model;

  const res = await fetch(`${API_BASE_URL}/api/teams/${teamId}/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ message }),
  });
  const env = await _handleResponse<Envelope<TeamChatResponse>>(res);
  return env.data;
}
