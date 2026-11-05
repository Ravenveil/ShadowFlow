/**
 * dashboard.ts — 数据看板 API 客户端（2026-11-05，整合 OPC-OS PR#3 看板设计）。
 * 后端：server/src/routes/dashboard.ts（overview/timeseries/breakdown/briefing）。
 */
import { getApiBase, authHeaders } from './_base';

const base = () => getApiBase();

export interface DashboardOverview {
  days: number;
  window: { from: number; to: number };
  usage: {
    calls: number;
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    cost_est_usd: number;
    deltas: { calls: number | null; total_tokens: number | null; cost_est_usd: number | null };
  };
  runs: {
    total: number;
    succeeded: number;
    failed: number;
    canceled: number;
    success_rate: number | null;
    delta_total: number | null;
  };
  active: { projects: number; conversations: number };
}

export type TimeseriesMetric = 'tokens' | 'calls' | 'cost';

export interface DashboardTimeseries {
  days: number;
  metric: TimeseriesMetric;
  series: Array<{ day: number; calls: number; tokens?: number; cost?: number }>;
}

export type BreakdownBy = 'model' | 'session';

export interface DashboardBreakdown {
  days: number;
  by: BreakdownBy;
  items: Array<{
    key: string;
    calls: number;
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    cost_est_usd: number;
  }>;
}

export interface DashboardBriefing {
  days: number;
  generated_at: number;
  today: { calls: number; total_tokens: number; cost_est_usd: number };
  yesterday: { calls: number; total_tokens: number; cost_est_usd: number };
  failed_top: Array<{ goal: string; n: number }>;
  lessons_learned: Array<{ kind: string; n: number }>;
  trend_7d: {
    total_tokens: number;
    daily: Array<{ day: number; calls: number; tokens: number; cost_est_usd: number }>;
  };
  alerts: string[];
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${base()}${path}`, { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error(`GET ${path}: ${res.status}`);
  return res.json();
}

export function fetchDashboardOverview(days = 30): Promise<DashboardOverview> {
  return getJson(`/api/dashboard/overview?days=${days}`);
}

export function fetchDashboardTimeseries(days = 30, metric: TimeseriesMetric = 'tokens'): Promise<DashboardTimeseries> {
  return getJson(`/api/dashboard/timeseries?days=${days}&metric=${metric}`);
}

export function fetchDashboardBreakdown(days = 30, by: BreakdownBy = 'model'): Promise<DashboardBreakdown> {
  return getJson(`/api/dashboard/breakdown?days=${days}&by=${by}`);
}

export function fetchDashboardBriefing(days = 7): Promise<DashboardBriefing> {
  return getJson(`/api/dashboard/briefing?days=${days}`);
}
