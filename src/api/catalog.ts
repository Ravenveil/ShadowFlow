/**
 * Catalog API client — T04 团队模板一键 fork（第二轮黄金路径）。
 *
 * Python 侧路由同时挂在 /catalog 与 /api/catalog（server.py 别名），前端经
 * Vite 代理 → Node 网关（proxyFallback 只代理 /api/*）→ Python，因此这里
 * 固定走 /api/catalog。
 *
 * fork 团队模板（mode=="team"）时 Python 会把 6 个 role 落成真实 agent
 * 记录 + 带 DAG workflow 的 team 记录，响应 data 里带 agents / team —
 * 前端拿到 team 即可选为 currentTeam 直接在群聊运行。
 */

import { getApiBase } from './_base';
import type { TeamRecord } from './teams';
const API_BASE_URL = getApiBase();

export class CatalogApiError extends Error {
  public readonly code: string;

  constructor(
    public status: number,
    public detail: unknown,
    code: string = '',
  ) {
    super(`Catalog API error ${status}`);
    this.code = code || `HTTP_${status}`;
  }
}

export interface CatalogAppSummary {
  app_id: string;
  name: string;
  goal: string;
  kit_type: string;
  author: string;
  published_at: string;
  fork_count: number;
  /** Python summary 透传快照 mode；老记录缺省视为 single */
  mode?: string;
}

export interface CatalogForkedAgent {
  agent_id: string;
  name: string;
}

export interface CatalogForkResult {
  blueprint_id: string;
  forked_from: string;
  /** team 模板 fork 才有：落库的 agent 列表与 team 记录 */
  agents?: CatalogForkedAgent[];
  team?: TeamRecord;
}

interface Envelope<T> {
  data: T;
  meta: Record<string, unknown>;
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
  throw new CatalogApiError(res.status, detail, _extractErrorCode(detail));
}

/** 列出 Catalog 应用（缺省拉前 100 条，模板市场场景够用）。 */
export async function listCatalogApps(): Promise<CatalogAppSummary[]> {
  const res = await fetch(`${API_BASE_URL}/api/catalog/apps?page=1&page_size=100`);
  const env = await _handleResponse<Envelope<{ apps: CatalogAppSummary[] }>>(res);
  return env.data.apps;
}

/** Fork 一个 Catalog app；team 模板会顺带落库 agents + team。 */
export async function forkCatalogApp(
  appId: string,
  workspaceId?: string,
): Promise<CatalogForkResult> {
  const res = await fetch(`${API_BASE_URL}/api/catalog/apps/${encodeURIComponent(appId)}/fork`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(workspaceId ? { workspace_id: workspaceId } : {}),
  });
  const env = await _handleResponse<Envelope<CatalogForkResult>>(res);
  return env.data;
}
