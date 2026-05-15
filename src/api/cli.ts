/**
 * api/cli.ts — Local AI CLI detection client (Story 15.19 v2)
 *
 * Wraps `GET /api/cli/detect` and `POST /api/cli/detect/refresh`. The server
 * runs the actual PATH scan; this module just shapes the response.
 */

import { getApiBase } from './_base';

export interface DetectedCli {
  id: string;
  installed: boolean;
  path: string | null;
  version: string | null;
  needs_env?: string;
  env_set: boolean;
  install_cmd: string;
  stream_format: string;
  capabilities?: Record<string, boolean>;
  fallback_models?: string[];
  auth_hint?: string;
}

export interface DetectResponse {
  scanned_at: string;
  items: DetectedCli[];
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

export function listDetectedClis(): Promise<DetectResponse> {
  return request<DetectResponse>('/api/cli/detect');
}

export function refreshCliDetection(): Promise<DetectResponse> {
  return request<DetectResponse>('/api/cli/detect/refresh', { method: 'POST' });
}
