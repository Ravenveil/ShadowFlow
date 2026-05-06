import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import type { NodeData } from '../../types';

const COLOR = '#3B82F6';  // blue — barrier accent

export const BarrierNode = memo(({ data, selected }: NodeProps<NodeData>) => {
  const status = data.status || 'idle';
  const isRunning = status === 'running';
  const arrived = (data.config as Record<string, unknown>)?.arrived as number ?? 0;
  const total   = (data.config as Record<string, unknown>)?.total   as number ?? 2;

  const dotColor = status === 'success' ? '#10B981' : status === 'error' ? '#EF4444' : COLOR;

  return (
    <div style={{
      background: '#0F0F12',
      border: `1.5px solid ${selected ? COLOR : '#27272A'}`,
      borderRadius: 12,
      minWidth: 152,
      maxWidth: 192,
      padding: '10px 12px',
      boxShadow: selected
        ? `0 0 0 1px ${COLOR}, 0 0 18px -4px ${COLOR}66`
        : '0 4px 12px -4px rgba(0,0,0,.6)',
      position: 'relative',
      transition: 'border-color .15s, box-shadow .15s',
    }}>
      {/* blue accent bar */}
      <div style={{ position: 'absolute', top: 0, left: 12, right: 12, height: 2, borderRadius: '0 0 2px 2px', background: COLOR, opacity: .7 }} />

      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
        {/* P3-1 fix: role="img" + aria-label for screen reader clarity */}
        <span role="img" aria-label="barrier gate" style={{ fontSize: 15, lineHeight: 1 }}>⊞</span>
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 700, color: '#FAFAFA', letterSpacing: '-.01em' }}>
          Barrier
        </span>
      </div>

      {/* arrival counter */}
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: isRunning ? COLOR : '#71717A', marginBottom: 8 }}>
        arrived · {arrived}/{total}
      </div>

      {/* status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: dotColor, boxShadow: isRunning ? `0 0 6px ${dotColor}` : undefined }} />
        {/* P3 fix: 'error' state was falling through to 'idle' text — add explicit branch */}
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: dotColor }}>
          {status === 'success' ? 'released'
            : status === 'running' ? 'waiting'
            : status === 'error'   ? 'error'
            : 'idle'}
        </span>
      </div>

      {/* multiple input handles (top) — positions spread left-to-right */}
      {Array.from({ length: Math.max(total, 2) }).map((_, i, arr) => (
        <Handle key={`in-${i}`} type="target" position={Position.Top} id={`in-${i}`}
          style={{
            width: 9, height: 9, borderRadius: '50%',
            background: '#0C0C10',
            border: `1.5px solid ${COLOR}`,
            left: `${((i + 1) / (arr.length + 1)) * 100}%`,
            top: -5,
            transform: 'translateX(-50%)',
          }}
        />
      ))}

      {/* single output handle (bottom) */}
      <Handle type="source" position={Position.Bottom} id="out"
        style={{ width: 10, height: 10, borderRadius: '50%', background: '#0C0C10', border: `1.5px solid ${COLOR}`, bottom: -5, left: '50%', transform: 'translateX(-50%)' }}
      />
    </div>
  );
});

BarrierNode.displayName = 'BarrierNode';
