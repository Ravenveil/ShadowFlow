// ============================================================================
// 基础节点组件 - 已被专门的节点组件替代，保留用于向后兼容
// ============================================================================

import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { NodeData } from '../../types';
import { useI18n } from '../../../common/i18n';
import { Icon } from '../../../common/icons/iconRegistry';

// Status → border / glow color using design tokens
const STATUS_COLOR: Record<string, string> = {
  idle:    'var(--t-border)',
  running: 'var(--t-run)',
  success: 'var(--t-ok)',
  error:   'var(--t-err)',
  warning: 'var(--t-warn)',
};

export const BaseNode = memo(({ data, selected }: NodeProps<NodeData>) => {
  const { language } = useI18n();
  const status = data.status || 'idle';
  const statusColor = STATUS_COLOR[status] ?? 'var(--t-border)';
  const accentColor = data.color || 'var(--t-accent)';

  return (
    <div
      style={{
        background: 'var(--t-panel)',
        border: `2px solid ${selected ? accentColor : statusColor}`,
        borderRadius: 10,
        minWidth: 200,
        boxShadow: selected ? `0 0 0 2px ${accentColor}66` : '0 4px 12px -4px rgba(0,0,0,.5)',
        cursor: 'pointer',
        transition: 'border-color .15s, box-shadow .15s',
        backgroundColor: `color-mix(in oklab, ${accentColor} 8%, var(--t-panel))`,
      }}
    >
      {/* 输入端口 */}
      {data.inputs.map((input, index) => (
        <Handle
          key={`input-${input.name}`}
          type="target"
          position={Position.Top}
          id={input.name}
          style={{
            width: 12, height: 12, borderRadius: '50%',
            background: 'var(--t-bg)',
            border: `2px solid ${input.required ? 'var(--t-err)' : 'var(--t-border)'}`,
            left: `${((index + 1) / (data.inputs.length || 1)) * 100}%`,
            transform: 'translateX(-50%)',
            backgroundColor: data.accentColor || accentColor,
          }}
        />
      ))}

      {/* 节点内容 */}
      <div style={{ padding: 12 }}>
        {/* 图标和标题 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--t-fg-2)' }} aria-label="icon">
            <Icon token={data.icon} size={18} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--t-fg)', margin: 0 }}>
              {data.name[language]}
            </h3>
            <p style={{ fontSize: 11, color: 'var(--t-fg-4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>
              {data.description[language]}
            </p>
          </div>
        </div>

        {/* 状态指示器 */}
        {data.status && data.status !== 'idle' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, marginTop: 8 }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: statusColor,
              animation: data.status === 'running' ? 'sf-pulse 1.8s ease-in-out infinite' : undefined,
            }} />
            <span style={{ textTransform: 'capitalize', color: statusColor }}>
              {data.status}
            </span>
          </div>
        )}

        {/* 输入端口标签 */}
        {data.inputs.length > 0 && (
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--t-border)' }}>
            <div style={{ fontSize: 10, color: 'var(--t-fg-5)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {data.inputs.length} input{data.inputs.length !== 1 ? 's' : ''}
            </div>
          </div>
        )}

        {/* 输出端口 */}
        {data.outputs.map((output, index) => (
          <Handle
            key={`output-${output.name}`}
            type="source"
            position={Position.Bottom}
            id={output.name}
            style={{
              width: 12, height: 12, borderRadius: '50%',
              background: accentColor,
              border: '2px solid var(--t-border)',
              left: `${((index + 1) / (data.outputs.length || 1)) * 100}%`,
              transform: 'translateX(-50%)',
            }}
          />
        ))}
      </div>
    </div>
  );
});

BaseNode.displayName = 'BaseNode';
