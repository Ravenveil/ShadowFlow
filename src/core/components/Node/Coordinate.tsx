// ============================================================================
// 协调节点组件
// ============================================================================

import React, { memo, useCallback } from 'react';
import { Handle, Position, NodeProps, NodeData } from 'reactflow';
import { useI18n } from '../../i18n';
import { clsx } from 'clsx';

export const CoordinateNode = memo(({ data, selected }: NodeProps<NodeData>) => {
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
    assign: {
      icon: '👤',
      title: 'Assign',
      color: '#3B82F6',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-300',
      handleColor: 'bg-blue-500',
    },
    aggregate: {
      icon: '📊',
      title: 'Aggregate',
      color: '#10B981',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-300',
      handleColor: 'bg-green-500',
    },
    barrier: {
      icon: '⛔',
      title: 'Barrier',
      color: '#8B5CF6',
      bgColor: 'bg-purple-50',
      borderColor: 'border-purple-300',
      handleColor: 'bg-purple-500',
    },
    negotiate: {
      icon: '🤝',
      title: 'Negotiate',
      color: '#F59E0B',
      bgColor: 'bg-amber-50',
      borderColor: 'border-amber-300',
      handleColor: 'bg-amber-500',
    },
    sequence: {
      icon: '📈',
      title: 'Sequence',
      color: '#6366F1',
      bgColor: 'bg-indigo-50',
      borderColor: 'border-indigo-300',
      handleColor: 'bg-indigo-500',
    },
    parallel: {
      icon: '⚡',
      title: 'Parallel',
      color: '#EC4899',
      bgColor: 'bg-pink-50',
      borderColor: 'border-pink-300',
      handleColor: 'bg-pink-500',
    }
  };

  const config = nodeConfig[data.nodeType as keyof typeof nodeConfig] || nodeConfig.assign;

  // 处理节点双击
  const handleDoubleClick = useCallback(() => {
    const event = new CustomEvent('node-edit', { detail: { nodeId: data.nodeId } });
    window.dispatchEvent(event);
  }, [data.nodeId]);

  // 显示分配的目标
  const targets = data.config?.targets || [];

  // 显示等待的节点数
  const pendingNodes = data.config?.pendingNodes || 0;

  // 显示聚合结果数量
  const aggregatedResults = data.config?.results?.length || 0;

  // 显示协商状态
  const negotiationStatus = data.config?.status;

  return (
    <div
      className={clsx(
        'rounded-lg border-2 shadow-sm transition-all cursor-pointer',
        statusColors[data.status || 'idle'],
        statusBgColors[data.status || 'idle'],
        selected && 'ring-2 ring-offset-2 ring-blue-500',
        config.bgColor,
        'min-w-[220px]',
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

        {/* Barrier: 等待状态 */}
        {data.nodeType === 'barrier' && pendingNodes > 0 && (
          <div className="mt-2 pt-2 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-xs text-gray-500">Waiting</span>
              </div>
              <div className="text-xs font-medium text-yellow-600">
                {pendingNodes} nodes
              </div>
            </div>
          </div>
        )}

        {/* Assign: 目标列表 */}
        {targets.length > 0 && (
          <div className="mt-2 pt-2 border-t border-gray-200">
            <div className="flex items-center gap-1 mb-1">
              <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span className="text-xs text-gray-500">Targets</span>
            </div>
            <div className="space-y-1">
              {targets.slice(0, 3).map((target, index) => (
                <div key={index} className="text-xs text-gray-600 truncate">
                  {target}
                </div>
              ))}
              {targets.length > 3 && (
                <div className="text-xs text-gray-400 text-center">
                  +{targets.length - 3} more
                </div>
              )}
            </div>
          </div>
        )}

        {/* Aggregate: 结果统计 */}
        {aggregatedResults > 0 && (
          <div className="mt-2 pt-2 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                </svg>
                <span className="text-xs text-gray-500">Results</span>
              </div>
              <div className="text-xs font-medium text-green-600">
                {aggregatedResults}
              </div>
            </div>
          </div>
        )}

        {/* Negotiate: 协商状态 */}
        {negotiationStatus && (
          <div className="mt-2 pt-2 border-t border-gray-200">
            <div className="flex items-center gap-1">
              <div
                className={clsx(
                  'w-2 h-2 rounded-full',
                  negotiationStatus === 'in-progress' && 'bg-blue-500 animate-pulse',
                  negotiationStatus === 'agreed' && 'bg-green-500',
                  negotiationStatus === 'disagreed' && 'bg-red-500',
                  negotiationStatus === 'timeout' && 'bg-yellow-500'
                )}
              />
              <span className="text-xs text-gray-500 capitalize">
                {negotiationStatus.replace('-', ' ')}
              </span>
            </div>
          </div>
        )}

        {/* Sequence: 步骤指示器 */}
        {data.nodeType === 'sequence' && data.config?.step && (
          <div className="mt-2 pt-2 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <span className="text-xs text-gray-500">Step</span>
              </div>
              <div className="text-xs font-medium">
                {data.config.step}
              </div>
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

CoordinateNode.displayName = 'CoordinateNode';