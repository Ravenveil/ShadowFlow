// ============================================================================
// 配置面板 - 右侧节点属性编辑面板
// ============================================================================

import React, { useState, useEffect } from 'react';
import { useI18n } from '../../../common/i18n';
import { useWorkflowActions } from '../../hooks/useWorkflow';
import { clsx } from 'clsx';

// 端口显示组件
function PortDisplay({
  ports,
  title,
  isInput,
}: {
  ports: any[];
  title: string;
  isInput: boolean;
}) {
  return (
    <div className="mt-3">
      <p className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">
        {title}
      </p>
      {ports.length === 0 ? (
        <p className="text-xs text-gray-400 italic">无</p>
      ) : (
        <div className="space-y-2">
          {ports.map((port, index) => (
            <div
              key={`${isInput ? 'input' : 'output'}-${index}`}
              className="flex items-center justify-between p-2 bg-gray-50 rounded border border-gray-200"
            >
              <div className="flex items-center gap-2">
                <span
                  className={clsx(
                    'w-2 h-2 rounded-full',
                    port.required ? 'bg-red-500' : 'bg-gray-400'
                  )}
                />
                <span className="text-sm font-medium">{port.name}</span>
              </div>
              <span className="text-xs text-gray-500 bg-white px-2 py-0.5 rounded border">
                {port.type}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// 配置字段编辑器
function ConfigFieldEditor({
  key: fieldKey,
  value,
  onChange,
}: {
  key: string;
  value: any;
  onChange: (value: any) => void;
}) {
  const fieldType = typeof value;

  switch (fieldType) {
    case 'boolean':
      return (
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={value}
            onChange={(e) => onChange(e.target.checked)}
            className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
          />
          <span className="text-sm">{value ? '是' : '否'}</span>
        </label>
      );

    case 'number':
      return (
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      );

    case 'string':
      // 检测是否为多行文本
      if (value.length > 50) {
        return (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={4}
            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none font-mono"
          />
        );
      }
      return (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      );

    default:
      // 对象或数组 - 显示 JSON
      try {
        const jsonString = JSON.stringify(value, null, 2);
        return (
          <textarea
            value={jsonString}
            onChange={(e) => {
              try {
                onChange(JSON.parse(e.target.value));
              } catch {
                // 暂不更新，直到有效 JSON
              }
            }}
            rows={6}
            className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none font-mono"
          />
        );
      } catch {
        return (
          <input
            type="text"
            value={String(value)}
            onChange={(e) => onChange(e.target.value)}
            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        );
      }
  }
}

export function ConfigPanel() {
  const { t, language } = useI18n();
  const workflow = useWorkflowActions();

  const selectedNode = workflow.nodes.find(
    n => n.id === workflow.ui.selectedNodeId
  );

  // 处理配置更新
  const handleConfigChange = (key: string, value: any) => {
    if (!selectedNode) return;

    workflow.updateNode(selectedNode.id, {
      data: {
        ...selectedNode.data,
        config: {
          ...selectedNode.data.config,
          [key]: value,
        },
      },
    });
  };

  // 删除节点
  const handleDelete = () => {
    if (selectedNode && window.confirm(t('messages.confirmDelete'))) {
      workflow.deleteNode(selectedNode.id);
    }
  };

  // 复制节点
  const handleDuplicate = () => {
    if (selectedNode) {
      workflow.duplicateNode(selectedNode.id);
    }
  };

  if (!workflow.ui.configPanelOpen) {
    return null;
  }

  return (
    <div className="w-80 bg-white border-l border-gray-200 flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        {selectedNode ? (
          <>
            {/* 头部 */}
            <div className="p-4 border-b border-gray-200 bg-gray-50">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl" role="img">
                  {selectedNode.data.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 truncate">
                    {selectedNode.data.name[language]}
                  </h3>
                  <p className="text-xs text-gray-500">
                    {selectedNode.id}
                  </p>
                </div>
              </div>
              <p className="text-sm text-gray-600 mt-2">
                {selectedNode.data.description[language]}
              </p>

              {/* 状态 */}
              {selectedNode.data.status && selectedNode.data.status !== 'idle' && (
                <div className="mt-3 flex items-center gap-2">
                  <span
                    className={clsx(
                      'w-2 h-2 rounded-full',
                      selectedNode.data.status === 'running' && 'animate-pulse',
                      selectedNode.data.status === 'success' && 'bg-green-500',
                      selectedNode.data.status === 'error' && 'bg-red-500',
                      selectedNode.data.status === 'warning' && 'bg-yellow-500'
                    )}
                  />
                  <span className="text-xs font-medium capitalize">
                    {t(`status.${selectedNode.data.status}`)}
                  </span>
                </div>
              )}
            </div>

            {/* 基本信息 */}
            <div className="p-4 border-b border-gray-200">
              <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-3">
                基本信息
              </h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">节点类型</span>
                  <span className="font-medium">
                    {t(`nodeNames.${selectedNode.data.nodeType}`)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">分类</span>
                  <span className="font-medium">
                    {t(`categories.${selectedNode.data.category}`)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">位置</span>
                  <span className="font-mono text-xs">
                    ({Math.round(selectedNode.position.x)}, {Math.round(selectedNode.position.y)})
                  </span>
                </div>
              </div>
            </div>

            {/* 配置属性 */}
            <div className="p-4 border-b border-gray-200">
              <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-3">
                {t('config.properties')}
              </h4>
              <div className="space-y-3">
                {Object.entries(selectedNode.data.config || {}).map(([key, value]) => (
                  <div key={key}>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      {key}
                    </label>
                    <ConfigFieldEditor
                      key={key}
                      value={value}
                      onChange={(newValue) => handleConfigChange(key, newValue)}
                    />
                  </div>
                ))}

                {Object.keys(selectedNode.data.config || {}).length === 0 && (
                  <p className="text-xs text-gray-400 italic">无配置项</p>
                )}
              </div>
            </div>

            {/* 端口信息 */}
            <div className="p-4 border-b border-gray-200">
              <PortDisplay
                ports={selectedNode.data.inputs}
                title={t('config.inputs')}
                isInput={true}
              />
              <PortDisplay
                ports={selectedNode.data.outputs}
                title={t('config.outputs')}
                isInput={false}
              />
            </div>

            {/* 连接信息 */}
            <div className="p-4">
              <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-3">
                连接
              </h4>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">输入连接</span>
                  <span className="font-medium">
                    {workflow.getInputEdges(selectedNode.id).length}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">输出连接</span>
                  <span className="font-medium">
                    {workflow.getOutputEdges(selectedNode.id).length}
                  </span>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            <svg
              className="w-16 h-16 text-gray-300 mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122"
              />
            </svg>
            <p className="text-gray-600 font-medium mb-1">
              {t('config.noNodeSelected')}
            </p>
            <p className="text-sm text-gray-500">
              点击画布上的节点来编辑其配置
            </p>
          </div>
        )}
      </div>

      {/* 底部操作按钮 */}
      {selectedNode && (
        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <div className="flex gap-2">
            <button
              onClick={handleDuplicate}
              className="flex-1 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors"
            >
              {t('common.duplicate')}
            </button>
            <button
              onClick={handleDelete}
              className="flex-1 px-3 py-2 text-sm font-medium text-red-600 bg-red-50 border border-red-200 rounded hover:bg-red-100 transition-colors"
            >
              {t('common.delete')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
