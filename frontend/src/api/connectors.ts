/**
 * api/connectors.ts — 连接器注册表客户端（2026-11-07，OpenBot 对齐批）。
 *
 * 对应后端 server/src/routes/system/connectors.ts：
 *   GET  /api/connectors             → 列表（含策略）
 *   POST /api/connectors/refresh     → 强制重扫
 *   POST /api/connectors/:id/policy  → 更新策略 {enabled?, approval_mode?}
 *
 * 形状镜像 api/acp.ts：短超时 + fetch 封装，调用方（NeoPlusMenu 连接器面板）
 * fail-soft 消费（失败回落空列表）。
 */

import { getApiBase } from './_base';

export type ConnectorKind = 'acp' | 'mcp';
export type ConnectorStatus = 'connected' | 'disconnected' | 'unknown';
export type ApprovalMode = 'auto' | 'prompt' | 'block';

export interface ConnectorPolicy {
  enabled: boolean;
  approval_mode: ApprovalMode;
}

export interface ConnectorItem {
  id: string;
  kind: ConnectorKind;
  name: string;
  description?: string;
  binary: string;
  transport: 'stdio' | 'http' | 'unreachable';
  endpoint?: string;
  capabilities?: string[];
  installed: boolean;
  status: ConnectorStatus;
  last_checked: string;
  error?: string;
  policy: ConnectorPolicy;
}

export interface ConnectorsResponse {
  scanned_at: string;
  items: ConnectorItem[];
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

export function listConnectors(): Promise<ConnectorsResponse> {
  return request<ConnectorsResponse>('/api/connectors');
}

export function refreshConnectors(): Promise<ConnectorsResponse> {
  return request<ConnectorsResponse>('/api/connectors/refresh', { method: 'POST' });
}

export function setConnectorPolicy(
  id: string,
  patch: Partial<ConnectorPolicy>,
): Promise<{ id: string; policy: ConnectorPolicy }> {
  return request<{ id: string; policy: ConnectorPolicy }>(
    `/api/connectors/${encodeURIComponent(id)}/policy`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    },
  );
}
