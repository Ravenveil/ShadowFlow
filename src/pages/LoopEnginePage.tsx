/**
 * LoopEnginePage — 循环引擎专用页面 (/loop-engine)
 *
 * 功能:
 *   - 展示当前运行中的循环列表
 *   - 循环详情：PDCA 状态、迭代历史、收敛检测
 *   - River Memory 集成视图
 *   - Policy Matrix 触发事件
 *
 * 对应设计文档: docs/architecture/loop-engine-design.md
 */

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Pause, RotateCw, AlertTriangle, CheckCircle2, XCircle, TrendingUp, TrendingDown, Minus, StopCircle } from 'lucide-react';
import { listRuns, getRunLoops, haltLoop, type LoopKind, type LoopStatus } from '../api/runs';

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

const STATUS_COLORS: Record<LoopStatus, string> = {
  running: 'text-blue-400',
  converged: 'text-emerald-400',
  oscillating: 'text-amber-400',
  diverged: 'text-red-400',
  halted: 'text-zinc-400',
};

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
      <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full border bg-white/5 ${STATUS_COLORS[status]}`}>
        <Icon className="w-3.5 h-3.5" />
        <span className="text-xs font-medium capitalize">{status}</span>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-white/40">
          <RotateCw className="w-5 h-5 animate-spin" />
          <span className="text-sm">加载循环引擎状态...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center text-white/40">
          <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="text-sm">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-3 text-xs text-accent hover:text-accent/80"
          >
            重试
          </button>
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">循环引擎</h1>
          <p className="text-sm text-white/50 mt-1">
            PDCA 反馈控制环 · 收敛检测 · River Memory
          </p>
          {runId && (
            <div className="text-xs text-white/30 mt-1">
              Run: <span className="font-mono">{runId}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="text-xs text-white/40">
            {loops.filter(l => l.status === 'running').length} 运行中 · {loops.length} 总计
          </div>
        </div>
      </div>

      {/* Loops List */}
      {loops.length === 0 ? (
        <div className="text-center py-12 text-white/40">
          <Pause className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="text-sm">当前没有循环记录</p>
          <p className="text-xs mt-2">运行包含 control.loop 节点的 workflow 后将在此显示</p>
        </div>
      ) : (
        <div className="space-y-4">
          {loops.map((loop) => {
            const latestIteration = getLatestIteration(loop);
            const metricHistory = getMetricHistory(loop);
            const TrendIcon = metricHistory.length > 1 ? getTrendIcon(metricHistory) : Minus;
            const trendColor = metricHistory.length > 1
              ? (metricHistory[metricHistory.length - 1] > metricHistory[metricHistory.length - 2]
                  ? 'text-emerald-400'
                  : metricHistory[metricHistory.length - 1] < metricHistory[metricHistory.length - 2]
                  ? 'text-red-400'
                  : 'text-zinc-400')
              : 'text-zinc-400';

            return (
              <div
                key={loop.loop_id}
                className="bg-white/5 border border-white/10 rounded-lg p-5 hover:bg-white/[0.07] transition-colors cursor-pointer"
                onClick={() => navigate(`/runs/${loop.run_id}`)}
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-sm font-mono text-white/80">{loop.loop_id}</h3>
                      {getStatusBadge(loop.status)}
                      {loop.depth > 0 && (
                        <span className="text-xs text-white/30 bg-white/5 px-1.5 py-0.5 rounded">
                          深度 {loop.depth}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-white/40">
                      Run: <span className="font-mono">{loop.run_id}</span>
                      {loop.node_id && (
                        <>
                          {' '}· Node: <span className="font-mono">{loop.node_id}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex items-center gap-3">
                    <div className="text-right">
                      <div className="text-2xl font-semibold text-white">
                        {loop.iteration_count}
                      </div>
                      <div className="text-xs text-white/40">迭代</div>
                    </div>
                    {loop.status === 'running' && (
                      <button
                        onClick={(e) => handleHaltLoop(loop, e)}
                        disabled={haltingLoopId === loop.loop_id}
                        className="p-2 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 disabled:opacity-50 transition-colors"
                        title="终止循环"
                      >
                        <StopCircle className={`w-5 h-5 ${haltingLoopId === loop.loop_id ? 'animate-pulse' : ''}`} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Setpoint */}
                <div className="bg-black/30 rounded px-3 py-2 mb-3">
                  <div className="text-xs text-white/50 mb-1">收敛目标</div>
                  <div className="font-mono text-sm text-white">
                    {loop.setpoint.metric} {loop.setpoint.op} {loop.setpoint.value}
                  </div>
                </div>

                {/* Current Iteration */}
                {latestIteration && (
                  <div className="grid grid-cols-4 gap-4 text-xs mb-3">
                    <div>
                      <div className="text-white/40 mb-1">当前值</div>
                      <div className="flex items-center gap-1">
                        {metricHistory.length > 1 && (
                          <TrendIcon className={`w-3 h-3 ${trendColor}`} />
                        )}
                        <div className="font-mono text-white">
                          {latestIteration.sensor_result.value !== undefined
                            ? latestIteration.sensor_result.value.toFixed(3)
                            : latestIteration.metrics[loop.setpoint.metric]?.toFixed(3) ?? '-'
                          }
                        </div>
                      </div>
                    </div>
                    <div>
                      <div className="text-white/40 mb-1">分类</div>
                      <div className="capitalize text-white">
                        {latestIteration.sensor_result.classification || 'unknown'}
                      </div>
                    </div>
                    <div>
                      <div className="text-white/40 mb-1">收敛状态</div>
                      <div className={latestIteration.sensor_result.converged ? 'text-emerald-400' : 'text-amber-400'}>
                        {latestIteration.sensor_result.converged ? '已收敛' : '迭代中'}
                      </div>
                    </div>
                    <div>
                      <div className="text-white/40 mb-1">最新迭代</div>
                      <div className="text-white">
                        #{latestIteration.index}
                      </div>
                    </div>
                  </div>
                )}

                {/* Timeline indicator */}
                {loop.iterations.length > 1 && (
                  <div className="flex items-center gap-1 mt-2">
                    {loop.iterations.slice(-10).map((iter) => {
                      const isConverged = iter.sensor_result.converged;
                      return (
                        <div
                          key={iter.index}
                          className={`h-1.5 rounded-full ${
                            isConverged ? 'bg-emerald-400' : 'bg-amber-400/50'
                          }`}
                          style={{ width: `${100 / Math.min(loop.iterations.length, 10)}%` }}
                          title={`迭代 ${iter.index}: ${isConverged ? 'converged' : 'pending'}`}
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

      {/* Quick Actions */}
      <div className="flex items-center justify-between pt-4 border-t border-white/10">
        <div className="text-xs text-white/40">
          {runId
            ? '显示当前 Run 的所有循环记录'
            : '点击循环卡片查看完整 Run 详情和 Projection 视图'
          }
        </div>
        {!runId && (
          <button
            onClick={() => navigate('/runs')}
            className="text-xs text-accent hover:text-accent/80 transition-colors"
          >
            查看所有 Runs →
          </button>
        )}
      </div>
    </div>
  );
}

export default LoopEnginePage;
