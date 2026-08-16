/**
 * LoopEnginePage — 循环引擎专用页面 (/loop-engine)
 *
 * 功能:
 *   - 展示当前运行中的循环列表
 *   - 循环详情：PDCA 状态、迭代历史、收敛检测
 *   - River Memory 集成视图
 *   - Policy Matrix 触发事件
 *
 * W1-D（2026-08-16）：整页 Neo 化（loop-engine-neo.css，neo-le-* 作用域），
 * 死链修复：卡片点击不再跳已下架的 /runs/:id，改跳 /?run=<runId>
 * （chat-first 主体验恢复该 run 执行现场）。
 *
 * 对应设计文档: docs/architecture/loop-engine-design.md
 */

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Pause, RotateCw, AlertTriangle, CheckCircle2, XCircle, TrendingUp, TrendingDown, Minus, StopCircle } from 'lucide-react';
import { listRuns, getRunLoops, haltLoop, type LoopKind, type LoopStatus } from '../api/runs';
import { useI18n } from '../common/i18n';
import './loop-engine-neo.css';

interface DisplayLoop {
  step_id: string;
  node_id: string;
  loop_id: string;
  run_id: string;
  kind: LoopKind;
  setpoint: {
    metric: string;
    op: string;
    value: number;
  };
  status: LoopStatus;
  iteration_count: number;
  iterations: Array<{
    index: number;
    sensor_result: {
      converged: boolean;
      classification: string;
      value?: number;
    };
    metrics: Record<string, number>;
  }>;
  started_at: string;
  ended_at: string | null;
  depth: number;
}

const STATUS_ICONS: Record<LoopStatus, typeof Pause> = {
  running: RotateCw,
  converged: CheckCircle2,
  oscillating: AlertTriangle,
  diverged: XCircle,
  halted: Pause,
};

function getTrendIcon(history: number[]): React.ElementType {
  if (history.length < 2) return Minus;
  const last = history[history.length - 1];
  const prev = history[history.length - 2];
  if (last > prev) return TrendingUp;
  if (last < prev) return TrendingDown;
  return Minus;
}

