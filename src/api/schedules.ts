import { getApiBase } from './_base';

const BASE = getApiBase();

export interface ScheduleRun {
  run_id: string;
  triggered_at: string;
  status: 'succeeded' | 'failed';
}

export interface Schedule {
  schedule_id: string;
  group_id: string;
  /** Null for one-shot events; required for recurring schedules. */
  cron_expression: string | null;
  /** ISO datetime for one-shot events; null for cron-only recurring. */
  start_at: string | null;
  /** Optional — null when no agent is assigned (event acts as a reminder). */
  agent_id: string | null;
  task_description: string;
  /** Event duration in minutes (default 30). */
  duration_min: number;
  /** True after a one-shot has fired. Recurring schedules stay false. */
  completed?: boolean;
  created_at: string;
  next_run_time: string | null;
  runs: ScheduleRun[];
}

export class ScheduleApiError extends Error {
  constructor(
    public status: number,
    public detail: unknown,
  ) {
    super(`Schedule API error ${status}`);
  }
}

async function _handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail: unknown;
    try { detail = await res.json(); } catch { detail = res.statusText; }
    throw new ScheduleApiError(res.status, detail);
  }
  return res.json() as Promise<T>;
}

export interface CreateScheduleBody {
  group_id: string;
  /** Set EITHER cron_expression (recurring) OR start_at (one-shot). */
  cron_expression?: string | null;
  start_at?: string | null;        // ISO datetime
  agent_id?: string | null;
  task_description?: string;
  duration_min?: number;            // default 30 on backend
}

export async function createSchedule(
  body: CreateScheduleBody,
): Promise<{ data: Schedule; meta: Record<string, unknown> }> {
  const res = await fetch(`${BASE}/api/schedules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return _handle(res);
}

export async function listSchedules(groupId?: string): Promise<{ data: Schedule[]; meta: Record<string, unknown> }> {
  // 2026-05-11 fix — `new URL('/schedules')` throws when BASE is empty.
  const qs = groupId ? `?group_id=${encodeURIComponent(groupId)}` : '';
  const res = await fetch(`${BASE}/api/schedules${qs}`);
  return _handle(res);
}

export async function deleteSchedule(scheduleId: string): Promise<void> {
  const res = await fetch(`${BASE}/api/schedules/${scheduleId}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 204) {
    let detail: unknown;
    try { detail = await res.json(); } catch { detail = res.statusText; }
    throw new ScheduleApiError(res.status, detail);
  }
}

export async function getScheduleRuns(scheduleId: string): Promise<{ data: ScheduleRun[]; meta: Record<string, unknown> }> {
  const res = await fetch(`${BASE}/api/schedules/${scheduleId}/runs`);
  return _handle(res);
}
