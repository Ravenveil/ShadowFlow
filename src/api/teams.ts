/**
 * Teams API client — Story 12.2 Team 创建 & 角色组装
 *
 * Thin wrapper around POST/GET/PATCH/DELETE /api/teams endpoints.
 */

import { getApiBase } from './_base';
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
  data?: { mode: 'direct' | 'approve' };
  label?: string;
}

export async function getTeamWorkflow(teamId: string): Promise<TeamWorkflow> {
  const res = await fetch(`${API_BASE_URL}/api/teams/${teamId}/workflow`);
  if (!res.ok) return { nodes: [], edges: [] };
  const env = await _handleResponse<Envelope<TeamWorkflow>>(res);
  return env.data ?? { nodes: [], edges: [] };
}

export async function putTeamWorkflow(teamId: string, workflow: TeamWorkflow): Promise<void> {
  await fetch(`${API_BASE_URL}/api/teams/${teamId}/workflow`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(workflow),
  });
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
  await fetch(`${API_BASE_URL}/api/teams/${teamId}/policy`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ matrix }),
  });
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
