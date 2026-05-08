// ============================================================================
// 执行节点组件
// ============================================================================

import React, { memo, useCallback } from 'react';
import { Handle, Position, NodeProps, NodeData } from 'reactflow';
import { useI18n } from '../../../common/i18n';
import { Icon } from '../../../common/icons/iconRegistry';

// Status → token color
const STATUS_COLOR: Record<string, string> = {
  idle:    'var(--t-border)',
  running: 'var(--t-run)',
  success: 'var(--t-ok)',
  error:   'var(--t-err)',
  warning: 'var(--t-warn)',
};

export const ExecutionNode = memo(({ data, selected }: NodeProps<NodeData>) => {
  const { t, language } = useI18n();

  // 节点类型特定配置 — emoji tokens mapped to Lucide by iconRegistry
  const nodeConfig: Record<string, { icon: string; color: string }> = {
    code:      { icon: '💻',  color: 'var(--t-run)' },
    test:      { icon: '🧪',  color: 'var(--t-ok)' },
    generate:  { icon: '✨',  color: 'var(--t-warn)' },
    transform: { icon: '🔄',  color: 'var(--t-accent)' },
  };

  const config = nodeConfig[data.nodeType as string] ?? nodeConfig.code;
  const status = data.status || 'idle';
  const statusColor = STATUS_COLOR[status] ?? 'var(--t-border)';
  const isRunning = status === 'running';
  const nodeColor = config.color;

  // 处理节点双击
  const handleDoubleClick = useCallback(() => {
    const event = new CustomEvent('node-edit', { detail: { nodeId: data.nodeId } });
    window.dispatchEvent(event);
  }, [data.nodeId]);

  const cfg = data.config as Record<string, unknown> | undefined;
  const executorType = (cfg?.executor as string) || 'default';
  const logCount = ((cfg?.logs as unknown[]) || []).length;

  return (
    <div
      style={{
        borderRadius: 10,
        border: `2px solid ${selected ? nodeColor : statusColor}`,
        background: `color-mix(in oklab, ${nodeColor} 8%, var(--t-panel))`,
        minWidth: 200,
        boxShadow: selected ? `0 0 0 2px ${nodeColor}66` : '0 4px 12px -4px rgba(0,0,0,.5)',
        cursor: 'pointer',
        transition: 'border-color .15s, box-shadow .15s',
      }}
      onDoubleClick={handleDoubleClick}
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
          }}
        />
      ))}

      {/* 节点内容 */}
      <div style={{ padding: 12 }}>
        {/* 图标和标题 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--t-fg-2)' }} aria-label="icon">
            <Icon token={config.icon} size={20} />
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
              animation: isRunning ? 'sf-pulse 1.8s ease-in-out infinite' : undefined,
            }} />
            <span style={{ textTransform: 'capitalize', color: statusColor }}>
              {t(`status.${data.status}`)}
            </span>
          </div>
        )}

        {/* 执行器类型 */}
        {executorType !== 'default' && (
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--t-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <svg style={{ width: 12, height: 12, color: 'var(--t-fg-4)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
              <span style={{ fontSize: 11, color: 'var(--t-fg-4)' }}>
                {executorType} executor
              </span>
            </div>
          </div>
        )}

        {/* 进度条 */}
        {data.status === 'running' && data.progress && (
          <div style={{ marginTop: 8 }}>
            <div style={{ width: '100%', height: 3, background: 'var(--t-border)', borderRadius: 9999, overflow: 'hidden' }}>
              <div style={{ height: '100%', background: 'var(--t-run)', transition: 'width .3s', width: `${data.progress}%` }} />
            </div>
            <p style={{ fontSize: 11, color: 'var(--t-fg-4)', marginTop: 2, textAlign: 'right' }}>
              {data.progress.toFixed(0)}%
            </p>
          </div>
        )}

        {/* 日志指示器 */}
        {logCount > 0 && (
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--t-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <svg style={{ width: 12, height: 12, color: 'var(--t-fg-4)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span style={{ fontSize: 11, color: 'var(--t-fg-4)' }}>
                {logCount} log{logCount > 1 ? 's' : ''}
              </span>
            </div>
          </div>
        )}

        {/* 错误指示器 */}
        {data.status === 'error' && cfg?.error && (
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--t-err)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4 }}>
              <svg style={{ width: 12, height: 12, color: 'var(--t-err)', flexShrink: 0, marginTop: 1 }} fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span style={{ fontSize: 11, color: 'var(--t-err)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {cfg.error as string}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 输出端口 */}
      {data.outputs.map((output, index) => (
        <Handle
          key={`output-${output.name}`}
          type="source"
          position={Position.Bottom}
          id={output.name}
          style={{
            width: 12, height: 12, borderRadius: '50%',
            background: nodeColor,
            border: '2px solid var(--t-border)',
            left: `${((index + 1) / (data.outputs.length || 1)) * 100}%`,
            transform: 'translateX(-50%)',
          }}
        />
      ))}
    </div>
  );
});

ExecutionNode.displayName = 'ExecutionNode';
