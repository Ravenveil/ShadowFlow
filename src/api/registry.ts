/**
 * Agent Pack Registry API client — Story 12.5 AC7, AC3, AC6
 */

import { getApiBase } from './_base';
const API_BASE_URL = getApiBase();

export class RegistryApiError extends Error {
  constructor(
    public status: number,
    public detail: unknown,
    public code: string = '',
  ) {
    super(`Registry API error ${status}`);
  }
}

function _extractCode(detail: unknown): string {
  if (detail && typeof detail === 'object') {
    const err = (detail as Record<string, unknown>).error;
    if (err && typeof err === 'object') {
      const code = (err as Record<string, unknown>).code;
      if (typeof code === 'string') return code;
    }
  }
  return '';
}

async function _handle<T>(res: Response): Promise<T> {
  if (res.ok) return res.json() as Promise<T>;
  const body = await res.text();
  let detail: unknown = body;
  try { detail = JSON.parse(body); } catch { /* raw */ }
  throw new RegistryApiError(res.status, detail, _extractCode(detail));
}

interface Envelope<T> {
  data: T;
  meta: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PackRecord {
  id: string;
  version: string;
  name: string;
  description: string;
  author: string;
  tags: string[];
  capabilities_summary: string[];
  install_status: 'not_installed' | 'installed' | 'has_update';
  verified: boolean;
}

export interface InstalledPackRecord {
  pack_id: string;
  pack_version: string;
  agent_id: string;
  name: string;
  installed_at: string;
  update_available: boolean;
  verified: boolean;
}

export interface InstallResult {
  agent_id: string;
  pack_id: string;
  pack_version: string;
  blueprint: Record<string, unknown>;
  installed_at: string;
  verified: boolean;
  already_installed: boolean;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export async function listPacks(params?: {
  workspace_id?: string;
  tags?: string;
  q?: string;
}): Promise<PackRecord[]> {
  const url = new URL(`${API_BASE_URL}/api/agents/registry/packs`);
  if (params?.workspace_id) url.searchParams.set('workspace_id', params.workspace_id);
  if (params?.tags) url.searchParams.set('tags', params.tags);
  if (params?.q) url.searchParams.set('q', params.q);
  const env = await _handle<Envelope<PackRecord[]>>(await fetch(url.toString()));
  return env.data;
}

export async function installPack(packId: string, workspaceId = 'default'): Promise<InstallResult> {
  const res = await fetch(`${API_BASE_URL}/api/agents/registry/packs/install`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pack_id: packId, workspace_id: workspaceId }),
  });
  const env = await _handle<Envelope<InstallResult>>(res);
  return env.data;
}

export async function listInstalledPacks(workspaceId = 'default'): Promise<InstalledPackRecord[]> {
  const url = new URL(`${API_BASE_URL}/api/agents/registry/packs/installed`);
  url.searchParams.set('workspace_id', workspaceId);
  const env = await _handle<Envelope<InstalledPackRecord[]>>(await fetch(url.toString()));
  return env.data;
}
