/**
 * EvalsPage — Story 9.5 AC4 + Story 9-6 (Regression Gate)
 *
 * UI PROTECTION: 只能加，不能删。/evals 是新独立路由。
 *
 * 功能：
 *   - 列出 EvalProfile（GET /evals/profiles）
 *   - 创建/编辑 EvalProfile
 *   - Smoke Run 触发按钮 + 结果卡片（overall_pass + metric 表格 + failure_reasons）
 *   - suggested_fix 链接到对应 Builder 页面
 *   - Regression Gate 对比面板（Story 9-6）
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  createProfile,
  deleteProfile,
  EvalApiError,
  listProfiles,
  pollResult,
  runSmoke,
} from '../api/evals';
import { runRegression, saveBaseline } from '../api/regression';
import type {
  EvalMetric,
  EvalProfile,
  FailureDimension,
  SmokeEvalResult,
} from '../common/types/eval';
import type { GateResult, RegressionReport } from '../common/types/regression';
import { RegressionReportPanel } from '../core/components/evals/RegressionReportPanel';

// ---------------------------------------------------------------------------
// Dimension label + nav mapping (AC5 requirement)
// ---------------------------------------------------------------------------

const DIMENSION_LABEL: Record<FailureDimension, string> = {
  goal_clarity: '目标不够清晰',
  knowledge_access: '知识不可访问',
  tool_permission: '工具权限不足',
  role_conflict: '角色职责冲突',
  graph_broken: 'Graph 配置断裂',
};

const DIMENSION_NAV: Record<FailureDimension, string> = {
  goal_clarity: '/builder',
  knowledge_access: '/knowledge',
  tool_permission: '/builder',
  role_conflict: '/builder',
  graph_broken: '/builder',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type RunStatus = 'idle' | 'running' | 'done' | 'error';

interface RunState {
  status: RunStatus;
  result: SmokeEvalResult | null;
  error: string | null;
}

// ---------------------------------------------------------------------------
// EvalProfile list item
// ---------------------------------------------------------------------------

interface ProfileCardProps {
  profile: EvalProfile;
  onDelete: (id: string) => void;
  onRunSmoke: (profile: EvalProfile) => void;
  runState: RunState;
}

function ProfileCard({ profile, onDelete, onRunSmoke, runState }: ProfileCardProps) {
  const isRunning = runState.status === 'running';
  const result = runState.result;

  return (
    <div
      className="rounded-[12px] border border-sf-border bg-sf-surface p-4 flex flex-col gap-3"
      data-testid={`profile-card-${profile.profile_id}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-sf-accent-bright">
            EvalProfile
          </p>
          <h3 className="mt-0.5 text-[15px] font-bold tracking-[-0.015em]">{profile.name}</h3>
          <p className="text-[11px] text-sf-fg4">
            {profile.success_metrics.length} 指标 · {profile.test_prompts.length} 提示词
            {profile.citation_checks && ' · 引用校验'}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onRunSmoke(profile)}
            disabled={isRunning}
            className="rounded-[8px] bg-sf-accent px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40 hover:enabled:opacity-90"
            data-testid={`smoke-run-btn-${profile.profile_id}`}
          >
            {isRunning ? '运行中…' : '▶ Smoke Run'}
          </button>
          <button
            type="button"
            onClick={() => onDelete(profile.profile_id)}
            className="rounded-[8px] border border-sf-border px-3 py-1.5 text-[12px] text-sf-fg3 hover:text-sf-reject hover:border-sf-reject/40"
            data-testid={`delete-profile-btn-${profile.profile_id}`}
          >
            删除
          </button>
        </div>
      </div>

      {/* Metrics */}
      {profile.success_metrics.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {profile.success_metrics.map((m) => (
            <span
              key={m.metric_id}
              className="rounded-full bg-sf-bg border border-sf-border px-2 py-0.5 font-mono text-[10px] text-sf-fg3"
            >
              {m.name} ≥ {m.threshold}
            </span>
          ))}
        </div>
      )}

      {/* Smoke run result */}
      {runState.status === 'error' && runState.error && (
        <div
          className="rounded-[8px] border border-sf-reject/40 bg-sf-reject/8 px-3 py-2 text-[12px] text-sf-reject"
          data-testid="eval-run-error"
        >
          {runState.error}
        </div>
      )}

      {runState.status === 'done' && result && (
        <EvalResultCard result={result} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Eval result card
// ---------------------------------------------------------------------------

function EvalResultCard({ result }: { result: SmokeEvalResult }) {
  const navigate = useNavigate();
  const pass = result.overall_pass;

  return (
    <div
      className={`rounded-[10px] border p-3 flex flex-col gap-3 ${
        pass
          ? 'border-sf-ok/40 bg-sf-ok/5'
          : 'border-sf-reject/40 bg-sf-reject/5'
      }`}
      data-testid="eval-result-card"
    >
      {/* Overall */}
      <div className="flex items-center gap-2">
        <span className={`text-[18px] font-bold ${pass ? 'text-sf-ok' : 'text-sf-reject'}`}>
          {pass ? '✓' : '✗'}
        </span>
        <div>
          <span className={`text-[13px] font-bold ${pass ? 'text-sf-ok' : 'text-sf-reject'}`}>
            {pass ? '全部通过' : '存在问题'}
          </span>
          <span className="ml-3 font-mono text-[10px] text-sf-fg5">
            {result.latency_ms}ms · {result.token_usage} tokens
          </span>
        </div>
      </div>

      {/* Metric scores */}
      {result.metric_scores.length > 0 && (
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-sf-fg4 mb-1.5">
            Metric 评分
          </p>
          <table className="w-full text-[11px]" data-testid="metric-scores-table">
            <thead>
              <tr className="text-sf-fg4 text-left">
                <th className="pb-1 font-medium">指标</th>
                <th className="pb-1 font-medium text-right">得分</th>
                <th className="pb-1 font-medium text-right">阈值</th>
                <th className="pb-1 font-medium text-right">状态</th>
              </tr>
            </thead>
            <tbody>
              {result.metric_scores.map((ms) => (
                <tr key={ms.metric_id} className="border-t border-sf-border/40">
                  <td className="py-1 font-mono text-[10px] text-sf-fg3">{ms.metric_id.slice(0, 8)}</td>
                  <td className="py-1 text-right">{ms.score.toFixed(3)}</td>
                  <td className="py-1 text-right text-sf-fg4">{ms.threshold.toFixed(3)}</td>
                  <td className="py-1 text-right">
                    <span className={ms.passed ? 'text-sf-ok' : 'text-sf-reject'}>
                      {ms.passed ? '✓' : '✗'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Failure reasons */}
      {result.failure_reasons.length > 0 && (
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-sf-fg4 mb-1.5">
            失败原因
          </p>
          <div className="flex flex-col gap-2">
            {result.failure_reasons.map((fr, i) => (
              <div
                key={i}
                className="rounded-[8px] border border-sf-reject/30 bg-sf-reject/5 px-3 py-2"
                data-testid={`failure-reason-${fr.dimension}`}
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-mono text-[10px] font-bold uppercase text-sf-reject">
                    {DIMENSION_LABEL[fr.dimension]}
                  </span>
                </div>
                <p className="text-[11px] text-sf-fg2">{fr.detail}</p>
                {fr.suggested_fix && (
                  <button
                    type="button"
                    onClick={() => navigate(DIMENSION_NAV[fr.dimension])}
                    className="mt-1 text-[11px] text-sf-accent-bright underline hover:no-underline"
                    data-testid={`fix-link-${fr.dimension}`}
                  >
                    → {fr.suggested_fix}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="font-mono text-[9px] text-sf-fg5">
        ran_at: {new Date(result.ran_at).toLocaleString('zh-CN')}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create profile form
// ---------------------------------------------------------------------------

interface CreateFormProps {
  onCreated: (p: EvalProfile) => void;
  onCancel: () => void;
}

const METRIC_TYPES = [
  'task_completion',
  'citation_coverage',
  'latency_p95',
  'token_budget',
  'rejection_rate',
] as const;

function CreateProfileForm({ onCreated, onCancel }: CreateFormProps) {
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [metricName, setMetricName] = useState('任务完成率');
  const [metricType, setMetricType] = useState<EvalMetric['metric_type']>('task_completion');
  const [threshold, setThreshold] = useState('0.8');
  const [citationChecks, setCitationChecks] = useState(false);
  const [latencyBudget, setLatencyBudget] = useState('0');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !prompt.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const profile = await createProfile({
        name: name.trim(),
        test_prompts: [prompt.trim()],
        success_metrics: [
          {
            metric_id: crypto.randomUUID().replace(/-/g, ''),
            name: metricName,
            metric_type: metricType,
            threshold: parseFloat(threshold) || 0.8,
            weight: 1.0,
          },
        ],
        expected_artifacts: [],
        citation_checks: citationChecks,
        latency_budget_ms: parseInt(latencyBudget) || 0,
        failure_thresholds: { max_failed_metrics: 1, blocking_metrics: [] },
      });
      onCreated(profile);
    } catch (err) {
      setError(err instanceof EvalApiError ? `创建失败 (${err.status})` : '创建失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-[12px] border border-sf-accent/30 bg-sf-surface p-4 flex flex-col gap-3"
      data-testid="create-profile-form"
    >
      <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-sf-accent-bright">
        新建 EvalProfile
      </p>

      <div className="flex flex-col gap-1">
        <label className="text-[11px] text-sf-fg3">名称 *</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Research Agent Smoke"
          className="rounded-[6px] border border-sf-border bg-sf-bg px-2.5 py-1.5 text-[13px] outline-none focus:border-sf-accent"
          required
          data-testid="profile-name-input"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[11px] text-sf-fg3">测试提示词 *</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="请帮我总结这篇论文的核心贡献"
          rows={2}
          className="rounded-[6px] border border-sf-border bg-sf-bg px-2.5 py-1.5 text-[13px] outline-none focus:border-sf-accent resize-none"
          required
          data-testid="profile-prompt-input"
        />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-sf-fg3">指标名称</label>
          <input
            value={metricName}
            onChange={(e) => setMetricName(e.target.value)}
            className="rounded-[6px] border border-sf-border bg-sf-bg px-2.5 py-1.5 text-[12px] outline-none focus:border-sf-accent"
            data-testid="metric-name-input"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-sf-fg3">指标类型</label>
          <select
            value={metricType}
            onChange={(e) => setMetricType(e.target.value as EvalMetric['metric_type'])}
            className="rounded-[6px] border border-sf-border bg-sf-bg px-2.5 py-1.5 text-[12px] outline-none focus:border-sf-accent"
            data-testid="metric-type-select"
          >
            {METRIC_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-sf-fg3">阈值 (0–1)</label>
          <input
            type="number"
            min="0"
            max="1"
            step="0.05"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            className="rounded-[6px] border border-sf-border bg-sf-bg px-2.5 py-1.5 text-[12px] outline-none focus:border-sf-accent"
            data-testid="metric-threshold-input"
          />
        </div>
      </div>

      <div className="flex items-center gap-4">
        <label className="flex items-center gap-1.5 text-[12px] cursor-pointer select-none">
          <input
            type="checkbox"
            checked={citationChecks}
            onChange={(e) => setCitationChecks(e.target.checked)}
            className="accent-sf-accent"
            data-testid="citation-checks-input"
          />
          引用校验
        </label>
        <div className="flex items-center gap-1.5">
          <label className="text-[11px] text-sf-fg3">时延上限 (ms, 0=不限)</label>
          <input
            type="number"
            min="0"
            value={latencyBudget}
            onChange={(e) => setLatencyBudget(e.target.value)}
            className="w-20 rounded-[6px] border border-sf-border bg-sf-bg px-2 py-1 text-[12px] outline-none focus:border-sf-accent"
            data-testid="latency-budget-input"
          />
        </div>
      </div>

      {error && (
        <p className="text-[12px] text-sf-reject" data-testid="create-error">{error}</p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-[8px] bg-sf-accent px-4 py-1.5 text-[13px] font-semibold text-white disabled:opacity-40 hover:enabled:opacity-90"
          data-testid="create-profile-submit"
        >
          {saving ? '保存中…' : '创建'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-[8px] border border-sf-border px-4 py-1.5 text-[13px] text-sf-fg3 hover:text-sf-fg1"
        >
          取消
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// EvalsPage
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Regression state type (Story 9-6)
// ---------------------------------------------------------------------------

interface RegressionState {
  loading: boolean;
  report: RegressionReport | null;
  gateResult: GateResult | null;
}

export default function EvalsPage() {
  const [profiles, setProfiles] = useState<EvalProfile[]>([]);
  const [loadStatus, setLoadStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [showCreateForm, setShowCreateForm] = useState(false);
  // Map profile_id → run state
  const [runStates, setRunStates] = useState<Record<string, RunState>>({});
  // Map profile_id → regression state (Story 9-6)
  const [regressionStates, setRegressionStates] = useState<Record<string, RegressionState>>({});
  const [showRegression, setShowRegression] = useState<Record<string, boolean>>({});

  const loadProfiles = useCallback(async () => {
    setLoadStatus('loading');
    try {
      const list = await listProfiles();
      setProfiles(list);
      setLoadStatus('idle');
    } catch {
      setLoadStatus('error');
    }
  }, []);

  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  function handleCreated(p: EvalProfile) {
    setProfiles((prev) => [p, ...prev]);
    setShowCreateForm(false);
  }

  async function handleDelete(profileId: string) {
    try {
      await deleteProfile(profileId);
      setProfiles((prev) => prev.filter((p) => p.profile_id !== profileId));
    } catch {
      // noop — keep in list if delete failed
    }
  }

  async function handleRunSmoke(profile: EvalProfile) {
    // We need a blueprint_id; prompt the user if none is available.
    // For now, use the profile_id as a placeholder blueprint_id.
    const blueprintId = profile.profile_id;
    setRunStates((prev) => ({
      ...prev,
      [profile.profile_id]: { status: 'running', result: null, error: null },
    }));
    try {
      const { result_id } = await runSmoke(blueprintId, profile.profile_id);
      const result = await pollResult(result_id);
      setRunStates((prev) => ({
        ...prev,
        [profile.profile_id]: { status: 'done', result, error: null },
      }));
    } catch (err) {
      const msg =
        err instanceof EvalApiError
          ? `Smoke Run 失败 (${err.status})`
          : err instanceof Error
          ? err.message
          : 'Smoke Run 失败';
      setRunStates((prev) => ({
        ...prev,
        [profile.profile_id]: { status: 'error', result: null, error: msg },
      }));
    }
  }

  // ---------------------------------------------------------------------------
  // Regression Gate handlers (Story 9-6)
  // ---------------------------------------------------------------------------

  async function handleRunRegression(profile: EvalProfile) {
    const blueprintId = profile.profile_id;
    setRegressionStates((prev) => ({
      ...prev,
      [profile.profile_id]: { loading: true, report: null, gateResult: null },
    }));
    setShowRegression((prev) => ({ ...prev, [profile.profile_id]: true }));
    try {
      // Extract metric scores from the latest smoke run result if available
      const smokeResult = runStates[profile.profile_id]?.result;
      const metrics: Record<string, number> = {};
      if (smokeResult) {
        for (const ms of smokeResult.metric_scores) {
          metrics[ms.metric_id] = ms.score;
        }
      }
      const data = await runRegression(blueprintId, metrics);
      if (data) {
        setRegressionStates((prev) => ({
          ...prev,
          [profile.profile_id]: {
            loading: false,
            report: data.report,
            gateResult: data.gate_result,
          },
        }));
      } else {
        // No baseline yet
        setRegressionStates((prev) => ({
          ...prev,
          [profile.profile_id]: { loading: false, report: null, gateResult: null },
        }));
      }
    } catch {
      setRegressionStates((prev) => ({
        ...prev,
        [profile.profile_id]: { loading: false, report: null, gateResult: null },
      }));
    }
  }

  async function handleSaveBaseline(profile: EvalProfile) {
    const smokeResult = runStates[profile.profile_id]?.result;
    const metrics: Record<string, number> = {};
    if (smokeResult) {
      for (const ms of smokeResult.metric_scores) {
        metrics[ms.metric_id] = ms.score;
      }
    }
    await saveBaseline(profile.profile_id, metrics);
  }

  return (
    <div className="min-h-screen bg-sf-bg text-sf-fg1">
      {/* Page header */}
      <div className="border-b border-sf-border px-6 py-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-sf-accent-bright">
          Evals · 评测中心
        </p>
        <h1 className="mt-1 text-[22px] font-bold tracking-[-0.02em]">EvalProfile 管理</h1>
        <p className="mt-1 text-[13px] text-sf-fg3">
          定义最低评测标准，在发布前一键执行 Smoke Eval
        </p>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-6 flex flex-col gap-4">
        {/* Actions */}
        <div className="flex items-center justify-between">
          <p className="text-[13px] text-sf-fg3">
            {profiles.length} 个 EvalProfile
          </p>
          {!showCreateForm && (
            <button
              type="button"
              onClick={() => setShowCreateForm(true)}
              className="rounded-[8px] bg-sf-accent px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90"
              data-testid="create-profile-btn"
            >
              + 新建 EvalProfile
            </button>
          )}
        </div>

        {/* Create form */}
        {showCreateForm && (
          <CreateProfileForm
            onCreated={handleCreated}
            onCancel={() => setShowCreateForm(false)}
          />
        )}

        {/* Loading / error states */}
        {loadStatus === 'loading' && (
          <p className="text-[13px] text-sf-fg4 animate-pulse" data-testid="profiles-loading">
            加载中…
          </p>
        )}
        {loadStatus === 'error' && (
          <div
            className="rounded-[10px] border border-sf-reject/40 bg-sf-reject/8 px-4 py-3 text-[13px] text-sf-reject"
            data-testid="profiles-error"
          >
            加载失败
            <button
              type="button"
              onClick={loadProfiles}
              className="ml-3 underline hover:no-underline"
            >
              重试
            </button>
          </div>
        )}

        {/* Profile list */}
        {loadStatus === 'idle' && profiles.length === 0 && !showCreateForm && (
          <div
            className="rounded-[12px] border border-sf-border border-dashed px-6 py-10 text-center"
            data-testid="empty-state"
          >
            <p className="text-[14px] text-sf-fg3">还没有 EvalProfile</p>
            <button
              type="button"
              onClick={() => setShowCreateForm(true)}
              className="mt-3 text-[13px] text-sf-accent-bright underline hover:no-underline"
            >
              创建第一个
            </button>
          </div>
        )}

        {profiles.map((profile) => (
          <div key={profile.profile_id} className="flex flex-col gap-2">
            <ProfileCard
              profile={profile}
              onDelete={handleDelete}
              onRunSmoke={handleRunSmoke}
              runState={runStates[profile.profile_id] ?? { status: 'idle', result: null, error: null }}
            />

            {/* Regression Gate section (Story 9-6) */}
            <div className="pl-1">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleRunRegression(profile)}
                  className="rounded-[7px] border border-sf-border px-3 py-1 text-[11px] text-sf-fg3 hover:text-sf-fg1 hover:border-sf-accent/40"
                  data-testid={`regression-run-btn-${profile.profile_id}`}
                >
                  回归对比
                </button>
                {showRegression[profile.profile_id] && (
                  <button
                    type="button"
                    onClick={() =>
                      setShowRegression((prev) => ({
                        ...prev,
                        [profile.profile_id]: false,
                      }))
                    }
                    className="text-[11px] text-sf-fg5 hover:text-sf-fg3"
                  >
                    收起
                  </button>
                )}
              </div>

              {showRegression[profile.profile_id] && (
                <div className="mt-2">
                  <RegressionReportPanel
                    report={regressionStates[profile.profile_id]?.report ?? null}
                    gateResult={regressionStates[profile.profile_id]?.gateResult ?? null}
                    loading={regressionStates[profile.profile_id]?.loading ?? false}
                    onSaveBaseline={() => handleSaveBaseline(profile)}
                  />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
