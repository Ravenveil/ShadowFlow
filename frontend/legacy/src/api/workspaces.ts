/**
 * Workspace API client — Story 12.4
 *
 * Thin wrapper around POST/GET/PATCH/DELETE /api/workspaces endpoints.
 */

import { getApiBase } from './_base';
const API_BASE_URL = getApiBase();

export interface WorkspaceSummary {
  workspace_id: string;
  name: string;
  color: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
  agent_count: number;
  team_count: number;
}

export class WorkspaceApiError extends Error {
  public readonly code: string;

  constructor(
    public status: number,
    public detail: unknown,
    code: string = '',
  ) {
    super(`Workspace API error ${status}`);
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
  if (!res.ok) {
    let detail: unknown;
    try {
      detail = await res.json();
    } catch {
      detail = null;
    }
    throw new WorkspaceApiError(res.status, detail, _extractErrorCode(detail));
  }
  return res.json() as Promise<T>;
}

export async function listWorkspaces(): Promise<WorkspaceSummary[]> {
  const res = await fetch(`${API_BASE_URL}/api/workspaces`);
  const json = await _handleResponse<{ data: WorkspaceSummary[] }>(res);
  return json.data ?? [];
}

export async function getWorkspace(workspaceId: string): Promise<WorkspaceSummary> {
  const res = await fetch(`${API_BASE_URL}/api/workspaces/${workspaceId}`);
  const json = await _handleResponse<{ data: WorkspaceSummary }>(res);
  return json.data;
}

export async function createWorkspace(payload: {
  name: string;
  color?: string;
}): Promise<WorkspaceSummary> {
  const res = await fetch(`${API_BASE_URL}/api/workspaces`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ color: '#6366f1', ...payload }),
  });
  const json = await _handleResponse<{ data: WorkspaceSummary }>(res);
  return json.data;
}

export async function patchWorkspace(
  workspaceId: string,
  payload: { name?: string; color?: string },
): Promise<WorkspaceSummary> {
  const res = await fetch(`${API_BASE_URL}/api/workspaces/${workspaceId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = await _handleResponse<{ data: WorkspaceSummary }>(res);
  return json.data;
}

export async function deleteWorkspace(workspaceId: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/workspaces/${workspaceId}`, {
    method: 'DELETE',
  });
  if (!res.ok && res.status !== 204) {
    let detail: unknown;
    try {
      detail = await res.json();
    } catch {
      detail = null;
    }
    throw new WorkspaceApiError(res.status, detail, _extractErrorCode(detail));
  }
}
