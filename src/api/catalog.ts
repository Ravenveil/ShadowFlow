/**
 * Catalog API client — Story 8.7 + 13.3 + 13.5
 *
 * 与 builder.ts 保持一致：envelope 响应 + 自定义 Error 类。
 */
import type {
  CatalogListResponse,
  CatalogDetailResponse,
  CatalogForkResponse,
  CatalogListQuery,
} from '../common/types/catalog';
import { getApiBase } from './_base';

const API_BASE_URL = getApiBase();

export class CatalogApiError extends Error {
  public code?: string;

  constructor(
    public status: number,
    public detail: unknown,
  ) {
    super(`Catalog API error ${status}`);
    // Extract error code from common API envelope shapes:
    // { error: { code: "..." } }  or  { code: "..." }
    const d = detail as Record<string, unknown> | null;
    const errorObj = d?.error as Record<string, unknown> | undefined;
    const rawCode = errorObj?.code ?? d?.code;
    if (typeof rawCode === 'string') {
      this.code = rawCode;
    }
  }
}

async function _handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    // Read body once as text, then try JSON parse. Avoids double-consuming the stream.
    let detail: unknown = null;
    const raw = await res.text().catch(() => '');
    if (raw) {
      try {
        detail = JSON.parse(raw);
      } catch {
        detail = raw;
      }
    }
    throw new CatalogApiError(res.status, detail);
  }
  return res.json() as Promise<T>;
}

export async function listCatalogApps(
  query: CatalogListQuery = {},
): Promise<CatalogListResponse> {
  const params = new URLSearchParams();
  if (query.kit_type) params.set('kit_type', query.kit_type);
  if (query.q) params.set('q', query.q);
  if (query.page != null) params.set('page', String(query.page));
  if (query.page_size != null) params.set('page_size', String(query.page_size));
  const qs = params.toString();
  const url = `${API_BASE_URL}/catalog/apps${qs ? `?${qs}` : ''}`;
  const res = await fetch(url);
  return _handle<CatalogListResponse>(res);
}

export async function getCatalogApp(appId: string): Promise<CatalogDetailResponse> {
  const url = `${API_BASE_URL}/catalog/apps/${encodeURIComponent(appId)}`;
  const res = await fetch(url);
  return _handle<CatalogDetailResponse>(res);
}

export async function forkCatalogApp(appId: string): Promise<CatalogForkResponse> {
  const url = `${API_BASE_URL}/catalog/apps/${encodeURIComponent(appId)}/fork`;
  const res = await fetch(url, { method: 'POST' });
  return _handle<CatalogForkResponse>(res);
}
