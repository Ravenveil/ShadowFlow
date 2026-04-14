// ============================================================================
// 输入节点组件
// ============================================================================

import React, { memo, useCallback } from 'react';
import { Handle, Position, NodeProps, NodeData } from 'reactflow';
import { useI18n } from '../../i18n';
import { clsx } from 'clsx';

export const InputNode = memo(({ data, selected }: NodeProps<NodeData>) => {
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
    input: {
      icon: '📥',
      title: 'Input',
      color: '#10B981',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-300',
      handleColor: 'bg-green-500',
    },
    understand: {
      icon: '🧠',
      title: 'Understand',
      color: '#8B5CF6',
      bgColor: 'bg-purple-50',
      borderColor: 'border-purple-300',
      handleColor: 'bg-purple-500',
    },
    clarify: {
      icon: '❓',
      title: 'Clarify',
      color: '#F59E0B',
      bgColor: 'bg-amber-50',
      borderColor: 'border-amber-300',
      handleColor: 'bg-amber-500',
    }
  };

  const config = nodeConfig[data.nodeType as keyof typeof nodeConfig] || nodeConfig.input;

  // 处理节点双击
  const handleDoubleClick = useCallback(() => {
    // 触发节点编辑
    const event = new CustomEvent('node-edit', { detail: { nodeId: data.nodeId } });
    window.dispatchEvent(event);
  }, [data.nodeId]);

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

        {/* 运行进度条 */}
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

        {/* 节点配置指示器 */}
        {Object.keys(data.config || {}).length > 0 && (
          <div className="mt-2 pt-2 border-t border-gray-200">
            <div className="flex items-center gap-1">
              <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="text-xs text-gray-500">
                {Object.keys(data.config || {}).length} properties
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

InputNode.displayName = 'InputNode';