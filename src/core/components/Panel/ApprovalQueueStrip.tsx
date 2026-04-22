/**
 * ApprovalQueueStrip — Story 4.7.
 * Bottom strip showing up to 3 pending approvals (FIFO, oldest first).
 */
import { PendingApproval } from '../../stores/useOpsStore';

export function ApprovalQueueStrip({ items }: { items: PendingApproval[] }): JSX.Element {
  const shown = items.slice(0, 3);
  return (
    <div data-testid="approval-queue-strip" style={{ width: '100%', maxWidth: 1400, padding: 12, background: '#0F0F11', border: '1px solid var(--border)', borderRadius: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>Approval Queue</div>
        <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--fg-5)' }}>
          {items.length} pending · FIFO · oldest first
        </div>
      </div>

      {items.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--fg-5)' }}>No pending approvals.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {shown.map((item, i) => {
            const wait = item.waiting_seconds;
            const waitColor = wait > 30 ? '#F59E0B' : 'var(--fg-4)';
            const dot = item.assignee?.startsWith('@external') ? '#A07AFF' : '#F59E0B';
            return (
              <div
                key={`${item.run_id}-${item.receiver}-${i}`}
                data-testid={`approval-row-${i}`}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', background: 'var(--bg-elev-1)', borderRadius: 8 }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot }} />
                <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                  {item.run_id} · {item.template} · {item.sender || '?'}→{item.receiver}
                </div>
                <div style={{ fontSize: 11, color: 'var(--fg-4)' }}>
                  gate: {item.policy_name} {item.field && `· field: ${item.field}`}
                </div>
                <div style={{ marginLeft: 'auto', fontSize: 11, fontFamily: 'var(--font-mono)', color: waitColor }}>
                  waiting {wait}s
                </div>
                <a href={`/runs/${item.run_id}#approval-${item.receiver}`} style={{ fontSize: 11, color: item.assignee === '@you' ? 'var(--accent-bright)' : 'var(--fg-5)' }}>
                  {item.assignee || '—'}
                </a>
              </div>
            );
          })}
          {items.length > 3 && (
            <div style={{ fontSize: 11, color: 'var(--accent-bright)' }}>+{items.length - 3} more →</div>
          )}
        </div>
      )}
    </div>
  );
}

export default ApprovalQueueStrip;
