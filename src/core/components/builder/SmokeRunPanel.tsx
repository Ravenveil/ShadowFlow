/**
 * SmokeRunPanel — Story 8.5 (AC1, AC2, AC3, AC4, AC6, AC7)
 *
 * 在 Builder 主路径中发起一键 Smoke Run，展示结构化检查结果与 Builder 友好的
 * 失败解释，并提供可操作修复入口。
 *
 * 设计约定：
 *   - status / error / data 三元状态（不用单一 loading boolean）
 *   - 从 builderStore 读取 blueprint（唯一真源）
 *   - 修复入口通过 setMode / setSelection 或 onNavigate 回调实现
 *   - 原始错误保留在调试层，不对普通用户默认展示
 */
import { useRef, useState, type ReactNode } from 'react';
import { useBuilderStore } from '../../stores/builderStore';
import { smokeRunBlueprint, BuilderApiError } from '../../../api/builder';
import { CheckCircle2, X as IconX, AlertTriangle, Minus } from 'lucide-react';
import { runSmoke, pollResult, EvalApiError } from '../../../api/evals';
import type {
  BuilderSmokeRunResponse,
  SmokeCheck,
  SmokeFailureCategory,
} from '../../../common/types/agent-builder';
import type { FailureDimension, SmokeEvalResult } from '../../../common/types/eval';

// Dimension → SmokeFailureCategory mapping (AC5)
const DIMENSION_TO_CATEGORY: Record<FailureDimension, SmokeFailureCategory> = {
  goal_clarity: 'goal_clarity',
  knowledge_access: 'knowledge_inaccessible',
  tool_permission: 'tool_permission',
  role_conflict: 'role_conflict',
  graph_broken: 'graph_break',
};

const DIMENSION_TO_TARGET: Record<FailureDimension, string | null> = {
  goal_clarity: 'goal_mode',
  knowledge_access: 'knowledge_dock',
  tool_permission: 'tool_registry',
  role_conflict: 'scene_mode',
  graph_broken: 'graph_mode',
};

