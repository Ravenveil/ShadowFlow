// ============================================================================
// 规划节点组件
// ============================================================================

import React, { memo, useCallback } from 'react';
import { Handle, Position, NodeProps, NodeData } from 'reactflow';
import { useI18n } from '../../i18n';
import { clsx } from 'clsx';

export const PlanningNode = memo(({ data, selected }: NodeProps<NodeData>) => {
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
    analyze: {
      icon: '🔍',
      title: 'Analyze',
      color: '#8B5CF6',
      bgColor: 'bg-purple-50',
      borderColor: 'border-purple-300',
      handleColor: 'bg-purple-500',
    },
    design: {
      icon: '🎨',
      title: 'Design',
      color: '#EC4899',
      bgColor: 'bg-pink-50',
      borderColor: 'border-pink-300',
      handleColor: 'bg-pink-500',
    },
    decompose: {
      icon: '🔪',
      title: 'Decompose',
      color: '#F59E0B',
      bgColor: 'bg-amber-50',
      borderColor: 'border-amber-300',
      handleColor: 'bg-amber-500',
    },
    spec: {
      icon: '📋',
      title: 'Specification',
      color: '#6366F1',
      bgColor: 'bg-indigo-50',
      borderColor: 'border-indigo-300',
      handleColor: 'bg-indigo-500',
    }
  };

  const config = nodeConfig[data.nodeType as keyof typeof nodeConfig] || nodeConfig.analyze;

  // 处理节点双击
  const handleDoubleClick = useCallback(() => {
    const event = new CustomEvent('node-edit', { detail: { nodeId: data.nodeId } });
    window.dispatchEvent(event);
  }, [data.nodeId]);

  // 显示子任务数量
  const subtaskCount = data.config?.subtasks?.length || 0;

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

        {/* 子任务指示器 */}
        {subtaskCount > 0 && (
          <div className="mt-2 pt-2 border-t border-gray-200">
            <div className="flex items-center gap-1">
              <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
              <span className="text-xs text-gray-500">
                {subtaskCount} subtask{subtaskCount > 1 ? 's' : ''}
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

        {/* 里程碑标记 */}
        {data.config?.milestone && (
          <div className="mt-2 pt-2 border-t border-gray-200">
            <div className="flex items-center gap-1">
              <svg className="w-3 h-3 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span className="text-xs text-blue-600">Milestone</span>
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

PlanningNode.displayName = 'PlanningNode';