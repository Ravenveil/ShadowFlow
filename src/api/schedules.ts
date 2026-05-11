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
  cron_expression: string;
  agent_id: string;
  task_description: string;
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

export async function createSchedule(body: {
  group_id: string;
  cron_expression: string;
  agent_id: string;
  task_description: string;
}): Promise<{ data: Schedule; meta: Record<string, unknown> }> {
  const res = await fetch(`${BASE}/schedules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return _handle(res);
}

export async function listSchedules(groupId?: string): Promise<{ data: Schedule[]; meta: Record<string, unknown> }> {
  // 2026-05-11 fix — `new URL('/schedules')` throws when BASE is empty.
  const qs = groupId ? `?group_id=${encodeURIComponent(groupId)}` : '';
  const res = await fetch(`${BASE}/schedules${qs}`);
  return _handle(res);
}

export async function deleteSchedule(scheduleId: string): Promise<void> {
  const res = await fetch(`${BASE}/schedules/${scheduleId}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 204) {
    let detail: unknown;
    try { detail = await res.json(); } catch { detail = res.statusText; }
    throw new ScheduleApiError(res.status, detail);
  }
}

export async function getScheduleRuns(scheduleId: string): Promise<{ data: ScheduleRun[]; meta: Record<string, unknown> }> {
  const res = await fetch(`${BASE}/schedules/${scheduleId}/runs`);
  return _handle(res);
}
