import type { InboxItemStatus } from '../../../common/types/inbox';

interface StatusPillProps {
  status: InboxItemStatus;
}

const STATUS_CONFIG: Record<
  InboxItemStatus,
  { label: string; bg: string; text: string }
> = {
  running: { label: 'Running', bg: 'bg-[#22C55E]/15', text: 'text-[#22C55E]' },
  blocked: { label: 'Blocked', bg: 'bg-[#F59E0B]/15', text: 'text-[#F59E0B]' },
  idle: { label: 'Idle', bg: 'bg-[#6B7280]/15', text: 'text-[#6B7280]' },
  pending_approval: {
    label: 'Pending Approval',
    bg: 'bg-[#A78BFA]/15',
    text: 'text-[#A78BFA]',
  },
};

export function StatusPill({ status }: StatusPillProps) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.idle;
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-mono font-semibold ${cfg.bg} ${cfg.text}`}
    >
      {cfg.label}
    </span>
  );
}
