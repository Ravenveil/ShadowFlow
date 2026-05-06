// ============================================================================
// 输出节点组件
// ============================================================================

import React, { memo, useCallback } from 'react';
import { Handle, Position, NodeProps, NodeData } from 'reactflow';
import { useI18n } from '../../../common/i18n';
import { clsx } from 'clsx';

export const OutputNode = memo(({ data, selected }: NodeProps<NodeData>) => {
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
    report: {
      icon: '📄',
      title: 'Report',
      color: '#3B82F6',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-300',
      handleColor: 'bg-blue-500',
    },
    store: {
      icon: '💾',
      title: 'Store',
      color: '#10B981',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-300',
      handleColor: 'bg-green-500',
    },
    notify: {
      icon: '🔔',
      title: 'Notify',
      color: '#F59E0B',
      bgColor: 'bg-amber-50',
      borderColor: 'border-amber-300',
      handleColor: 'bg-amber-500',
    }
  };

  const config = nodeConfig[data.nodeType as keyof typeof nodeConfig] || nodeConfig.report;

  // 处理节点双击
  const handleDoubleClick = useCallback(() => {
    const event = new CustomEvent('node-edit', { detail: { nodeId: data.nodeId } });
    window.dispatchEvent(event);
  }, [data.nodeId]);

  // 显示输出格式
  const outputFormat = data.config?.format || 'json';

  // 显示文件大小
  const fileSize = data.config?.size;

  // 显示通知状态
  const notificationStatus = data.config?.status;

  // 显示存储位置
  const storageLocation = data.config?.location;

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

        {/* 输出格式 */}
        {outputFormat && (
          <div className="mt-2 pt-2 border-t border-gray-200">
            <div className="flex items-center gap-1">
              <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              <span className="text-xs text-gray-500">
                Format: {outputFormat}
              </span>
            </div>
          </div>
        )}

        {/* 文件大小 */}
        {fileSize && (
          <div className="mt-1 pt-1 border-t border-gray-100">
            <div className="flex items-center gap-1">
              <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
              </svg>
              <span className="text-xs text-gray-500">
                {fileSize}
              </span>
            </div>
          </div>
        )}

        {/* 通知状态 */}
        {notificationStatus && (
          <div className="mt-2 pt-2 border-t border-gray-200">
            <div className="flex items-center gap-1">
              <div
                className={clsx(
                  'w-2 h-2 rounded-full',
                  notificationStatus === 'sent' && 'bg-green-500',
                  notificationStatus === 'pending' && 'bg-yellow-500 animate-pulse',
                  notificationStatus === 'failed' && 'bg-red-500'
                )}
              />
              <span className="text-xs text-gray-500 capitalize">
                {notificationStatus}
              </span>
            </div>
          </div>
        )}

        {/* 存储位置 */}
        {storageLocation && (
          <div className="mt-2 pt-2 border-t border-gray-200">
            <div className="flex items-center gap-1">
              <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="text-xs text-gray-500 truncate">
                {storageLocation}
              </span>
            </div>
          </div>
        )}

        {/* 完成度指示器 */}
        {data.status === 'success' && (
          <div className="mt-2 pt-2 border-t border-green-200">
            <div className="flex items-center gap-1">
              <svg className="w-3 h-3 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span className="text-xs text-green-600">Completed</span>
            </div>
          </div>
        )}

        {/* 输出端口（装饰性，输出节点不需要实际输出端口） */}
        {data.outputs.length > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-4 bg-gradient-to-t from-white to-transparent pointer-events-none" />
        )}
      </div>
    </div>
  );
});

OutputNode.displayName = 'OutputNode';