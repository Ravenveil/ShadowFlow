/**
 * Evals API client — Story 9.5 AC4
 *
 * Thin wrapper around `/evals/*` endpoints.
 * Follows the same `_handleResponse<T>` pattern as `knowledge.ts`.
 */
import type {
  EvalProfile,
  RunSmokeResponse,
  SmokeEvalResult,
} from '../common/types/eval';
import { getApiBase } from './_base';

const API_BASE_URL = getApiBase();

export class EvalApiError extends Error {
  public readonly code: string;

  constructor(
    public status: number,
    public detail: unknown,
    code: string = '',
  ) {
    super(`Eval API error ${status}`);
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
  throw new EvalApiError(res.status, detail, _extractErrorCode(detail));
}

interface Envelope<T> {
  data: T;
  meta: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Profile CRUD
// ---------------------------------------------------------------------------

export async function createProfile(profile: Omit<EvalProfile, 'profile_id' | 'created_at' | 'updated_at'>): Promise<EvalProfile> {
  const res = await fetch(`${API_BASE_URL}/evals/profiles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(profile),
  });
  const env = await _handleResponse<Envelope<EvalProfile>>(res);
  return env.data;
}

export async function listProfiles(): Promise<EvalProfile[]> {
  const res = await fetch(`${API_BASE_URL}/evals/profiles`);
  const env = await _handleResponse<Envelope<EvalProfile[]>>(res);
  return env.data;
}

export async function getProfile(profileId: string): Promise<EvalProfile> {
  const res = await fetch(`${API_BASE_URL}/evals/profiles/${profileId}`);
  const env = await _handleResponse<Envelope<EvalProfile>>(res);
  return env.data;
}

export async function updateProfile(
  profileId: string,
  updates: Partial<EvalProfile>,
): Promise<EvalProfile> {
  const res = await fetch(`${API_BASE_URL}/evals/profiles/${profileId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  const env = await _handleResponse<Envelope<EvalProfile>>(res);
  return env.data;
}

export async function deleteProfile(profileId: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/evals/profiles/${profileId}`, {
    method: 'DELETE',
  });
  if (!res.ok && res.status !== 204) {
    const body = await res.text();
    let detail: unknown = body;
    try { detail = JSON.parse(body); } catch { /* raw */ }
    throw new EvalApiError(res.status, detail, _extractErrorCode(detail));
  }
}

// ---------------------------------------------------------------------------
// Smoke eval
// ---------------------------------------------------------------------------

export async function runSmoke(blueprintId: string, profileId: string): Promise<RunSmokeResponse> {
  const url = `${API_BASE_URL}/evals/run/${blueprintId}?profile_id=${encodeURIComponent(profileId)}`;
  const res = await fetch(url, { method: 'POST' });
  const env = await _handleResponse<Envelope<RunSmokeResponse>>(res);
  return env.data;
}

export async function getResult(resultId: string): Promise<SmokeEvalResult> {
  const res = await fetch(`${API_BASE_URL}/evals/results/${resultId}`);
  const env = await _handleResponse<Envelope<SmokeEvalResult>>(res);
  return env.data;
}

/**
 * Poll `GET /evals/results/{result_id}` every 2 s until status != "running",
 * timing out after 30 attempts (60 s).
 */
export async function pollResult(
  resultId: string,
  intervalMs = 2000,
  maxAttempts = 30,
): Promise<SmokeEvalResult> {
  for (let i = 0; i < maxAttempts; i++) {
    const result = await getResult(resultId);
    if (result.status !== 'running') return result;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new EvalApiError(408, 'Eval timeout after 60s', 'EVAL_TIMEOUT');
}
