/**
 * api/acp.ts — ACP / MCP remote agent detection client (Story 15.23)
 *
 * Wraps `GET /api/acp/detect` and `POST /api/acp/detect/refresh`. Mirrors the
 * shape used by `api/cli.ts` so consumers (GenerationSettings, AcpAgentsPanel)
 * follow the same pattern.
 */

import { getApiBase } from './_base';

export interface DetectedAcpAgent {
  id: string;
  type: 'acp' | 'mcp';
  binary: string;
  args: string[];
  installed: boolean;
  transport: 'stdio' | 'http' | 'unreachable';
  endpoint?: string;
  http_endpoint?: string;
  path: string | null;
  capabilities?: string[];
  install_cmd?: string;
  last_checked: string;
  error?: string;
}

export interface AcpDetectResponse {
  scanned_at: string;
  items: DetectedAcpAgent[];
}

const REQUEST_TIMEOUT_MS = 10_000;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const base = getApiBase();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const resp = await fetch(`${base}${path}`, { ...init, signal: controller.signal });
    if (!resp.ok) {
      throw new Error(`${path} failed: ${resp.status} ${resp.statusText}`);
    }
    return (await resp.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export function listAcpAgents(): Promise<AcpDetectResponse> {
  return request<AcpDetectResponse>('/api/acp/detect');
}

export function refreshAcpAgents(): Promise<AcpDetectResponse> {
  return request<AcpDetectResponse>('/api/acp/detect/refresh', { method: 'POST' });
}
