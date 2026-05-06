// ============================================================================
// 节点右键菜单组件
// ============================================================================

import React, { useEffect, useRef } from 'react';
import { useI18n } from '../../../common/i18n';
import { useWorkflowActions } from '../../hooks/useWorkflow';
import { clsx } from 'clsx';

interface NodeContextMenuProps {
  nodeId: string;
  position: { x: number; y: number };
  onClose: () => void;
}

export function NodeContextMenu({ nodeId, position, onClose }: NodeContextMenuProps) {
  const { t } = useI18n();
  const workflow = useWorkflowActions();
  const menuRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // 处理菜单项点击
  const handleMenuItemClick = (action: string) => {
    switch (action) {
      case 'edit':
        const event = new CustomEvent('node-edit', { detail: { nodeId } });
        window.dispatchEvent(event);
        break;
      case 'duplicate':
        workflow.duplicateNode(nodeId);
        break;
      case 'delete':
        workflow.deleteNode(nodeId);
        break;
      case 'copy':
        // 复制节点配置到剪贴板
        const node = workflow.nodes.find(n => n.id === nodeId);
        if (node) {
          navigator.clipboard.writeText(JSON.stringify(node.data, null, 2));
        }
        break;
      case 'paste':
        // 从剪贴板粘贴配置
        navigator.clipboard.readText().then(text => {
          try {
            const config = JSON.parse(text);
            workflow.updateNode(nodeId, { config });
          } catch (e) {
            console.error('Failed to paste config:', e);
          }
        });
        break;
    }
    onClose();
  };

  // 获取节点信息
  const node = workflow.nodes.find(n => n.id === nodeId);
  const nodeType = node?.data.nodeType || 'unknown';

  return (
    <div
      ref={menuRef}
      className="absolute z-50 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[180px]"
      style={{
        left: position.x,
        top: position.y,
      }}
    >
      {/* 节点信息 */}
      <div className="px-3 py-2 border-b border-gray-200">
        <p className="text-sm font-medium text-gray-900 truncate">
          {node?.data.name.en}
        </p>
        <p className="text-xs text-gray-500">
          {nodeType}
        </p>
      </div>

      {/* 菜单项 */}
      <button
        onClick={() => handleMenuItemClick('edit')}
        className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
        {t('common.edit')}
      </button>

      <button
        onClick={() => handleMenuItemClick('duplicate')}
        className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
        {t('common.duplicate')}
      </button>

      <div className="border-t border-gray-200 my-1" />

      <button
        onClick={() => handleMenuItemClick('copy')}
        className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
        {t('common.copy')}
      </button>

      <button
        onClick={() => handleMenuItemClick('paste')}
        className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        Paste
      </button>

      <div className="border-t border-gray-200 my-1" />

      <button
        onClick={() => handleMenuItemClick('delete')}
        className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
        {t('common.delete')}
      </button>
    </div>
  );
}