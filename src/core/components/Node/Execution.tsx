// ============================================================================
// 执行节点组件
// ============================================================================

import React, { memo, useCallback } from 'react';
import { Handle, Position, NodeProps, NodeData } from 'reactflow';
import { useI18n } from '../../i18n';
import { clsx } from 'clsx';

export const ExecutionNode = memo(({ data, selected }: NodeProps<NodeData>) => {
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
    code: {
      icon: '💻',
      title: 'Code',
      color: '#3B82F6',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-300',
      handleColor: 'bg-blue-500',
    },
    test: {
      icon: '🧪',
      title: 'Test',
      color: '#10B981',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-300',
      handleColor: 'bg-green-500',
    },
    generate: {
      icon: '✨',
      title: 'Generate',
      color: '#F59E0B',
      bgColor: 'bg-amber-50',
      borderColor: 'border-amber-300',
      handleColor: 'bg-amber-500',
    },
    transform: {
      icon: '🔄',
      title: 'Transform',
      color: '#8B5CF6',
      bgColor: 'bg-purple-50',
      borderColor: 'border-purple-300',
      handleColor: 'bg-purple-500',
    }
  };

  const config = nodeConfig[data.nodeType as keyof typeof nodeConfig] || nodeConfig.code;

  // 处理节点双击
  const handleDoubleClick = useCallback(() => {
    const event = new CustomEvent('node-edit', { detail: { nodeId: data.nodeId } });
    window.dispatchEvent(event);
  }, [data.nodeId]);

  // 显示执行器类型
  const executorType = data.config?.executor || 'default';

  // 显示日志数量
  const logCount = data.config?.logs?.length || 0;

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

        {/* 执行器类型 */}
        {executorType !== 'default' && (
          <div className="mt-2 pt-2 border-t border-gray-200">
            <div className="flex items-center gap-1">
              <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
              <span className="text-xs text-gray-500">
                {executorType} executor
              </span>
            </div>
          </div>
        )}

        {/* 进度条 */}
        {data.status === 'running' && data.progress && (
          <div className="mt-2">
            <div className="w-full h-1 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${data.progress}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1 text-right">
              {data.progress.toFixed(0)}%
            </p>
          </div>
        )}

        {/* 日志指示器 */}
        {logCount > 0 && (
          <div className="mt-2 pt-2 border-t border-gray-200">
            <div className="flex items-center gap-1">
              <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="text-xs text-gray-500">
                {logCount} log{logCount > 1 ? 's' : ''}
              </span>
            </div>
          </div>
        )}

        {/* 错误指示器 */}
        {data.status === 'error' && data.config?.error && (
          <div className="mt-2 pt-2 border-t border-red-200">
            <div className="flex items-start gap-1">
              <svg className="w-3 h-3 text-red-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span className="text-xs text-red-600 truncate">
                {data.config.error}
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

ExecutionNode.displayName = 'ExecutionNode';