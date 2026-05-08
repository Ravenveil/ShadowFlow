import { CheckCircle2, AlertTriangle, Ban } from '../../../common/icons/iconRegistry';
import type { GateResult, MetricDiff, RegressionReport } from '../../../common/types/regression';

interface Props {
  report: RegressionReport | null;
  gateResult: GateResult | null;
  onSaveBaseline?: () => void;
  loading?: boolean;
}

const STATUS_CONFIG = {
  passed:  { label: <span className="inline-flex items-center gap-1.5"><CheckCircle2 size={12} strokeWidth={2} /> 通过</span>,  color: 'text-green-400',  border: 'border-green-500/30' },
  warning: { label: <span className="inline-flex items-center gap-1.5"><AlertTriangle size={12} strokeWidth={2} /> 警告</span>,  color: 'text-yellow-400', border: 'border-yellow-500/30' },
  blocked: { label: <span className="inline-flex items-center gap-1.5"><Ban size={12} strokeWidth={2} /> 阻断</span>,  color: 'text-red-400',    border: 'border-red-500/30' },
} as const;

function DeltaBadge({ delta }: { delta: number }) {
  const color =
    delta > 5
      ? 'text-green-400'
      : delta < -5
      ? 'text-red-400'
      : 'text-white/40';
  return (
    <span className={`font-mono text-[11px] ${color}`}>
      {delta > 0 ? '+' : ''}
      {delta.toFixed(1)}%
    </span>
  );
}

function MetricStatusLabel({ status }: { status: MetricDiff['status'] }) {
  const color =
    status === 'critical'
      ? 'text-red-400'
      : status === 'regressed'
      ? 'text-yellow-400'
      : status === 'improved'
      ? 'text-green-400'
      : 'text-white/30';
  return <span className={`text-[10px] ${color}`}>{status}</span>;
}

export function RegressionReportPanel({ report, gateResult, onSaveBaseline, loading }: Props) {
  if (loading) {
    return (
      <div className="text-sm text-white/40 py-4 text-center">
        运行回归检查中…
      </div>
    );
  }
  if (!report || !gateResult) {
    return (
      <div className="text-sm text-white/30 py-4 text-center">
        尚无回归报告。
      </div>
    );
  }

  const cfg = STATUS_CONFIG[gateResult.status];

  return (
    <div
      className={`rounded border ${cfg.border} bg-white/[0.02] p-4`}
      data-testid="regression-report-panel"
    >
      <div className={`text-lg font-semibold ${cfg.color} mb-3`}>{cfg.label}</div>

      {report.blocking_reasons.length > 0 && (
        <div className="mb-3 rounded border border-red-500/20 bg-red-500/5 p-3">
          <p className="text-[11px] font-medium text-red-400 mb-1">阻断原因</p>
          {report.blocking_reasons.map((r, i) => (
            <p key={i} className="text-[11px] text-red-300/80">
              • {r}
            </p>
          ))}
        </div>
      )}

      {report.metric_diffs.length > 0 && (
        <table className="w-full text-[11px] mb-3">
          <thead>
            <tr className="text-white/40 border-b border-white/10">
              <th className="text-left pb-1">Metric</th>
              <th className="text-right pb-1">基线</th>
              <th className="text-right pb-1">当前</th>
              <th className="text-right pb-1">变化</th>
              <th className="text-right pb-1">状态</th>
            </tr>
          </thead>
          <tbody>
            {report.metric_diffs.map((d) => (
              <tr key={d.metric_id} className="border-b border-white/5">
                <td className="py-1 text-white/70">{d.metric_id}</td>
                <td className="text-right text-white/50">{d.baseline_score.toFixed(3)}</td>
                <td className="text-right text-white/70">{d.current_score.toFixed(3)}</td>
                <td className="text-right">
                  <DeltaBadge delta={d.delta} />
                </td>
                <td className="text-right">
                  <MetricStatusLabel status={d.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {gateResult.status === 'passed' && onSaveBaseline && (
        <button
          onClick={onSaveBaseline}
          className="rounded border border-white/20 px-3 py-1.5 text-[12px] text-white/60 hover:text-white/90"
          data-testid="save-baseline-btn"
        >
          保存为新基线
        </button>
      )}
    </div>
  );
}
