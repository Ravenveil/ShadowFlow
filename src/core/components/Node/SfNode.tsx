import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { NodeData } from '../../types';
import { useI18n } from '../../../common/i18n';

// Status → accent color
const STATUS_COLOR: Record<string, string> = {
  idle:    '#52525B',
  running: '#A855F7',
  success: '#10B981',
  error:   '#EF4444',
  warning: '#F59E0B',
};

const STATUS_LABEL: Record<string, { en: string; zh: string }> = {
  idle:    { en: 'idle',      zh: '空闲' },
  running: { en: 'running',   zh: '运行中' },
  success: { en: 'done',      zh: '完成' },
  error:   { en: 'error',     zh: '错误' },
  warning: { en: 'retrying',  zh: '重试中' },
};

export const SfNode = memo(({ data, selected }: NodeProps<NodeData>) => {
  const { language } = useI18n();
  const status = data.status || 'idle';
  const nodeColor = data.color || '#A855F7';
  const statusColor = STATUS_COLOR[status] ?? '#52525B';
  const isRunning = status === 'running';
  const label = STATUS_LABEL[status]?.[language as 'en' | 'zh'] ?? status;
  const name = typeof data.name === 'string' ? data.name : (data.name as Record<string, string>)?.[language] ?? data.name?.['en'] ?? 'Node';
  const desc = typeof data.description === 'string' ? data.description : (data.description as Record<string, string>)?.[language] ?? data.description?.['en'] ?? '';

  return (
    <div
      style={{
        background: '#0F0F12',
        border: `1.5px solid ${selected ? nodeColor : '#27272A'}`,
        borderRadius: 12,
        minWidth: 152,
        maxWidth: 192,
        padding: '10px 12px',
        boxShadow: selected
          ? `0 0 0 1px ${nodeColor}, 0 0 18px -4px ${nodeColor}66`
          : '0 4px 12px -4px rgba(0,0,0,.6)',
        cursor: 'default',
        position: 'relative',
        transition: 'border-color .15s, box-shadow .15s',
      }}
    >
      {/* accent top bar */}
      <div style={{ position: 'absolute', top: 0, left: 12, right: 12, height: 2, borderRadius: '0 0 2px 2px', background: nodeColor, opacity: .7 }} />

      {/* icon + name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
        <span style={{ fontSize: 16, lineHeight: 1, flexShrink: 0 }}>{data.icon}</span>
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700, color: '#FAFAFA', letterSpacing: '-.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {name}
        </span>
      </div>

      {/* description / model */}
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: '#71717A', marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {desc}
      </div>

      {/* status row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{
          width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
          background: statusColor,
          boxShadow: isRunning ? `0 0 6px ${statusColor}` : undefined,
          animation: isRunning ? 'sf-pulse 1.8s ease-in-out infinite' : undefined,
        }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: statusColor }}>
          {label}
        </span>
      </div>

      {/* input handle (left) */}
      <Handle
        type="target"
        position={Position.Left}
        style={{
          width: 10, height: 10, borderRadius: '50%',
          background: status === 'running' ? `${nodeColor}33` : '#0C0C10',
          border: `1.5px solid ${
            status === 'reject' ? '#F59E0B'
            : status === 'success' ? '#10B981'
            : status === 'running' ? nodeColor
            : '#52525B'
          }`,
          left: -5, top: '50%',
          boxShadow: status === 'running' ? `0 0 0 3px ${nodeColor}26` : 'none',
        }}
      />

      {/* output handle (right) */}
      <Handle
        type="source"
        position={Position.Right}
        style={{
          width: 10, height: 10, borderRadius: '50%',
          background: status === 'running' ? `${nodeColor}33` : '#0C0C10',
          border: `1.5px solid ${
            status === 'success' ? '#10B981'
            : status === 'error'   ? '#EF4444'
            : nodeColor
          }`,
          right: -5, top: '50%',
          boxShadow: status === 'running' ? `0 0 0 3px ${nodeColor}26` : 'none',
        }}
      />
    </div>
  );
});

SfNode.displayName = 'SfNode';
