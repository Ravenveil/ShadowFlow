// ============================================================================
// 基础节点组件 - 已被专门的节点组件替代，保留用于向后兼容
// ============================================================================

import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { NodeData } from '../../types';
import { useI18n } from '../../i18n';
import { clsx } from 'clsx';

export const BaseNode = memo(({ data, selected }: NodeProps<NodeData>) => {
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

  return (
    <div
      className={clsx(
        'rounded-lg border-2 shadow-sm transition-all',
        statusColors[data.status || 'idle'],
        statusBgColors[data.status || 'idle'],
        selected && 'ring-2 ring-offset-2 ring-blue-500',
        'min-w-[200px]'
      )}
      style={{
        borderColor: selected ? undefined : data.color,
        backgroundColor: `${data.color}10`,
      }}
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
            input.required ? '!border-red-500' : '!border-gray-400'
          )}
          style={{
            left: `${((index + 1) / (data.inputs.length || 1)) * 100}%`,
            transform: 'translateX(-50%)',
            backgroundColor: data.accentColor || data.color,
          }}
        />
      ))}

      {/* 节点内容 */}
      <div className="p-3">
        {/* 图标和标题 */}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-lg" role="img" aria-label="icon">
            {data.icon}
          </span>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm truncate">
              {data.name[language]}
            </h3>
            <p className="text-xs text-gray-500 truncate">
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
                data.status === 'running' && 'animate-bounce',
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

        {/* 输入端口标签 */}
        {data.inputs.length > 0 && (
          <div className="mt-2 pt-2 border-t border-gray-200">
            <p className="text-xs font-medium text-gray-600 mb-1">
              {t('config.inputs')}
            </p>
            <div className="space-y-1">
              {data.inputs.map(input => (
                <div
                  key={input.name}
                  className="flex items-center gap-1 text-xs"
                >
                  <span
                    className={clsx(
                      'w-1.5 h-1.5 rounded-full',
                      input.required ? 'bg-red-500' : 'bg-gray-400'
                    )}
                  />
                  <span className="truncate">{input.name}</span>
                  <span className="text-gray-400 ml-auto">{input.type}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 输出端口标签 */}
        {data.outputs.length > 0 && (
          <div className="mt-2 pt-2 border-t border-gray-200">
            <p className="text-xs font-medium text-gray-600 mb-1">
              {t('config.outputs')}
            </p>
            <div className="space-y-1">
              {data.outputs.map(output => (
                <div
                  key={output.name}
                  className="flex items-center gap-1 text-xs"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                  <span className="truncate">{output.name}</span>
                  <span className="text-gray-400 ml-auto">{output.type}</span>
                </div>
              ))}
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
          className="w-3 h-3 !border-2 !border-gray-400"
          style={{
            left: `${((index + 1) / (data.outputs.length || 1)) * 100}%`,
            transform: 'translateX(-50%)',
            backgroundColor: data.accentColor || data.color,
          }}
        />
      ))}
    </div>
  );
});

BaseNode.displayName = 'BaseNode';
