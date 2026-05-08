// ============================================================================
// 审核节点组件
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

export const ReviewNode = memo(({ data, selected }: NodeProps<NodeData>) => {
  const { t, language } = useI18n();

  // 节点类型特定配置 — emoji icons mapped to Lucide by iconRegistry
  const nodeConfig: Record<string, { icon: string; color: string }> = {
    review:   { icon: '👀',  color: 'var(--t-accent)' },
    validate: { icon: '✅',  color: 'var(--t-ok)' },
    security: { icon: '🔒',  color: 'var(--t-err)' },
  };

  const config = nodeConfig[data.nodeType as string] ?? nodeConfig.review;
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
  const criteria = (cfg?.criteria as string[]) || [];
  const reviewScore = cfg?.score as number | undefined;
  const reviewChecks = (cfg?.checkResults as Array<{ passed: boolean; name: string }>) || [];

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

        {/* 审核分数 */}
        {reviewScore !== undefined && (
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--t-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <svg style={{ width: 12, height: 12, color: 'var(--t-fg-4)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                <span style={{ fontSize: 11, color: 'var(--t-fg-4)' }}>Score</span>
              </div>
              <div style={{ fontSize: 11, fontWeight: 500 }}>
                <span style={{ color: reviewScore >= 80 ? 'var(--t-ok)' : reviewScore >= 60 ? 'var(--t-warn)' : 'var(--t-err)' }}>
                  {reviewScore}%
                </span>
              </div>
            </div>
          </div>
        )}

        {/* 审核项目 */}
        {reviewChecks.length > 0 && (
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--t-border)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {reviewChecks.slice(0, 3).map((check, index) => (
                <div key={index} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: check.passed ? 'var(--t-ok)' : 'var(--t-err)', flexShrink: 0 }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--t-fg-3)' }}>{check.name}</span>
                </div>
              ))}
              {reviewChecks.length > 3 && (
                <div style={{ fontSize: 11, color: 'var(--t-fg-5)', textAlign: 'center' }}>
                  +{reviewChecks.length - 3} more checks
                </div>
              )}
            </div>
          </div>
        )}

        {/* 审核标准 */}
        {criteria.length > 0 && (
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--t-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
              <svg style={{ width: 12, height: 12, color: 'var(--t-fg-4)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span style={{ fontSize: 11, color: 'var(--t-fg-4)' }}>Criteria</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {criteria.slice(0, 3).map((criterion, index) => (
                <span
                  key={index}
                  style={{ fontSize: 11, background: 'var(--t-bg)', color: 'var(--t-fg-3)', padding: '1px 6px', borderRadius: 4, border: '1px solid var(--t-border)' }}
                >
                  {criterion}
                </span>
              ))}
              {criteria.length > 3 && (
                <span style={{ fontSize: 11, color: 'var(--t-fg-5)' }}>+{criteria.length - 3}</span>
              )}
            </div>
          </div>
        )}

        {/* 问题标记 */}
        {data.status === 'warning' && cfg?.issues && (cfg.issues as unknown[]).length > 0 && (
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid var(--t-warn)` }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4 }}>
              <svg style={{ width: 12, height: 12, color: 'var(--t-warn)', flexShrink: 0, marginTop: 1 }} fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span style={{ fontSize: 11, color: 'var(--t-warn)' }}>
                {(cfg.issues as unknown[]).length} issue{(cfg.issues as unknown[]).length > 1 ? 's' : ''}
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

ReviewNode.displayName = 'ReviewNode';
