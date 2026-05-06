import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import type { NodeData } from '../../types';

const COLOR = '#F59E0B';  // amber — approval gate accent

export const ApprovalGateNode = memo(({ data, selected }: NodeProps<NodeData>) => {
  const approver = (data.config as Record<string, unknown>)?.approver as string | undefined;
  const status = data.status || 'idle';
  const isRunning = status === 'running';

  const statusColor: Record<string, string> = {
    idle:    '#52525B',
    running: COLOR,
    success: '#10B981',
    error:   '#EF4444',
    rejected:'#EF4444',
    pending: COLOR,
  };
  const statusLabel: Record<string, string> = {
    idle:    'idle',
    running: 'awaiting',
    success: 'approved',
    error:   'error',
    rejected:'rejected',
    pending: 'pending',
  };

  const dotColor = statusColor[status] ?? '#52525B';

  return (
    <div style={{
      background: '#0F0F12',
      border: `1.5px solid ${selected ? COLOR : '#27272A'}`,
      borderRadius: 12,
      minWidth: 160,
      maxWidth: 200,
      padding: '10px 12px',
      boxShadow: selected
        ? `0 0 0 1px ${COLOR}, 0 0 18px -4px ${COLOR}66`
        : '0 4px 12px -4px rgba(0,0,0,.6)',
      position: 'relative',
      transition: 'border-color .15s, box-shadow .15s',
    }}>
      {/* amber accent bar */}
      <div style={{ position: 'absolute', top: 0, left: 12, right: 12, height: 2, borderRadius: '0 0 2px 2px', background: COLOR, opacity: .8 }} />

      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
        {/* P3-1 fix: add role="img" + aria-label so screen readers don't mispronounce emoji */}
        <span role="img" aria-label="shield" style={{ fontSize: 15, lineHeight: 1 }}>🛡</span>
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 700, color: '#FAFAFA', letterSpacing: '-.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          ApprovalGate
        </span>
      </div>

      {/* approver line */}
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: approver ? '#A78BFA' : '#52525B', marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {approver ? `approver · ${approver}` : '未指定审批人'}
      </div>

      {/* status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: dotColor, boxShadow: isRunning ? `0 0 6px ${dotColor}` : undefined }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: dotColor }}>
          {statusLabel[status] ?? status}
        </span>
      </div>

      {/* input handle */}
      <Handle type="target" position={Position.Left} id="in"
        style={{ width: 10, height: 10, borderRadius: '50%', background: '#0C0C10', border: `1.5px solid #52525B`, left: -5, top: '50%' }}
      />

      {/* approve handle (top-right) */}
      <Handle type="source" position={Position.Right} id="approve"
        style={{ width: 10, height: 10, borderRadius: '50%', background: '#0C0C10', border: '1.5px solid #10B981', right: -5, top: '30%' }}
      />

      {/* reject handle (bottom-right) */}
      <Handle type="source" position={Position.Right} id="reject"
        style={{ width: 10, height: 10, borderRadius: '50%', background: '#0C0C10', border: '1.5px solid #EF4444', right: -5, top: '70%' }}
      />

      {/* approve/reject labels */}
      <div style={{ position: 'absolute', right: 14, top: 'calc(30% - 10px)', fontFamily: 'var(--font-mono)', fontSize: 8, color: '#10B981' }}>✓</div>
      <div style={{ position: 'absolute', right: 14, top: 'calc(70% - 10px)', fontFamily: 'var(--font-mono)', fontSize: 8, color: '#EF4444' }}>✗</div>
    </div>
  );
});

ApprovalGateNode.displayName = 'ApprovalGateNode';
