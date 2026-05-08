// ============================================================================
// 输出节点组件
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

export const OutputNode = memo(({ data, selected }: NodeProps<NodeData>) => {
  const { t, language } = useI18n();

  // 节点类型特定配置 — emoji tokens mapped to Lucide by iconRegistry
  const nodeConfig: Record<string, { icon: string; color: string }> = {
    report: { icon: '📄',  color: 'var(--t-run)' },
    store:  { icon: '💾',  color: 'var(--t-ok)' },
    notify: { icon: '🔔',  color: 'var(--t-warn)' },
  };

  const config = nodeConfig[data.nodeType as string] ?? nodeConfig.report;
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
  const outputFormat = (cfg?.format as string) || 'json';
  const fileSize = cfg?.size as string | undefined;
  const notificationStatus = cfg?.status as string | undefined;
  const storageLocation = cfg?.location as string | undefined;

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
        position: 'relative' as const,
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

        {/* 输出格式 */}
        {outputFormat && (
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--t-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <svg style={{ width: 12, height: 12, color: 'var(--t-fg-4)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              <span style={{ fontSize: 11, color: 'var(--t-fg-4)' }}>
                Format: {outputFormat}
              </span>
            </div>
          </div>
        )}

        {/* 文件大小 */}
        {fileSize && (
          <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--t-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <svg style={{ width: 12, height: 12, color: 'var(--t-fg-4)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
              </svg>
              <span style={{ fontSize: 11, color: 'var(--t-fg-4)' }}>
                {fileSize}
              </span>
            </div>
          </div>
        )}

        {/* 通知状态 */}
        {notificationStatus && (
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--t-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: notificationStatus === 'sent' ? 'var(--t-ok)'
                  : notificationStatus === 'pending' ? 'var(--t-warn)'
                  : 'var(--t-err)',
                animation: notificationStatus === 'pending' ? 'sf-pulse 1.8s ease-in-out infinite' : undefined,
              }} />
              <span style={{ fontSize: 11, color: 'var(--t-fg-4)', textTransform: 'capitalize' }}>
                {notificationStatus}
              </span>
            </div>
          </div>
        )}

        {/* 存储位置 */}
        {storageLocation && (
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--t-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <svg style={{ width: 12, height: 12, color: 'var(--t-fg-4)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span style={{ fontSize: 11, color: 'var(--t-fg-4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {storageLocation}
              </span>
            </div>
          </div>
        )}

        {/* 完成度指示器 */}
        {data.status === 'success' && (
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--t-ok)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <svg style={{ width: 12, height: 12, color: 'var(--t-ok)' }} fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span style={{ fontSize: 11, color: 'var(--t-ok)' }}>Completed</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

OutputNode.displayName = 'OutputNode';
