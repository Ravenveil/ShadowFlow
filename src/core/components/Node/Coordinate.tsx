// ============================================================================
// 协调节点组件
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

export const CoordinateNode = memo(({ data, selected }: NodeProps<NodeData>) => {
  const { t, language } = useI18n();

  // 节点类型特定配置 — emoji tokens map to Lucide via iconRegistry
  const nodeConfig: Record<string, { icon: string; color: string }> = {
    assign:    { icon: '👤',  color: 'var(--t-run)' },
    aggregate: { icon: '📊',  color: 'var(--t-ok)' },
    barrier:   { icon: '⛔',  color: 'var(--t-accent)' },
    negotiate: { icon: '🤝',  color: 'var(--t-warn)' },
    sequence:  { icon: '📈',  color: 'var(--t-run)' },
    parallel:  { icon: '⚡',  color: 'var(--t-accent)' },
  };

  const config = nodeConfig[data.nodeType as string] ?? nodeConfig.assign;
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
  const targets = (cfg?.targets as string[]) || [];
  const pendingNodes = (cfg?.pendingNodes as number) || 0;
  const aggregatedResults = ((cfg?.results as unknown[]) || []).length;
  const negotiationStatus = cfg?.status as string | undefined;

  return (
    <div
      style={{
        borderRadius: 10,
        border: `2px solid ${selected ? nodeColor : statusColor}`,
        background: `color-mix(in oklab, ${nodeColor} 8%, var(--t-panel))`,
        minWidth: 220,
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

        {/* Barrier: 等待状态 */}
        {data.nodeType === 'barrier' && pendingNodes > 0 && (
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--t-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <svg style={{ width: 12, height: 12, color: 'var(--t-fg-4)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span style={{ fontSize: 11, color: 'var(--t-fg-4)' }}>Waiting</span>
              </div>
              <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--t-warn)' }}>
                {pendingNodes} nodes
              </div>
            </div>
          </div>
        )}

        {/* Assign: 目标列表 */}
        {targets.length > 0 && (
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--t-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
              <svg style={{ width: 12, height: 12, color: 'var(--t-fg-4)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span style={{ fontSize: 11, color: 'var(--t-fg-4)' }}>Targets</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {targets.slice(0, 3).map((target, index) => (
                <div key={index} style={{ fontSize: 11, color: 'var(--t-fg-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {target}
                </div>
              ))}
              {targets.length > 3 && (
                <div style={{ fontSize: 11, color: 'var(--t-fg-5)', textAlign: 'center' }}>
                  +{targets.length - 3} more
                </div>
              )}
            </div>
          </div>
        )}

        {/* Aggregate: 结果统计 */}
        {aggregatedResults > 0 && (
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--t-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <svg style={{ width: 12, height: 12, color: 'var(--t-fg-4)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                </svg>
                <span style={{ fontSize: 11, color: 'var(--t-fg-4)' }}>Results</span>
              </div>
              <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--t-ok)' }}>
                {aggregatedResults}
              </div>
            </div>
          </div>
        )}

        {/* Negotiate: 协商状态 */}
        {negotiationStatus && (
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--t-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: negotiationStatus === 'in-progress' ? 'var(--t-run)'
                  : negotiationStatus === 'agreed' ? 'var(--t-ok)'
                  : negotiationStatus === 'disagreed' ? 'var(--t-err)'
                  : 'var(--t-warn)',
                animation: negotiationStatus === 'in-progress' ? 'sf-pulse 1.8s ease-in-out infinite' : undefined,
              }} />
              <span style={{ fontSize: 11, color: 'var(--t-fg-4)', textTransform: 'capitalize' }}>
                {negotiationStatus.replace('-', ' ')}
              </span>
            </div>
          </div>
        )}

        {/* Sequence: 步骤指示器 */}
        {data.nodeType === 'sequence' && cfg?.step && (
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--t-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <svg style={{ width: 12, height: 12, color: 'var(--t-fg-4)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <span style={{ fontSize: 11, color: 'var(--t-fg-4)' }}>Step</span>
              </div>
              <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--t-fg)' }}>
                {cfg.step as string}
              </div>
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

CoordinateNode.displayName = 'CoordinateNode';
