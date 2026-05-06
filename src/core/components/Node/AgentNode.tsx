/**
 * AgentNode — ReactFlow node for a live-dashboard agent (Story 4.2 AC1).
 *
 * Displays agent_id + status icon with 5-state color coding:
 *   pending   → gray
 *   running   → blue + pulse
 *   succeeded → green
 *   failed    → red
 *   rejected  → red flash (3 cycles then solid red border)
 */

import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import type { NodeData } from '../../types';

const STATUS_STYLE: Record<string, { dot: string; ring: string; extra?: string }> = {
  pending:   { dot: '#6B7280', ring: '#6B7280' },
  running:   { dot: '#3B82F6', ring: '#3B82F6', extra: 'animate-pulse' },
  succeeded: { dot: '#10B981', ring: '#10B981' },
  failed:    { dot: '#EF4444', ring: '#EF4444' },
  rejected:  { dot: '#EF4444', ring: '#EF4444', extra: 'animate-flash' },
  // legacy aliases
  idle:    { dot: '#6B7280', ring: '#6B7280' },
  success: { dot: '#10B981', ring: '#10B981' },
  error:   { dot: '#EF4444', ring: '#EF4444' },
};

export const AgentNode = memo(({ data, selected }: NodeProps<NodeData>) => {
  const status = (data.status ?? 'pending') as string;
  const style = STATUS_STYLE[status] ?? STATUS_STYLE.pending;
  const agentId = (data.config?.agent_id as string | undefined) ?? data.nodeId;
  const label = typeof data.name === 'string'
    ? data.name
    : (data.name as Record<string, string>)?.zh ?? (data.name as Record<string, string>)?.en ?? agentId;

  return (
    <div
      data-testid={`agent-node-${agentId}`}
      data-status={status}
      style={{
        background: '#0F0F12',
        border: `1.5px solid ${selected ? style.ring : '#27272A'}`,
        borderRadius: 10,
        minWidth: 140,
        maxWidth: 200,
        padding: '8px 12px',
        boxShadow: selected
          ? `0 0 0 1px ${style.ring}, 0 0 16px -4px ${style.ring}66`
          : '0 4px 10px -4px rgba(0,0,0,.6)',
        transition: 'border-color .15s, box-shadow .15s',
        position: 'relative',
      }}
      className={style.extra}
    >
      {/* status accent bar */}
      <div style={{
        position: 'absolute', top: 0, left: 10, right: 10, height: 2,
        borderRadius: '0 0 2px 2px', background: style.dot, opacity: .8,
      }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {/* status dot */}
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: style.dot, flexShrink: 0,
        }} />
        <span style={{
          fontSize: 12, fontWeight: 600, color: '#E4E4E7',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {label}
        </span>
      </div>

      {agentId !== label && (
        <div style={{ fontSize: 10, color: '#71717A', marginTop: 2, paddingLeft: 14 }}>
          {agentId}
        </div>
      )}

      <Handle type="target" position={Position.Left} style={{ background: '#52525B' }} />
      <Handle type="source" position={Position.Right} style={{ background: '#52525B' }} />
    </div>
  );
});

AgentNode.displayName = 'AgentNode';
