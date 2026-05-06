// ============================================================================
// 审核节点组件
// ============================================================================

import React, { memo, useCallback } from 'react';
import { Handle, Position, NodeProps, NodeData } from 'reactflow';
import { useI18n } from '../../../common/i18n';
import { clsx } from 'clsx';

export const ReviewNode = memo(({ data, selected }: NodeProps<NodeData>) => {
  const { t, language } = useI18n();

  const statusColors = {
    idle: 'border-gray-300',
    running: 'border-blue-500 animate-pulse',
    success: 'border-green-500',
    error: 'border-red-500',
    warning: 'border-yellow-500',
  };

  const statusBgColors = {
    idle: 'bg-gray-50',
    running: 'bg-blue-50',
    success: 'bg-green-50',
    error: 'bg-red-50',
    warning: 'bg-yellow-50',
  };

  // 节点类型特定配置
  const nodeConfig = {
    review: {
      icon: '👀',
      title: 'Review',
      color: '#8B5CF6',
      bgColor: 'bg-purple-50',
      borderColor: 'border-purple-300',
      handleColor: 'bg-purple-500',
    },
    validate: {
      icon: '✅',
      title: 'Validate',
      color: '#10B981',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-300',
      handleColor: 'bg-green-500',
    },
    security: {
      icon: '🔒',
      title: 'Security Audit',
      color: '#EF4444',
      bgColor: 'bg-red-50',
      borderColor: 'border-red-300',
      handleColor: 'bg-red-500',
    }
  };

  const config = nodeConfig[data.nodeType as keyof typeof nodeConfig] || nodeConfig.review;

  // 处理节点双击
  const handleDoubleClick = useCallback(() => {
    const event = new CustomEvent('node-edit', { detail: { nodeId: data.nodeId } });
    window.dispatchEvent(event);
  }, [data.nodeId]);

  // 显示审核标准
  const criteria = data.config?.criteria || [];

  // 显示审核结果
  const reviewScore = data.config?.score;
  const reviewChecks = data.config?.checkResults || [];

  return (
    <div
      className={clsx(
        'rounded-lg border-2 shadow-sm transition-all cursor-pointer',
        statusColors[data.status || 'idle'],
        statusBgColors[data.status || 'idle'],
        selected && 'ring-2 ring-offset-2 ring-blue-500',
        config.bgColor,
        'min-w-[200px]',
        'hover:shadow-md'
      )}
      style={{
        borderColor: selected ? undefined : config.borderColor,
        backgroundColor: `${config.color}10`,
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
          className={clsx(
            'w-3 h-3 !border-2',
            input.required ? '!border-red-500' : '!border-gray-400',
            config.handleColor
          )}
          style={{
            left: `${((index + 1) / (data.inputs.length || 1)) * 100}%`,
            transform: 'translateX(-50%)',
          }}
        />
      ))}

      {/* 节点内容 */}
      <div className="p-3">
        {/* 图标和标题 */}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xl" role="img" aria-label="icon">
            {config.icon}
          </span>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm truncate">
              {data.name[language]}
            </h3>
            <p className="text-xs text-gray-600 truncate">
              {data.description[language]}
            </p>
          </div>
        </div>

        {/* 状态指示器 */}
        {data.status && data.status !== 'idle' && (
          <div className="flex items-center gap-1 text-xs mt-2">
            <div
              className={clsx(
                'w-2 h-2 rounded-full',
                data.status === 'running' && 'animate-bounce bg-blue-500',
                data.status === 'success' && 'bg-green-500',
                data.status === 'error' && 'bg-red-500',
                data.status === 'warning' && 'bg-yellow-500'
              )}
            />
            <span className="capitalize">
              {t(`status.${data.status}`)}
            </span>
          </div>
        )}

        {/* 审核分数 */}
        {reviewScore !== undefined && (
          <div className="mt-2 pt-2 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                <span className="text-xs text-gray-500">Score</span>
              </div>
              <div className="text-xs font-medium">
                <span className={clsx(
                  reviewScore >= 80 ? 'text-green-600' :
                  reviewScore >= 60 ? 'text-yellow-600' : 'text-red-600'
                )}>
                  {reviewScore}%
                </span>
              </div>
            </div>
          </div>
        )}

        {/* 审核项目 */}
        {reviewChecks.length > 0 && (
          <div className="mt-2 pt-2 border-t border-gray-200">
            <div className="space-y-1">
              {reviewChecks.slice(0, 3).map((check, index) => (
                <div key={index} className="flex items-center gap-1 text-xs">
                  <div
                    className={clsx(
                      'w-1.5 h-1.5 rounded-full',
                      check.passed ? 'bg-green-500' : 'bg-red-500'
                    )}
                  />
                  <span className="truncate text-gray-600">{check.name}</span>
                </div>
              ))}
              {reviewChecks.length > 3 && (
                <div className="text-xs text-gray-400 text-center">
                  +{reviewChecks.length - 3} more checks
                </div>
              )}
            </div>
          </div>
        )}

        {/* 审核标准 */}
        {criteria.length > 0 && (
          <div className="mt-2 pt-2 border-t border-gray-200">
            <div className="flex items-center gap-1 mb-1">
              <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-xs text-gray-500">Criteria</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {criteria.slice(0, 3).map((criterion, index) => (
                <span
                  key={index}
                  className="text-xs bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded"
                >
                  {criterion}
                </span>
              ))}
              {criteria.length > 3 && (
                <span className="text-xs text-gray-400">+{criteria.length - 3}</span>
              )}
            </div>
          </div>
        )}

        {/* 问题标记 */}
        {data.status === 'warning' && data.config?.issues && data.config.issues.length > 0 && (
          <div className="mt-2 pt-2 border-t border-yellow-200">
            <div className="flex items-start gap-1">
              <svg className="w-3 h-3 text-yellow-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span className="text-xs text-yellow-600">
                {data.config.issues.length} issue{data.config.issues.length > 1 ? 's' : ''}
              </span>
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
            className="w-3 h-3 !border-2 !border-gray-400"
            style={{
              left: `${((index + 1) / (data.outputs.length || 1)) * 100}%`,
              transform: 'translateX(-50%)',
              backgroundColor: config.handleColor,
            }}
          />
        ))}
      </div>
    </div>
  );
});

ReviewNode.displayName = 'ReviewNode';