export function LoopEnginePage() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { runId } = useParams<{ runId?: string }>();
  const [loops, setLoops] = useState<DisplayLoop[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [haltingLoopId, setHaltingLoopId] = useState<string | null>(null);

  async function handleHaltLoop(loop: DisplayLoop, e: React.MouseEvent) {
    e.stopPropagation(); // Prevent card click navigation
    if (haltingLoopId) return;

    setHaltingLoopId(loop.loop_id);
    try {
      await haltLoop(loop.run_id, loop.loop_id);
      // Refresh loops to update status
      if (runId) {
        const response = await getRunLoops(runId);
        const displayLoops: DisplayLoop[] = response.loops.map((step) => {
          const loopData = step.loop;
          return {
            step_id: step.step_id,
            node_id: step.node_id,
            loop_id: loopData.loop_id,
            run_id: loopData.run_id,
            kind: loopData.kind,
            setpoint: loopData.setpoint,
            status: loopData.status,
            iteration_count: loopData.iteration_count,
            iterations: loopData.iterations.map((iter: any) => ({
              index: iter.index,
              sensor_result: {
                converged: iter.evidence?.sensor?.converged ?? false,
                classification: iter.evidence?.sensor?.classification ?? 'unknown',
                value: iter.evidence?.sensor?.value,
              },
              metrics: iter.metrics ?? {},
            })),
            started_at: step.started_at,
            ended_at: step.ended_at,
            depth: loopData.depth,
          };
        });
        setLoops(displayLoops);
      }
    } catch (err) {
      console.error('Failed to halt loop:', err);
      // Could show a toast notification here
    } finally {
      setHaltingLoopId(null);
    }
  }

  useEffect(() => {
    async function loadLoops() {
      try {
        setLoading(true);
        setError(null);

        if (runId) {
          // Load loops for a specific run
          const response = await getRunLoops(runId);
          const displayLoops: DisplayLoop[] = response.loops.map((step) => {
            const loop = step.loop;
            return {
              step_id: step.step_id,
              node_id: step.node_id,
              loop_id: loop.loop_id,
              run_id: loop.run_id,
              kind: loop.kind,
              setpoint: loop.setpoint,
              status: loop.status,
              iteration_count: loop.iteration_count,
              iterations: loop.iterations.map((iter: any) => ({
                index: iter.index,
                sensor_result: {
                  converged: iter.evidence?.sensor?.converged ?? false,
                  classification: iter.evidence?.sensor?.classification ?? 'unknown',
                  value: iter.evidence?.sensor?.value,
                },
                metrics: iter.metrics ?? {},
              })),
              started_at: step.started_at,
              ended_at: step.ended_at,
              depth: loop.depth,
            };
          });
          setLoops(displayLoops);
        } else {
          // Load all recent runs and their loops
          const runs = await listRuns();
          const loopsByRun: DisplayLoop[] = [];

          for (const run of runs.slice(0, 10)) {
            try {
              const response = await getRunLoops(run.run_id);
              const displayLoops: DisplayLoop[] = response.loops.map((step) => {
                const loop = step.loop;
                return {
                  step_id: step.step_id,
                  node_id: step.node_id,
                  loop_id: loop.loop_id,
                  run_id: loop.run_id,
                  kind: loop.kind,
                  setpoint: loop.setpoint,
                  status: loop.status,
                  iteration_count: loop.iteration_count,
                  iterations: loop.iterations.map((iter: any) => ({
                    index: iter.index,
                    sensor_result: {
                      converged: iter.evidence?.sensor?.converged ?? false,
                      classification: iter.evidence?.sensor?.classification ?? 'unknown',
                      value: iter.evidence?.sensor?.value,
                    },
                    metrics: iter.metrics ?? {},
                  })),
                  started_at: step.started_at,
                  ended_at: step.ended_at,
                  depth: loop.depth,
                };
              });
              loopsByRun.push(...displayLoops);
            } catch {
              // Skip runs that fail to load
            }
          }
          setLoops(loopsByRun);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load loops');
      } finally {
        setLoading(false);
      }
    }

    loadLoops();
  }, [runId]);

  function getStatusBadge(status: LoopStatus) {
    const Icon = STATUS_ICONS[status];
    return (
      <span className={`neo-le-pill neo-le-pill--${status}`}>
        <Icon size={12} />
        <span>{status}</span>
      </span>
    );
  }

  if (loading) {
    return (
      <div className="neo-le">
        <div className="neo-le-center">
          <div className="neo-le-loading">
            <RotateCw size={16} className="neo-le-spin" />
            <span>{t('neo.loopEngine.loading', { defaultValue: '加载循环引擎状态…' })}</span>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="neo-le">
        <div className="neo-le-center">
          <div className="neo-le-error">
            <AlertTriangle size={40} className="neo-le-error-icon" />
            <p className="neo-le-error-msg">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="neo-le-error-retry"
            >
              {t('neo.loopEngine.retry', { defaultValue: '重试' })}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Get the latest iteration for each loop
  function getLatestIteration(loop: DisplayLoop) {
    if (loop.iterations.length === 0) return null;
    return loop.iterations[loop.iterations.length - 1];
  }

  // Get metric history for trend calculation
  function getMetricHistory(loop: DisplayLoop): number[] {
    const metric = loop.setpoint.metric;
    return loop.iterations
      .map((iter) => {
        const value = iter.metrics[metric];
        return typeof value === 'number' ? value : null;
      })
      .filter((v): v is number => v !== null);
  }

  const runningCount = loops.filter(l => l.status === 'running').length;

  return (
    <div className="neo-le">
      {/* Header */}
      <header className="neo-le-header">
        <div>
          <p className="neo-le-eyebrow">Loop Engine / PDCA</p>
          <h1 className="neo-le-title">
            {t('neo.loopEngine.title', { defaultValue: '循环引擎' })}
          </h1>
          <p className="neo-le-sub">
            {t('neo.loopEngine.subtitle', { defaultValue: 'PDCA 反馈控制环 · 收敛检测 · River Memory' })}
          </p>
          {runId && (
            <p className="neo-le-runref">Run: {runId}</p>
          )}
        </div>
        <span className="neo-le-count">
          {t('neo.loopEngine.count', {
            defaultValue: `${runningCount} 运行中 · ${loops.length} 总计`,
          })}
        </span>
      </header>

      {/* Loops List */}
      {loops.length === 0 ? (
        <div className="neo-le-empty">
          <Pause size={40} className="neo-le-empty-icon" />
          <p className="neo-le-empty-t1">
            {t('neo.loopEngine.emptyTitle', { defaultValue: '当前没有循环记录' })}
          </p>
          <p className="neo-le-empty-t2">
            {t('neo.loopEngine.emptyHint', { defaultValue: '运行包含 control.loop 节点的 workflow 后将在此显示' })}
          </p>
        </div>
      ) : (
        <div className="neo-le-list">
          {loops.map((loop) => {
            const latestIteration = getLatestIteration(loop);
            const metricHistory = getMetricHistory(loop);
            const TrendIcon = metricHistory.length > 1 ? getTrendIcon(metricHistory) : Minus;
            const trendClass = metricHistory.length > 1
              ? (metricHistory[metricHistory.length - 1] > metricHistory[metricHistory.length - 2]
                  ? 'neo-le-trend--up'
                  : metricHistory[metricHistory.length - 1] < metricHistory[metricHistory.length - 2]
                  ? 'neo-le-trend--down'
                  : 'neo-le-trend--flat')
              : 'neo-le-trend--flat';

            return (
              <div
                key={loop.loop_id}
                className="neo-le-card"
                onClick={() => navigate(`/?run=${loop.run_id}`)}
              >
                {/* Header */}
                <div className="neo-le-card-head">
                  <div className="neo-le-card-main">
                    <div className="neo-le-card-title-row">
                      <span className="neo-le-card-id">{loop.loop_id}</span>
                      {getStatusBadge(loop.status)}
                      {loop.depth > 0 && (
                        <span className="neo-le-depth">
                          {t('neo.loopEngine.depth', { defaultValue: `深度 ${loop.depth}` })}
                        </span>
                      )}
                    </div>
                    <div className="neo-le-card-meta">
                      Run: {loop.run_id}
                      {loop.node_id && ` · Node: ${loop.node_id}`}
                    </div>
                  </div>
                  <div className="neo-le-card-side">
                    <div className="neo-le-iters">
                      <div className="neo-le-iters-num">{loop.iteration_count}</div>
                      <div className="neo-le-iters-label">
                        {t('neo.loopEngine.iterations', { defaultValue: '迭代' })}
                      </div>
                    </div>
                    {loop.status === 'running' && (
                      <button
                        onClick={(e) => handleHaltLoop(loop, e)}
                        disabled={haltingLoopId === loop.loop_id}
                        className={`neo-le-halt ${haltingLoopId === loop.loop_id ? 'neo-le-halt--busy' : ''}`}
                        title={t('neo.loopEngine.halt', { defaultValue: '终止循环' })}
                      >
                        <StopCircle size={18} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Setpoint */}
                <div className="neo-le-setpoint">
                  <div className="neo-le-setpoint-label">
                    {t('neo.loopEngine.setpoint', { defaultValue: '收敛目标' })}
                  </div>
                  <div className="neo-le-setpoint-expr">
                    {loop.setpoint.metric} {loop.setpoint.op} {loop.setpoint.value}
                  </div>
                </div>

                {/* Current Iteration */}
                {latestIteration && (
                  <div className="neo-le-grid">
                    <div>
                      <div className="neo-le-cell-label">
                        {t('neo.loopEngine.currentValue', { defaultValue: '当前值' })}
                      </div>
                      <div className="neo-le-cell-value neo-le-cell-value--mono">
                        {metricHistory.length > 1 && (
                          <TrendIcon size={12} className={trendClass} />
                        )}
                        <span>
                          {latestIteration.sensor_result.value !== undefined
                            ? latestIteration.sensor_result.value.toFixed(3)
                            : latestIteration.metrics[loop.setpoint.metric]?.toFixed(3) ?? '-'
                          }
                        </span>
                      </div>
                    </div>
                    <div>
                      <div className="neo-le-cell-label">
                        {t('neo.loopEngine.classification', { defaultValue: '分类' })}
                      </div>
                      <div className="neo-le-cell-value" style={{ textTransform: 'capitalize' }}>
                        {latestIteration.sensor_result.classification || 'unknown'}
                      </div>
                    </div>
                    <div>
                      <div className="neo-le-cell-label">
                        {t('neo.loopEngine.convergence', { defaultValue: '收敛状态' })}
                      </div>
                      <div className={`neo-le-cell-value ${latestIteration.sensor_result.converged ? 'neo-le-conv--yes' : 'neo-le-conv--no'}`}>
                        {latestIteration.sensor_result.converged
                          ? t('neo.loopEngine.converged', { defaultValue: '已收敛' })
                          : t('neo.loopEngine.iterating', { defaultValue: '迭代中' })}
                      </div>
                    </div>
                    <div>
                      <div className="neo-le-cell-label">
                        {t('neo.loopEngine.latestIteration', { defaultValue: '最新迭代' })}
                      </div>
                      <div className="neo-le-cell-value neo-le-cell-value--mono">
                        #{latestIteration.index}
                      </div>
                    </div>
                  </div>
                )}

                {/* Timeline indicator */}
                {loop.iterations.length > 1 && (
                  <div className="neo-le-timeline">
                    {loop.iterations.slice(-10).map((iter) => {
                      const isConverged = iter.sensor_result.converged;
                      return (
                        <div
                          key={iter.index}
                          className={`neo-le-tick ${isConverged ? 'neo-le-tick--converged' : 'neo-le-tick--pending'}`}
                          style={{ width: `${100 / Math.min(loop.iterations.length, 10)}%` }}
                          title={t('neo.loopEngine.tickTitle', {
                            defaultValue: `迭代 ${iter.index}: ${isConverged ? 'converged' : 'pending'}`,
                          })}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Footer */}
      <div className="neo-le-footer">
        {runId
          ? t('neo.loopEngine.footerRun', { defaultValue: '显示当前 Run 的所有循环记录' })
          : t('neo.loopEngine.footerAll', { defaultValue: '点击循环卡片回到对话，恢复该 Run 的执行现场' })
        }
      </div>
    </div>
  );
}

export default LoopEnginePage;
