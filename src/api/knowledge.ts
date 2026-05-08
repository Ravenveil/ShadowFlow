/**
 * Knowledge API client — Story 9.1
 *
 * Thin wrapper around the backend `/knowledge/packs` endpoints.
 * Mirrors `src/api/catalog.ts` `_handleResponse<T>` style and surfaces a
 * stable `code` (KNOWLEDGE_PACK_NOT_FOUND, etc.) on failure.
 */
import type {
  CreatePackPayload,
  KnowledgeDeleteResponse,
  KnowledgeDetailResponse,
  KnowledgeListResponse,
  UpdatePackPayload,
} from '../common/types/knowledge';
import { getApiBase } from './_base';

const API_BASE_URL = getApiBase();

export class KnowledgeApiError extends Error {
  public readonly code: string;

  constructor(
    public status: number,
    public detail: unknown,
    code: string = '',
  ) {
    super(`Knowledge API error ${status}`);
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
  throw new KnowledgeApiError(res.status, detail, _extractErrorCode(detail));
}

export async function listPacks(
  params: { limit?: number; offset?: number } = {},
): Promise<KnowledgeListResponse> {
  const qs = new URLSearchParams();
  if (params.limit !== undefined) qs.set('limit', String(params.limit));
  if (params.offset !== undefined) qs.set('offset', String(params.offset));
  const url = `${API_BASE_URL}/knowledge/packs${qs.toString() ? `?${qs.toString()}` : ''}`;
  const res = await fetch(url);
  return _handleResponse<KnowledgeListResponse>(res);
}

export async function getPack(packId: string): Promise<KnowledgeDetailResponse> {
  const res = await fetch(`${API_BASE_URL}/knowledge/packs/${encodeURIComponent(packId)}`);
  return _handleResponse<KnowledgeDetailResponse>(res);
}

export async function createPack(payload: CreatePackPayload): Promise<KnowledgeDetailResponse> {
  const res = await fetch(`${API_BASE_URL}/knowledge/packs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return _handleResponse<KnowledgeDetailResponse>(res);
}

export async function updatePack(
  packId: string,
  payload: UpdatePackPayload,
): Promise<KnowledgeDetailResponse> {
  const res = await fetch(`${API_BASE_URL}/knowledge/packs/${encodeURIComponent(packId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return _handleResponse<KnowledgeDetailResponse>(res);
}

export async function deletePack(packId: string): Promise<KnowledgeDeleteResponse> {
  const res = await fetch(`${API_BASE_URL}/knowledge/packs/${encodeURIComponent(packId)}`, {
    method: 'DELETE',
  });
  return _handleResponse<KnowledgeDeleteResponse>(res);
}

export async function reindexPack(packId: string): Promise<KnowledgeDetailResponse> {
  const res = await fetch(
    `${API_BASE_URL}/knowledge/packs/${encodeURIComponent(packId)}/reindex`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' } },
  );
  return _handleResponse<KnowledgeDetailResponse>(res);
}
