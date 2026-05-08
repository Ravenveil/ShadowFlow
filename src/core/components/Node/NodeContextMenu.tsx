// ============================================================================
// 节点右键菜单组件
// ============================================================================

import React, { useEffect, useRef } from 'react';
import { useI18n } from '../../../common/i18n';
import { useWorkflowActions } from '../../hooks/useWorkflow';

interface NodeContextMenuProps {
  nodeId: string;
  position: { x: number; y: number };
  onClose: () => void;
}

const menuStyle: React.CSSProperties = {
  position: 'absolute',
  zIndex: 50,
  background: 'var(--t-panel-2)',
  borderRadius: 10,
  boxShadow: '0 8px 32px rgba(0,0,0,.45)',
  border: '1px solid var(--t-border)',
  padding: '4px 0',
  minWidth: 180,
};

const headerStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderBottom: '1px solid var(--t-border)',
};

const itemStyle: React.CSSProperties = {
  width: '100%',
  padding: '7px 12px',
  textAlign: 'left',
  fontSize: 13,
  color: 'var(--t-fg-2)',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  transition: 'background 80ms',
};

const dividerStyle: React.CSSProperties = {
  height: 1,
  background: 'var(--t-border)',
  margin: '4px 0',
};

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
      case 'edit': {
        const event = new CustomEvent('node-edit', { detail: { nodeId } });
        window.dispatchEvent(event);
        break;
      }
      case 'duplicate':
        workflow.duplicateNode(nodeId);
        break;
      case 'delete':
        workflow.deleteNode(nodeId);
        break;
      case 'copy': {
        const node = workflow.nodes.find(n => n.id === nodeId);
        if (node) {
          navigator.clipboard.writeText(JSON.stringify(node.data, null, 2));
        }
        break;
      }
      case 'paste':
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

  const node = workflow.nodes.find(n => n.id === nodeId);
  const nodeType = node?.data.nodeType || 'unknown';

  const EditIcon = () => (
    <svg width={14} height={14} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  );

  const DuplicateIcon = () => (
    <svg width={14} height={14} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  );

  const PasteIcon = () => (
    <svg width={14} height={14} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  );

  const DeleteIcon = () => (
    <svg width={14} height={14} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );

  return (
    <div
      ref={menuRef}
      style={{ ...menuStyle, left: position.x, top: position.y }}
    >
      {/* 节点信息 */}
      <div style={headerStyle}>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--t-fg)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {node?.data.name?.en ?? nodeId}
        </p>
        <p style={{ fontSize: 11, color: 'var(--t-fg-4)', fontFamily: 'var(--font-mono)', margin: '2px 0 0' }}>
          {nodeType}
        </p>
      </div>

      {/* 菜单项 */}
      <button
        onClick={() => handleMenuItemClick('edit')}
        style={itemStyle}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--t-panel-3)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
      >
        <EditIcon />
        {t('common.edit')}
      </button>

      <button
        onClick={() => handleMenuItemClick('duplicate')}
        style={itemStyle}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--t-panel-3)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
      >
        <DuplicateIcon />
        {t('common.duplicate')}
      </button>

      <div style={dividerStyle} />

      <button
        onClick={() => handleMenuItemClick('copy')}
        style={itemStyle}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--t-panel-3)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
      >
        <DuplicateIcon />
        {t('common.copy')}
      </button>

      <button
        onClick={() => handleMenuItemClick('paste')}
        style={itemStyle}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--t-panel-3)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
      >
        <PasteIcon />
        Paste
      </button>

      <div style={dividerStyle} />

      <button
        onClick={() => handleMenuItemClick('delete')}
        style={{ ...itemStyle, color: 'var(--t-err)' }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,.08)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
      >
        <DeleteIcon />
        {t('common.delete')}
      </button>
    </div>
  );
}
