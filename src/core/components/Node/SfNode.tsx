import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { NodeData } from '../../types';
import { useI18n } from '../../../common/i18n';
import { Icon } from '../../../common/icons/iconRegistry';

// Status → accent color
const STATUS_COLOR: Record<string, string> = {
  idle:    'var(--t-fg-4)',
  running: 'var(--t-accent)',
  success: 'var(--t-ok)',
  error:   'var(--t-err)',
  warning: 'var(--t-warn)',
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
  const nodeColor = data.color || 'var(--t-accent)';
  const statusColor = STATUS_COLOR[status] ?? 'var(--t-fg-4)';
  const isRunning = status === 'running';
  const label = STATUS_LABEL[status]?.[language as 'en' | 'zh'] ?? status;
  const name = typeof data.name === 'string' ? data.name : (data.name as Record<string, string>)?.[language] ?? data.name?.['en'] ?? 'Node';
  const desc = typeof data.description === 'string' ? data.description : (data.description as Record<string, string>)?.[language] ?? data.description?.['en'] ?? '';

  return (
    <div
      style={{
        background: 'var(--t-panel)',
        border: `1.5px solid ${selected ? nodeColor : 'var(--t-border)'}`,
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
        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, flexShrink: 0, color: 'var(--t-fg-2)' }}>
          <Icon token={data.icon} size={16} />
        </span>
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700, color: 'var(--t-fg)', letterSpacing: '-.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {name}
        </span>
      </div>

      {/* description / model */}
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--t-fg-4)', marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
          background: status === 'running' ? `${nodeColor}33` : 'var(--t-bg)',
          border: `1.5px solid ${
            status === 'reject' ? 'var(--t-warn)'
            : status === 'success' ? 'var(--t-ok)'
            : status === 'running' ? nodeColor
            : 'var(--t-fg-4)'
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
          background: status === 'running' ? `${nodeColor}33` : 'var(--t-bg)',
          border: `1.5px solid ${
            status === 'success' ? 'var(--t-ok)'
            : status === 'error'   ? 'var(--t-err)'
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
