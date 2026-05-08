import type { GroupMetrics } from '../../../common/types/inbox';

interface GroupMetricsBarProps {
  metrics: GroupMetrics;
}

interface CapsuleProps {
  label: string;
  value: string;
  color?: string;
}

function Capsule({ label, value, color = 'text-white' }: CapsuleProps) {
  return (
    <div className="flex items-center gap-1.5 rounded-sf bg-white/5 px-3 py-1.5 font-mono text-xs">
      <span className={`font-semibold ${color}`}>{value}</span>
      <span className="text-white/50">{label}</span>
    </div>
  );
}

export function GroupMetricsBar({ metrics }: GroupMetricsBarProps) {
  const { activeRuns, pendingApprovalsCount, costToday, members } = metrics;

  return (
    <div className="flex flex-wrap gap-2" data-testid="group-metrics-bar">
      <Capsule label="Active Runs" value={String(activeRuns)} color="text-[#22C55E]" />
      <Capsule
        label="Pending Approvals"
        value={String(pendingApprovalsCount)}
        color={pendingApprovalsCount > 0 ? 'text-[#F59E0B]' : 'text-white/40'}
      />
      <Capsule label="Cost Today" value={`$${costToday.toFixed(2)}`} />
      <Capsule label="Members" value={String(members)} />
    </div>
  );
}
