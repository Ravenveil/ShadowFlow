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
import { useNavigate } from 'react-router-dom';
import { Play, Pause, RotateCw, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';

// TODO: 后续接入实际 API
interface LoopRecord {
  loop_id: string;
  run_id: string;
  kind: 'until_converge' | 'until_diverge' | 'fixed_count';
  setpoint: {
    metric: string;
    op: string;
    value: number;
  };
  status: 'running' | 'converged' | 'oscillating' | 'diverged' | 'halted';
  iteration_count: number;
  current_iteration?: {
    iteration_number: number;
    sensor_result: {
      value: number;
      classification: string;
      converged: boolean;
    };
    started_at: string;
  };
}

interface LoopMetric {
  label: string;
  value: number | string;
  trend?: 'up' | 'down' | 'stable';
}

const STATUS_COLORS = {
  running: 'text-blue-400',
  converged: 'text-emerald-400',
  oscillating: 'text-amber-400',
  diverged: 'text-red-400',
  halted: 'text-zinc-400',
};

const STATUS_ICONS = {
  running: RotateCw,
  converged: CheckCircle2,
  oscillating: AlertTriangle,
  diverged: XCircle,
  halted: Pause,
};

export function LoopEnginePage() {
  const navigate = useNavigate();
  const [loops, setLoops] = useState<LoopRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // TODO: 接入实际 API: GET /api/loops
    // 临时模拟数据
    setTimeout(() => {
      setLoops([
        {
          loop_id: 'loop-abc123',
          run_id: 'run-xyz789',
          kind: 'until_converge',
          setpoint: { metric: 'quality', op: '>=', value: 0.95 },
          status: 'running',
          iteration_count: 7,
          current_iteration: {
            iteration_number: 7,
            sensor_result: { value: 0.92, classification: 'converging', converged: false },
            started_at: new Date().toISOString(),
          },
        },
        {
          loop_id: 'loop-def456',
          run_id: 'run-uvw101',
          kind: 'until_converge',
          setpoint: { metric: 'accuracy', op: '>=', value: 0.9 },
          status: 'converged',
          iteration_count: 12,
          current_iteration: {
            iteration_number: 12,
            sensor_result: { value: 0.91, classification: 'converged', converged: true },
            started_at: new Date(Date.now() - 3600000).toISOString(),
          },
        },
      ]);
      setLoading(false);
    }, 500);
  }, []);

  function getStatusBadge(status: LoopRecord['status']) {
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">循环引擎</h1>
          <p className="text-sm text-white/50 mt-1">
            PDCA 反馈控制环 · 收敛检测 · River Memory
          </p>
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
          <p className="text-sm">当前没有运行中的循环</p>
        </div>
      ) : (
        <div className="space-y-4">
          {loops.map((loop) => (
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
                  </div>
                  <div className="text-xs text-white/40">
                    Run: <span className="font-mono">{loop.run_id}</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-semibold text-white">
                    {loop.iteration_count}
                  </div>
                  <div className="text-xs text-white/40">迭代</div>
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
              {loop.current_iteration && (
                <div className="grid grid-cols-3 gap-4 text-xs">
                  <div>
                    <div className="text-white/40 mb-1">当前值</div>
                    <div className="font-mono text-white">
                      {typeof loop.current_iteration.sensor_result.value === 'number'
                        ? loop.current_iteration.sensor_result.value.toFixed(3)
                        : loop.current_iteration.sensor_result.value}
                    </div>
                  </div>
                  <div>
                    <div className="text-white/40 mb-1">分类</div>
                    <div className="capitalize text-white">
                      {loop.current_iteration.sensor_result.classification}
                    </div>
                  </div>
                  <div>
                    <div className="text-white/40 mb-1">收敛状态</div>
                    <div className={loop.current_iteration.sensor_result.converged ? 'text-emerald-400' : 'text-amber-400'}>
                      {loop.current_iteration.sensor_result.converged ? '已收敛' : '迭代中'}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Quick Actions */}
      <div className="flex items-center justify-between pt-4 border-t border-white/10">
        <div className="text-xs text-white/40">
          点击循环卡片查看完整 Run 详情和 Projection 视图
        </div>
        <button
          onClick={() => navigate('/runs')}
          className="text-xs text-accent hover:text-accent/80 transition-colors"
        >
          查看所有 Runs →
        </button>
      </div>
    </div>
  );
}
