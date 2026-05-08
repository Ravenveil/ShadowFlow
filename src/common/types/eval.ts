// EvalProfile + SmokeEvalResult — Story 9.5 AC4

export type MetricType =
  | 'task_completion'
  | 'citation_coverage'
  | 'latency_p95'
  | 'token_budget'
  | 'rejection_rate';

export type FailureDimension =
  | 'goal_clarity'
  | 'knowledge_access'
  | 'tool_permission'
  | 'role_conflict'
  | 'graph_broken';

export interface EvalMetric {
  metric_id: string;
  name: string;
  metric_type: MetricType;
  threshold: number;
  weight: number;
}

export interface FailureThresholds {
  max_failed_metrics: number;
  blocking_metrics: string[];
}

export interface EvalProfile {
  profile_id: string;
  name: string;
  success_metrics: EvalMetric[];
  test_prompts: string[];
  expected_artifacts: string[];
  citation_checks: boolean;
  latency_budget_ms: number;
  failure_thresholds: FailureThresholds;
  created_at: string;
  updated_at: string;
}

export interface MetricScore {
  metric_id: string;
  score: number;
  threshold: number;
  passed: boolean;
}

export interface FailureReason {
  dimension: FailureDimension;
  detail: string;
  suggested_fix: string;
}

export interface SmokeEvalResult {
  result_id: string;
  profile_id: string;
  blueprint_id: string;
  overall_pass: boolean;
  metric_scores: MetricScore[];
  citation_pass: boolean | null;
  failure_reasons: FailureReason[];
  latency_ms: number;
  token_usage: number;
  ran_at: string;
  status: 'running' | 'completed';
}

export interface RunSmokeResponse {
  result_id: string;
  status: 'running';
}
