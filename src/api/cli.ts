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
  // ── ClawHub 镜像字段（2026-06，与 server cli-detector DetectedCli 对齐）──
  /** true = ClawHub 门面中的「Claw」。 */
  is_claw?: boolean;
  /** 一句话简介（目录卡片）。 */
  description?: string;
  /** 分类（目录筛选）。 */
  category?: string;
  /** 官网/文档链接。 */
  homepage?: string;
  /** 结构化安装规格。 */
  install_spec?: { pm: string; args: string[] };
  /** true = 可自动执行安装（白名单 pm）；false = copy-only。 */
  installable?: boolean;
  /** 结构化卸载规格（2026-10-30 生命周期闭环）。 */
  uninstall_spec?: { pm: string; args: string[] };
  /** 卸载引导文案（不可自动卸载时展示/复制）。 */
  uninstall_cmd?: string;
  /** true = 可自动执行卸载。 */
  uninstallable?: boolean;
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
