export type NodeStatus = 'idle' | 'running' | 'success' | 'error' | 'pending' | 'rejected';

const STATUS_MAP: Record<NodeStatus, { label: string; bg: string; color: string; border: string }> = {
  idle:     { label: '空闲',   bg: 'var(--bg-elev-2)',           color: 'var(--fg-4)',          border: 'var(--border)' },
  pending:  { label: '等待',   bg: 'rgba(245,158,11,.08)',        color: 'var(--status-warn)',   border: 'rgba(245,158,11,.3)' },
  running:  { label: '运行中', bg: 'rgba(59,130,246,.08)',        color: 'var(--status-run)',    border: 'rgba(59,130,246,.3)' },
  success:  { label: '成功',   bg: 'var(--status-ok-tint)',       color: 'var(--status-ok)',     border: 'rgba(16,185,129,.3)' },
  error:    { label: '失败',   bg: 'var(--status-reject-tint)',   color: 'var(--status-reject)', border: 'rgba(239,68,68,.3)' },
  rejected: { label: '驳回',   bg: 'var(--status-reject-tint)',   color: 'var(--status-reject)', border: 'rgba(239,68,68,.3)' },
};

interface StatusBadgeProps {
  status: NodeStatus | string;
  className?: string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const cfg = STATUS_MAP[status as NodeStatus] ?? STATUS_MAP.idle;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 8px', borderRadius: 999,
      fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
      letterSpacing: '.08em', textTransform: 'uppercase',
      background: cfg.bg, color: cfg.color,
      border: `1px solid ${cfg.border}`,
    }}>
      {cfg.label}
    </span>
  );
}
