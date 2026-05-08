// ============================================================================
// 决策节点组件
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

export const DecisionNode = memo(({ data, selected }: NodeProps<NodeData>) => {
  const { t, language } = useI18n();

  // 节点类型特定配置 — emoji tokens mapped to Lucide by iconRegistry
  const nodeConfig: Record<string, { icon: string; color: string }> = {
    branch: { icon: '🔀',  color: 'var(--t-warn)' },
    loop:   { icon: '🔁',  color: 'var(--t-accent)' },
    merge:  { icon: '🔀',  color: 'var(--t-ok)' },
  };

  const config = nodeConfig[data.nodeType as string] ?? nodeConfig.branch;
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
  const condition = cfg?.condition as string | undefined;
  const loopCount = (cfg?.loopCount as number) || 0;
  const maxLoops = cfg?.maxLoops as number | undefined;
  const branchCount = ((cfg?.branches as unknown[]) || []).length;

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

        {/* 条件显示 */}
        {condition && (
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--t-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <svg style={{ width: 12, height: 12, color: 'var(--t-fg-4)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span style={{ fontSize: 11, color: 'var(--t-fg-4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {condition}
              </span>
            </div>
          </div>
        )}

        {/* 循环计数 */}
        {data.nodeType === 'loop' && maxLoops && (
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--t-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <svg style={{ width: 12, height: 12, color: 'var(--t-fg-4)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span style={{ fontSize: 11, color: 'var(--t-fg-4)' }}>Iteration</span>
              </div>
              <div style={{ fontSize: 11, fontWeight: 500 }}>
                <span style={{ color: loopCount >= maxLoops ? 'var(--t-err)' : loopCount > maxLoops * 0.8 ? 'var(--t-warn)' : 'var(--t-ok)' }}>
                  {loopCount}/{maxLoops}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* 分支计数 */}
        {data.nodeType === 'branch' && branchCount > 0 && (
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--t-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <svg style={{ width: 12, height: 12, color: 'var(--t-fg-4)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span style={{ fontSize: 11, color: 'var(--t-fg-4)' }}>Branches</span>
              </div>
              <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--t-fg)' }}>
                {branchCount}
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

DecisionNode.displayName = 'DecisionNode';
