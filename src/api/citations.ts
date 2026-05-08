/**
 * Citation API client — Story 9.2
 *
 * Thin wrapper around the backend `/citations/*` endpoints. Mirrors the
 * `_handleResponse<T>` style used by `src/api/knowledge.ts` and surfaces a
 * stable error code (CITATION_NOT_FOUND / HTTP_xxx) on failure.
 */
import type {
  CitationExportResponse,
  CitationListResponse,
} from '../common/types/citation';
import { getApiBase } from './_base';

const API_BASE_URL = getApiBase();

export class CitationApiError extends Error {
  public readonly code: string;

  constructor(public status: number, public detail: unknown, code: string = '') {
    super(`Citation API error ${status}`);
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
  throw new CitationApiError(res.status, detail, _extractErrorCode(detail));
}

export async function getCitations(
  runId: string,
  params: { node_id?: string } = {},
): Promise<CitationListResponse> {
  const qs = new URLSearchParams();
  if (params.node_id) qs.set('node_id', params.node_id);
  const url = `${API_BASE_URL}/citations/${encodeURIComponent(runId)}${
    qs.toString() ? `?${qs.toString()}` : ''
  }`;
  const res = await fetch(url);
  return _handleResponse<CitationListResponse>(res);
}

export async function exportCitations(runId: string): Promise<CitationExportResponse> {
  const res = await fetch(
    `${API_BASE_URL}/citations/${encodeURIComponent(runId)}/export`,
  );
  return _handleResponse<CitationExportResponse>(res);
}
