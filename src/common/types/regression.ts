export interface RegressionBaseline {
  baseline_id: string;
  blueprint_id: string;
  eval_profile_id: string;
  based_on_result_id: string;
  metrics_snapshot: Record<string, number>;
  citation_pass: boolean | null;
  overall_pass: boolean;
  created_at: string;
  notes: string;
}

export interface MetricDiff {
  metric_id: string;
  baseline_score: number;
  current_score: number;
  delta: number;
  status: 'improved' | 'stable' | 'regressed' | 'critical';
}

export interface RegressionReport {
  report_id: string;
  blueprint_id: string;
  baseline_id: string;
  metric_diffs: MetricDiff[];
  current_latency_ms: number;
  current_tokens: number;
  overall_status: 'passed' | 'warning' | 'blocked';
  blocking_reasons: string[];
  created_at: string;
}

export interface GateResult {
  status: 'passed' | 'warning' | 'blocked';
  blocking_metrics: string[];
  warnings: string[];
}
