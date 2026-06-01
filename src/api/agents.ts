/**
 * Agents API client — Story 12.1 Quick Hire
 *
 * Thin wrapper around `POST/GET/DELETE /api/agents` endpoints.
 */

import { getApiBase } from './_base';
import { registerAgentColors } from '../components/chat-fb/agentAvatar';
const API_BASE_URL = getApiBase();

export class AgentApiError extends Error {
  public readonly code: string;

  constructor(
    public status: number,
    public detail: unknown,
    code: string = '',
  ) {
    super(`Agent API error ${status}`);
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
  if (res.ok) return res.json() as Promise<T>;
  const body = await res.text();
  let detail: unknown = body;
  try {
    detail = JSON.parse(body);
  } catch {
    // keep raw
  }
  throw new AgentApiError(res.status, detail, _extractErrorCode(detail));
}

interface Envelope<T> {
  data: T;
  meta: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QuickCreateRequest {
  name: string;
  /** Agent 灵魂(= persona)。组建保存应传 run 里生成的完整 persona,而非短副标题。 */
  soul: string;
  workspace_id?: string;
  /** 头像色（可选）：#rrggbb；不传则前端按名字 hash 兜底。 */
  avatar_color?: string | null;
  /** 契约扩展:设计期 model（如 claude-sonnet-4-6）;不传走后端默认。 */
  model?: string;
  /** 契约扩展:设计期工具集（tool ids）;不传走后端默认 MCP 集。 */
  tools?: string[];
}

export interface AgentRecord {
  agent_id: string;
  name: string;
  soul: string;
  workspace_id: string;
  blueprint: Record<string, unknown>;
  status: 'idle' | 'running' | 'paused' | 'error';
  source: 'quick_hire' | 'catalog';
  created_at: string;
  /** 后端持久化的头像色（#rrggbb）；未设置为 null/缺省。 */
  avatar_color?: string | null;
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

export async function quickCreateAgent(req: QuickCreateRequest): Promise<AgentRecord> {
  const res = await fetch(`${API_BASE_URL}/api/agents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  const env = await _handleResponse<Envelope<AgentRecord>>(res);
  return env.data;
}

export async function listAgents(workspaceId?: string): Promise<AgentRecord[]> {
  // 2026-05-11 fix — `new URL('/api/agents')` (no host) throws TypeError.
  // Same bug pattern as teams.ts.
  const qs = workspaceId ? `?workspace_id=${encodeURIComponent(workspaceId)}` : '';
  const res = await fetch(`${API_BASE_URL}/api/agents${qs}`);
  const env = await _handleResponse<Envelope<AgentRecord[]>>(res);
  // 同步全 app 头像色注册表（真源 = 后端 avatar_color），让聊天/DM 等只有 name 的
  // 界面也能取到同一个色。所有 listAgents 调用方因此自动受益。
  registerAgentColors(env.data);
  return env.data;
}

export async function getAgent(agentId: string): Promise<AgentRecord> {
  const res = await fetch(`${API_BASE_URL}/api/agents/${agentId}`);
  const env = await _handleResponse<Envelope<AgentRecord>>(res);
  return env.data;
}

export async function deleteAgent(agentId: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/agents/${agentId}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const body = await res.text();
    let detail: unknown = body;
    try { detail = JSON.parse(body); } catch { /* raw */ }
    throw new AgentApiError(res.status, detail, _extractErrorCode(detail));
  }
}

// ---------------------------------------------------------------------------
// Pause / resume — runtime status toggle
// ---------------------------------------------------------------------------

export async function pauseAgent(agentId: string): Promise<AgentRecord> {
  const res = await fetch(`${API_BASE_URL}/api/agents/${agentId}/pause`, { method: 'POST' });
  const env = await _handleResponse<Envelope<AgentRecord>>(res);
  return env.data;
}

export async function resumeAgent(agentId: string): Promise<AgentRecord> {
  const res = await fetch(`${API_BASE_URL}/api/agents/${agentId}/resume`, { method: 'POST' });
  const env = await _handleResponse<Envelope<AgentRecord>>(res);
  return env.data;
}

// ---------------------------------------------------------------------------
// PATCH — direct field update
// ---------------------------------------------------------------------------

export interface AgentPatchRequest {
  name?: string;
  soul?: string;
  skills?: string[];
  tools?: string[];
  /** #rrggbb 设置；"" 清除（回到按名字 hash）。 */
  avatar_color?: string | null;
}

export async function patchAgent(agentId: string, patch: AgentPatchRequest): Promise<AgentRecord> {
  const res = await fetch(`${API_BASE_URL}/api/agents/${agentId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  const env = await _handleResponse<Envelope<AgentRecord>>(res);
  // patch 返回完整 record；同步注册表，让改色后全 app 即时一致。
  registerAgentColors([env.data]);
  return env.data;
}

// ---------------------------------------------------------------------------
// Chat-driven editing
// ---------------------------------------------------------------------------

export interface AgentChatResponse {
  agent: AgentRecord;
  reply: string;
  applied: boolean;
  applied_fields?: string[];
  error?: string;
}

export async function chatEditAgent(
  agentId: string,
  message: string,
  llmKey: string,
  provider = 'zhipu',
  model?: string,
): Promise<AgentChatResponse> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-LLM-Key': llmKey,
    'X-LLM-Provider': provider,
  };
  if (model) headers['X-LLM-Model'] = model;

  const res = await fetch(`${API_BASE_URL}/api/agents/${agentId}/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ message }),
  });
  const env = await _handleResponse<Envelope<AgentChatResponse>>(res);
  return env.data;
}
