import type { GateResult, RegressionBaseline, RegressionReport } from '../common/types/regression';
import { getApiBase } from './_base';

const BASE = `${getApiBase()}/regression`;

export async function runRegression(
  blueprintId: string,
  metrics: Record<string, number> = {},
) {
  const res = await fetch(`${BASE}/${blueprintId}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ current_metrics: metrics }),
  });
  return (await res.json()).data as
    | { gate_result: GateResult; report: RegressionReport }
    | null;
}

export async function listBaselines(blueprintId: string) {
  const res = await fetch(`${BASE}/${blueprintId}/baselines`);
  return (await res.json()).data as RegressionBaseline[];
}

export async function saveBaseline(
  blueprintId: string,
  metrics: Record<string, number> = {},
) {
  const res = await fetch(`${BASE}/${blueprintId}/baselines`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ metrics_snapshot: metrics }),
  });
  return (await res.json()).data;
}