function evalResultToChecks(result: SmokeEvalResult): SmokeCheck[] {
  const checks: SmokeCheck[] = [];
  const failureReasons = result.failure_reasons ?? [];
  const metricScores = result.metric_scores ?? [];
  if (failureReasons.length === 0) {
    checks.push({
      check_id: 'overall',
      label: '整体评测',
      status: 'passed',
      reason: '所有检查步骤通过',
      failure_category: 'none',
      target_ref: null,
      raw_reason: null,
    });
  }
  for (const fr of failureReasons) {
    checks.push({
      check_id: `dim_${fr.dimension}`,
      label: fr.detail,
      status: 'failed',
      reason: fr.suggested_fix || fr.detail,
      failure_category: DIMENSION_TO_CATEGORY[fr.dimension],
      target_ref: DIMENSION_TO_TARGET[fr.dimension],
      raw_reason: null,
    });
  }
  for (const ms of metricScores) {
    if (!ms.passed) {
      checks.push({
        check_id: `metric_${ms.metric_id}`,
        label: `Metric 未达标 (score ${ms.score.toFixed(2)} < ${ms.threshold})`,
        status: 'warning',
        reason: `metric_id: ${ms.metric_id}`,
        failure_category: 'none',
        target_ref: null,
        raw_reason: null,
      });
    }
  }
  return checks;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RunStatus = 'idle' | 'running' | 'success' | 'error';

interface SmokeRunState {
  status: RunStatus;
  data: BuilderSmokeRunResponse['data'] | null;
  error: string | null;
  lastRunAt: string | null;
}

export interface SmokeRunPanelProps {
  /** Called when user clicks a fix-action targeting a mode switch */
  onSwitchMode?: (mode: 'goal' | 'scene' | 'graph') => void;
  /** Called when user clicks a fix-action targeting knowledge dock */
  onOpenKnowledgeDock?: () => void;
  /** Called when user clicks a fix-action targeting tool registry */
  onOpenToolRegistry?: () => void;
  /**
   * When provided, use the Eval API (Story 9.5 AC5):
   * POST /evals/run/{blueprint_id} → poll GET /evals/results/{result_id}
   */
  evalProfileId?: string;
}

// ---------------------------------------------------------------------------
// Failure translation (AC3)
// ---------------------------------------------------------------------------

const CATEGORY_LABEL: Record<SmokeFailureCategory, string> = {
  goal_clarity: '目标不够清晰',
  knowledge_inaccessible: '知识缺失或不可访问',
  tool_permission: '工具权限不足',
  role_conflict: '角色职责冲突',
  graph_break: 'Graph 配置存在断裂',
  none: '配置异常',
};

const CATEGORY_COLOR: Record<SmokeFailureCategory, string> = {
  goal_clarity: 'text-sf-warn',
  knowledge_inaccessible: 'text-sf-reject',
  tool_permission: 'text-sf-reject',
  role_conflict: 'text-sf-reject',
  graph_break: 'text-sf-reject',
  none: 'text-sf-fg3',
};

function checkStatusIcon(status: SmokeCheck['status']): ReactNode {
  switch (status) {
    case 'passed': return <CheckCircle2 size={14} strokeWidth={2.5} aria-hidden />;
    case 'failed': return <IconX size={14} strokeWidth={2.5} aria-hidden />;
    case 'warning': return <AlertTriangle size={14} strokeWidth={2.5} aria-hidden />;
    case 'skipped': return <Minus size={14} strokeWidth={2.5} aria-hidden />;
  }
}

function checkStatusClass(status: SmokeCheck['status']): string {
  switch (status) {
    case 'passed': return 'text-sf-ok border-sf-ok/30 bg-sf-ok/5';
    case 'failed': return 'text-sf-reject border-sf-reject/30 bg-sf-reject/5';
    case 'warning': return 'text-sf-warn border-sf-warn/30 bg-sf-warn/5';
    case 'skipped': return 'text-sf-fg4 border-sf-border bg-transparent';
  }
}

function overallStatusBanner(status: BuilderSmokeRunResponse['data']['status']): { bg: string; text: string; icon: ReactNode; label: string } {
  switch (status) {
    case 'passed':
      return { bg: 'border-sf-ok/40 bg-sf-ok/8', text: 'text-sf-ok', icon: <CheckCircle2 size={16} strokeWidth={2.5} aria-hidden />, label: '全部通过' };
    case 'failed':
      return { bg: 'border-sf-reject/40 bg-sf-reject/8', text: 'text-sf-reject', icon: <IconX size={16} strokeWidth={2.5} aria-hidden />, label: '存在阻塞问题' };
    case 'warning':
      return { bg: 'border-sf-warn/40 bg-sf-warn/8', text: 'text-sf-warn', icon: <AlertTriangle size={16} strokeWidth={2.5} aria-hidden />, label: '通过，有建议项' };
  }
}

// ---------------------------------------------------------------------------
// FixAction button
// ---------------------------------------------------------------------------

interface FixActionProps {
  targetRef: string | null;
  failureCategory: SmokeFailureCategory;
  onSwitchMode?: (mode: 'goal' | 'scene' | 'graph') => void;
  onOpenKnowledgeDock?: () => void;
  onOpenToolRegistry?: () => void;
}

function FixActionButton({ targetRef, failureCategory, onSwitchMode, onOpenKnowledgeDock, onOpenToolRegistry }: FixActionProps) {
  if (!targetRef && failureCategory === 'none') return null;

  let label = '查看详情';
  let action: (() => void) | null = null;

  // targetRef (explicit per-check routing) takes priority over failureCategory
  if (targetRef === 'goal_mode') {
    label = '返回 Goal Mode 补充目标';
    action = () => onSwitchMode?.('goal');
  } else if (targetRef === 'knowledge_dock') {
    label = '打开 Knowledge Dock';
    action = () => onOpenKnowledgeDock?.();
  } else if (targetRef === 'tool_registry') {
    label = '检查 Tool Registry';
    action = () => onOpenToolRegistry?.();
  } else if (targetRef === 'scene_mode') {
    label = '切换到 Scene Mode';
    action = () => onSwitchMode?.('scene');
  } else if (targetRef === 'graph_mode') {
    label = '切换到 Graph Mode';
    action = () => onSwitchMode?.('graph');
  } else if (failureCategory === 'goal_clarity') {
    label = '返回 Goal Mode 补充目标';
    action = () => onSwitchMode?.('goal');
  } else if (failureCategory === 'knowledge_inaccessible') {
    label = '打开 Knowledge Dock';
    action = () => onOpenKnowledgeDock?.();
  } else if (failureCategory === 'tool_permission') {
    label = '检查 Tool Registry';
    action = () => onOpenToolRegistry?.();
  } else if (failureCategory === 'role_conflict') {
    label = '切换到 Scene Mode';
    action = () => onSwitchMode?.('scene');
  } else if (failureCategory === 'graph_break') {
    label = '切换到 Graph Mode';
    action = () => onSwitchMode?.('graph');
  }

  if (!action) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[SmokeRunPanel] FixActionButton: no action for', { targetRef, failureCategory });
    }
    return null;
  }

  return (
    <button
      type="button"
      onClick={action}
      className="mt-2 text-[11px] text-sf-accent-bright underline hover:no-underline"
      data-testid={`fix-action-${targetRef ?? failureCategory}`}
    >
      → {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Check row
// ---------------------------------------------------------------------------

interface CheckRowProps extends FixActionProps {
  check: SmokeCheck;
  isPrimary: boolean;
}

function CheckRow({ check, isPrimary, ...fixProps }: CheckRowProps) {
  const [debugOpen, setDebugOpen] = useState(false);

  return (
    <div
      className={`rounded-[8px] border px-3 py-2.5 ${checkStatusClass(check.status)} ${isPrimary ? 'ring-1 ring-sf-reject/40' : ''}`}
      data-testid={`check-row-${check.check_id}`}
    >
      <div className="flex items-start gap-2">
        <span
          className="mt-0.5 inline-flex shrink-0 items-center justify-center"
          aria-label={`check ${check.status}`}
        >
          {checkStatusIcon(check.status)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-semibold">{check.label}</span>
            {isPrimary && (
              <span className="rounded-full bg-sf-reject/20 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-sf-reject">
                首要阻塞
              </span>
            )}
          </div>
          {check.failure_category !== 'none' && check.status !== 'passed' && (
            <p className={`mt-0.5 text-[11px] font-semibold ${CATEGORY_COLOR[check.failure_category]}`}>
              {CATEGORY_LABEL[check.failure_category]}
            </p>
          )}
          <p className="mt-1 text-[12px] leading-relaxed opacity-80">{check.reason}</p>
          {(check.status === 'failed' || check.status === 'warning') && (
            <FixActionButton {...fixProps} targetRef={check.target_ref} failureCategory={check.failure_category} />
          )}
          {check.raw_reason && (
            <div className="mt-1.5">
              <button
                type="button"
                onClick={() => setDebugOpen((v) => !v)}
                className="font-mono text-[9px] text-sf-fg5 hover:text-sf-fg4"
                data-testid={`debug-toggle-${check.check_id}`}
              >
                {debugOpen ? '▾' : '▸'} 调试信息
              </button>
              {debugOpen && (
                <pre className="mt-1 rounded bg-sf-bg px-2 py-1 font-mono text-[10px] text-sf-fg4">
                  {check.raw_reason}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SmokeRunPanel
// ---------------------------------------------------------------------------

export function SmokeRunPanel({ onSwitchMode, onOpenKnowledgeDock, onOpenToolRegistry, evalProfileId }: SmokeRunPanelProps) {
  const blueprint = useBuilderStore((s) => s.blueprint);
  const setLastSmokeRunResult = useBuilderStore((s) => s.setLastSmokeRunResult);
  // Restore persisted result from store so panel survives view switches (AC5)
  const storedResult = useBuilderStore((s) => s.lastSmokeRunResult);

  const [state, setState] = useState<SmokeRunState>(() => ({
    status: storedResult ? 'success' : 'idle',
    data: storedResult ?? null,
    error: null,
    lastRunAt: null,  // timestamps are not persisted; shown as null after remount
  }));

  const isRunningRef = useRef(false);

  async function handleRun() {
    if (!blueprint) return;
    if (isRunningRef.current) return;  // 同步守卫，防止双击竞态
    isRunningRef.current = true;
    setState({ status: 'running', data: null, error: null, lastRunAt: state.lastRunAt });

    try {
      // AC5: use Eval API when evalProfileId is provided
      if (evalProfileId && blueprint.blueprint_id) {
        try {
          const { result_id } = await runSmoke(blueprint.blueprint_id, evalProfileId);
          const evalResult = await pollResult(result_id);
          const checks = evalResultToChecks(evalResult);
          const hasFailure = !evalResult.overall_pass;
          const syntheticData: BuilderSmokeRunResponse['data'] = {
            status: hasFailure ? 'failed' : 'passed',
            summary: hasFailure
              ? `Smoke Eval 未通过，${evalResult.failure_reasons.length} 个问题`
              : `Smoke Eval 全部通过 (${evalResult.latency_ms}ms)`,
            checks,
            primary_blocker: checks.find((c) => c.status === 'failed')?.check_id ?? null,
            recommended_fix: evalResult.failure_reasons[0]?.suggested_fix ?? null,
          };
          setState({
            status: 'success',
            data: syntheticData,
            error: null,
            lastRunAt: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          });
          setLastSmokeRunResult(syntheticData);
        } catch (err) {
          // AC3: translate infra errors into user-friendly messages
          let msg: string;
          if (err instanceof EvalApiError) {
            if (err.code === 'EVAL_TIMEOUT') {
              msg = 'Smoke Run 检查超时（超过 60 秒），请稍后重试或简化 Blueprint 配置';
            } else {
              msg = '验证服务暂时不可用，请稍后重试';
            }
          } else {
            msg = '网络错误，请检查连接后重试';
          }
          // Patch 4: preserve lastRunAt on error
          setState((prev) => ({ ...prev, status: 'error', data: null, error: msg }));
        }
        return;
      }

      // Default: use builder API
      try {
        const resp = await smokeRunBlueprint(blueprint);
        setState({
          status: 'success',
          data: resp.data,
          error: null,
          lastRunAt: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        });
        // Persist to store so Publish Gate can read without re-polling (Story 8.6 AC1)
        setLastSmokeRunResult(resp.data);
      } catch (err) {
        const msg =
          err instanceof BuilderApiError
            ? `服务端错误 (${err.status})，请稍后重试`
            : '网络错误，请检查连接后重试';
        // Patch 4: preserve lastRunAt on error
        setState((prev) => ({ ...prev, status: 'error', data: null, error: msg }));
      }
    } finally {
      isRunningRef.current = false;
    }
  }

  const canRun = !!blueprint && state.status !== 'running';
  const isRunning = state.status === 'running';
  const { data, error } = state;

  return (
    <div className="flex flex-col gap-4" data-testid="smoke-run-panel">
      {/* Header + run button */}
      <div className="flex items-center justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-sf-accent-bright">
            Smoke Run · 最小验证
          </p>
          <h2 className="mt-0.5 text-[18px] font-bold tracking-[-0.02em]">
            发布前先验证最小闭环
          </h2>
          <p className="mt-1 max-w-[480px] text-[13px] leading-relaxed text-sf-fg3">
            快速检查角色初始化、工具权限、知识绑定、任务闭环与引用要求。不经历完整运行时，不暴露工程细节。
          </p>
        </div>
      </div>

      {/* Action bar */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleRun}
          disabled={!canRun}
          className="flex items-center gap-2 rounded-[8px] bg-sf-accent px-4 py-2 text-[13px] font-semibold text-white transition-opacity disabled:opacity-40 hover:enabled:opacity-90"
          data-testid="smoke-run-trigger"
        >
          {isRunning ? (
            <>
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              检查中…
            </>
          ) : (
            <>▶ 运行 Smoke Check</>
          )}
        </button>
        {state.lastRunAt && (
          <span className="font-mono text-[10px] text-sf-fg5">
            上次检查：{state.lastRunAt}
          </span>
        )}
        {!blueprint && (
          <span className="text-[12px] text-sf-warn" data-testid="no-blueprint-hint">
            请先在 Goal Mode 生成 Blueprint
          </span>
        )}
      </div>

      {/* Error banner */}
      {state.status === 'error' && error && (
        <div
          className="rounded-[10px] border border-sf-reject/40 bg-sf-reject/8 px-4 py-3 text-[13px] text-sf-reject"
          role="alert"
          data-testid="smoke-run-error-banner"
        >
          <strong>Smoke Run 失败</strong> — {error}
          <button
            type="button"
            onClick={handleRun}
            className="ml-3 underline hover:no-underline"
          >
            ↻ 重试
          </button>
        </div>
      )}

      {/* Results */}
      {state.status === 'success' && data && (
        <div className="flex flex-col gap-3">
          {/* Overall status banner */}
          {(() => {
            const banner = overallStatusBanner(data.status);
            return (
              <div
                className={`rounded-[10px] border px-4 py-3 ${banner.bg}`}
                data-testid="smoke-run-overall-status"
              >
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center justify-center font-bold ${banner.text}`}>
                    {banner.icon}
                  </span>
                  <span className={`text-[14px] font-bold ${banner.text}`}>{banner.label}</span>
                </div>
                <p className="mt-1 text-[13px] text-sf-fg2">{data.summary}</p>
                {data.recommended_fix && (
                  <p className="mt-2 text-[12px] text-sf-fg3">
                    <strong>建议：</strong>{data.recommended_fix}
                  </p>
                )}
              </div>
            );
          })()}

          {/* Check list */}
          <div className="flex flex-col gap-2" data-testid="smoke-check-list">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-sf-fg4">
              检查项 ({data.checks.length})
            </p>
            {data.checks.map((check) => (
              <CheckRow
                key={check.check_id}
                check={check}
                isPrimary={check.check_id === data.primary_blocker}
                targetRef={check.target_ref}
                failureCategory={check.failure_category}
                onSwitchMode={onSwitchMode}
                onOpenKnowledgeDock={onOpenKnowledgeDock}
                onOpenToolRegistry={onOpenToolRegistry}
              />
            ))}
          </div>

          {/* Re-run */}
          <button
            type="button"
            onClick={handleRun}
            disabled={!canRun}
            className="self-start text-[12px] text-sf-fg4 underline hover:text-sf-fg2 hover:no-underline disabled:opacity-40"
            data-testid="smoke-run-rerun"
          >
            ↻ 重新检查
          </button>
        </div>
      )}
    </div>
  );
}
