/**
 * Schedules API client — Settings: 定时任务管理面板
 *
 * Thin wrapper around POST/GET/PATCH/DELETE /api/schedules endpoints
 * (Python 后端 shadowflow/api/schedules.py)。计划 = cron 周期任务或
 * start_at 一次性任务，挂在一个 group（team）上，可选指派 agent。
 */

import { getApiBase } from './_base';
const API_BASE_URL = getApiBase();

export class ScheduleApiError extends Error {
  public readonly code: string;

  constructor(
    public status: number,
    public detail: unknown,
    code: string = '',
  ) {
    super(`Schedule API error ${status}`);
    this.code = code || `HTTP_${status}`;
  }
}

function _extractErrorCode(detail: unknown): string {
  if (detail && typeof detail === 'object') {
    const inner = (detail as Record<string, unknown>).error;
    if (inner && typeof inner === 'object') {
      const code = (inner as Record<string, unknown>).code;
      if (typeof code === 'string') return code;
      // create 端点的 422 detail 是 { error: 'invalid_cron', ... } 扁平结构
    }
    if (typeof (detail as Record<string, unknown>).error === 'string') {
      return (detail as Record<string, unknown>).error as string;
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
  // FastAPI HTTPException 把载荷包在 body.detail 里；剥掉这层以便提取错误码。
  if (
    detail && typeof detail === 'object' &&
    Object.keys(detail as object).length === 1 &&
    'detail' in (detail as object)
  ) {
    detail = (detail as { detail: unknown }).detail;
  }
  throw new ScheduleApiError(res.status, detail, _extractErrorCode(detail));
}

interface Envelope<T> {
  data: T;
  meta: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScheduleRun {
  run_id: string;
  triggered_at: string;
  status: string;
}

export interface ScheduleRecord {
  schedule_id: string;
  group_id: string;
  cron_expression: string | null;
  start_at: string | null;
  agent_id: string | null;
  task_description: string;
  duration_min: number;
  created_at: string;
  next_run_time: string | null;
  completed: boolean;
  enabled: boolean;
  runs?: ScheduleRun[];
}

export interface CreateScheduleRequest {
  group_id: string;
  /** 周期任务（与 start_at 二选一，同时给时 cron 优先）。 */
  cron_expression?: string;
  /** 一次性任务触发时间（ISO string）。 */
  start_at?: string;
  agent_id?: string;
  task_description?: string;
  duration_min?: number;
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

export async function createSchedule(req: CreateScheduleRequest): Promise<ScheduleRecord> {
  const res = await fetch(`${API_BASE_URL}/api/schedules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  const env = await _handleResponse<Envelope<ScheduleRecord>>(res);
  return env.data;
}

export async function listSchedules(groupId?: string): Promise<ScheduleRecord[]> {
  const qs = groupId ? `?group_id=${encodeURIComponent(groupId)}` : '';
  const res = await fetch(`${API_BASE_URL}/api/schedules${qs}`);
  const env = await _handleResponse<Envelope<ScheduleRecord[]>>(res);
  return env.data;
}

export async function patchSchedule(
  scheduleId: string,
  req: { enabled: boolean },
): Promise<ScheduleRecord> {
  const res = await fetch(`${API_BASE_URL}/api/schedules/${scheduleId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  const env = await _handleResponse<Envelope<ScheduleRecord>>(res);
  return env.data;
}

export async function deleteSchedule(scheduleId: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/schedules/${scheduleId}`, {
    method: 'DELETE',
  });
  if (!res.ok && res.status !== 204) {
    const body = await res.text();
    let detail: unknown = body;
    try { detail = JSON.parse(body); } catch { /* raw */ }
    // 与 _handleResponse 一致：剥掉 FastAPI 的 detail 包裹层
    if (
      detail && typeof detail === 'object' &&
      Object.keys(detail as object).length === 1 &&
      'detail' in (detail as object)
    ) {
      detail = (detail as { detail: unknown }).detail;
    }
    throw new ScheduleApiError(res.status, detail, _extractErrorCode(detail));
  }
}

export async function getScheduleRuns(scheduleId: string): Promise<ScheduleRun[]> {
  const res = await fetch(`${API_BASE_URL}/api/schedules/${scheduleId}/runs`);
  const env = await _handleResponse<Envelope<ScheduleRun[]>>(res);
  return env.data;
}
