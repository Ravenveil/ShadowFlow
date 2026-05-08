/**
 * Agent State API client — Story 9.4 AC4
 */
import type {
  AgentStateResponse,
  PatchStatePayload,
  SnapshotCreateResponse,
  SnapshotListResponse,
} from '../common/types/agent-state';
import { getApiBase } from './_base';

const API_BASE_URL = getApiBase();

export class StateApiError extends Error {
  public readonly code: string;

  constructor(
    public status: number,
    public detail: unknown,
    code: string = '',
  ) {
    super(`State API error ${status}`);
    this.code = code || `HTTP_${status}`;
  }
}

function _extractErrorCode(detail: unknown): string {
  if (detail && typeof detail === 'object') {
    const d = detail as Record<string, unknown>;
    const inner = d.error;
    if (inner && typeof inner === 'object') {
      const code = (inner as Record<string, unknown>).code;
      if (typeof code === 'string') return code;
    }
    const code = d.code;
    if (typeof code === 'string') return code;
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
    // keep raw text
  }
  throw new StateApiError(res.status, detail, _extractErrorCode(detail));
}

export async function getState(agentId: string): Promise<AgentStateResponse> {
  const res = await fetch(`${API_BASE_URL}/state/${encodeURIComponent(agentId)}`);
  return _handleResponse<AgentStateResponse>(res);
}

export async function patchState(
  agentId: string,
  payload: PatchStatePayload,
): Promise<AgentStateResponse> {
  const res = await fetch(`${API_BASE_URL}/state/${encodeURIComponent(agentId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return _handleResponse<AgentStateResponse>(res);
}

export async function createSnapshot(agentId: string): Promise<SnapshotCreateResponse> {
  const res = await fetch(`${API_BASE_URL}/state/${encodeURIComponent(agentId)}/snapshot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  return _handleResponse<SnapshotCreateResponse>(res);
}

export async function listSnapshots(agentId: string): Promise<SnapshotListResponse> {
  const res = await fetch(`${API_BASE_URL}/state/${encodeURIComponent(agentId)}/snapshots`);
  return _handleResponse<SnapshotListResponse>(res);
}

export async function restoreSnapshot(
  agentId: string,
  snapshotId: string,
): Promise<AgentStateResponse> {
  const res = await fetch(
    `${API_BASE_URL}/state/${encodeURIComponent(agentId)}/restore/${encodeURIComponent(snapshotId)}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' } },
  );
  return _handleResponse<AgentStateResponse>(res);
}

export async function resetState(agentId: string): Promise<AgentStateResponse> {
  const res = await fetch(`${API_BASE_URL}/state/${encodeURIComponent(agentId)}/reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  return _handleResponse<AgentStateResponse>(res);
}
