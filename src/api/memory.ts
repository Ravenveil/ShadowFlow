/**
 * Memory API client — Story 9.3
 *
 * Thin wrapper around the backend `/memory` endpoints.
 */
import type {
  CreateMemoryProfilePayload,
  MemoryApiResponse,
  MemoryProfile,
  UpdateMemoryProfilePayload,
} from '../common/types/memory';
import { getApiBase } from './_base';

const API_BASE_URL = getApiBase();

export class MemoryApiError extends Error {
  public readonly code: string;

  constructor(
    public status: number,
    public detail: unknown,
    code = '',
  ) {
    super(`Memory API error ${status}`);
    this.code = code || `HTTP_${status}`;
  }
}

function _extractCode(detail: unknown): string {
  if (detail && typeof detail === 'object') {
    const d = detail as Record<string, unknown>;
    if (typeof d.code === 'string') return d.code;
  }
  return '';
}

async function _handleResponse<T>(res: Response): Promise<MemoryApiResponse<T>> {
  if (!res.ok) {
    let detail: unknown;
    try { detail = await res.json(); } catch { detail = res.statusText; }
    throw new MemoryApiError(res.status, detail, _extractCode(detail));
  }
  return res.json() as Promise<MemoryApiResponse<T>>;
}

export async function createMemoryProfile(
  payload: CreateMemoryProfilePayload,
): Promise<MemoryApiResponse<MemoryProfile>> {
  const res = await fetch(`${API_BASE_URL}/memory/profiles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return _handleResponse<MemoryProfile>(res);
}

export async function getMemoryProfile(
  profileId: string,
): Promise<MemoryApiResponse<MemoryProfile>> {
  const res = await fetch(`${API_BASE_URL}/memory/profiles/${profileId}`);
  return _handleResponse<MemoryProfile>(res);
}

export async function updateMemoryProfile(
  profileId: string,
  payload: UpdateMemoryProfilePayload,
): Promise<MemoryApiResponse<MemoryProfile>> {
  const res = await fetch(`${API_BASE_URL}/memory/profiles/${profileId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return _handleResponse<MemoryProfile>(res);
}

export async function deleteMemoryProfile(profileId: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/memory/profiles/${profileId}`, {
    method: 'DELETE',
  });
  if (!res.ok && res.status !== 204) {
    let detail: unknown;
    try { detail = await res.json(); } catch { detail = res.statusText; }
    throw new MemoryApiError(res.status, detail, _extractCode(detail));
  }
}

export interface MemoryStats {
  working_memory_limit: number;
  episodic_retention_days: number;
  semantic_skills_count: number;
  _note?: string;
}

export async function getMemoryStats(agentId?: string): Promise<MemoryApiResponse<MemoryStats>> {
  const url = new URL(`${API_BASE_URL}/memory/stats`);
  if (agentId) url.searchParams.set('agent_id', agentId);
  const res = await fetch(url.toString());
  return _handleResponse<MemoryStats>(res);
}

export async function triggerManualWriteback(
  runId: string,
): Promise<MemoryApiResponse<{ run_id: string; status: string }>> {
  const res = await fetch(`${API_BASE_URL}/memory/writeback/${runId}`, {
    method: 'POST',
  });
  return _handleResponse(res);
}
