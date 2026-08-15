/**
 * WorkspaceSwitcher — Story 12.4
 *
 * Top-left dropdown button for switching between workspaces.
 * Shows current workspace name + color dot. Opens a list on click.
 * "新建 Workspace" triggers CreateWorkspaceModal.
 */

import { useEffect, useRef, useState } from 'react';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { CreateWorkspaceModal } from '../workspace/CreateWorkspaceModal';
import './layout-ui5.css'; // UI5.0 — 令牌化文字/hover（替代 dark-only white/* 类）

export function WorkspaceSwitcher() {
  const { workspaces, currentId, switchTo, fetchWorkspaces } = useWorkspaceStore();
  const [open, setOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const current = workspaces.find((w) => w.workspace_id === currentId);

  // Fetch workspace list once on mount
  useEffect(() => {
    fetchWorkspaces();
  }, [fetchWorkspaces]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="sf5-row-hover flex items-center gap-2 rounded-lg px-3 py-1.5 focus:outline-none"
        data-testid="workspace-switcher-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {/* Color dot */}
        <span
          className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
          style={{ background: current?.color ?? '#1447e6' /* UI5.0 — 默认色收敛为 accent 蓝 */ }}
        />
        <span className="sf5-text max-w-[140px] truncate text-[13px] font-medium">
          {current?.name ?? '…'}
        </span>
        <span
          className={`sf5-text-4 text-[9px] transition-transform ${open ? 'rotate-180' : ''}`}
        >
          ▾
        </span>
      </button>

      {/* Dropdown */}
      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-full z-50 mt-1 w-60 rounded-xl border border-shadowflow-border bg-shadowflow-surface shadow-lg"
        >
          <div className="py-1">
            {workspaces.map((ws) => (
              <button
                key={ws.workspace_id}
                role="option"
                aria-selected={ws.workspace_id === currentId}
                onClick={() => {
                  switchTo(ws.workspace_id);
                  setOpen(false);
                }}
                className={`sf5-row-hover flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] ${
                  ws.workspace_id === currentId ? 'sf5-text' : 'sf5-text-3'
                }`}
                data-testid={`ws-option-${ws.workspace_id}`}
              >
                <span
                  className="h-2 w-2 flex-shrink-0 rounded-full"
                  style={{ background: ws.color }}
                />
                <span className="flex-1 truncate">{ws.name}</span>
                <span className="sf5-text-4 text-[10px]">
                  {ws.agent_count}A · {ws.team_count}T
                </span>
                {ws.workspace_id === currentId && (
                  <span className="sf5-text-2 text-[10px]">✓</span>
                )}
              </button>
            ))}
          </div>

          {/* New workspace */}
          <div className="border-t border-shadowflow-border py-1">
            <button
              onClick={() => {
                setOpen(false);
                setShowCreate(true);
              }}
              className="sf5-row-hover sf5-text-3 flex w-full items-center gap-2 px-3 py-1.5 text-[12px]"
              data-testid="btn-new-workspace"
            >
              <span className="text-[14px] leading-none">+</span>
              新建 Workspace
            </button>
          </div>
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <CreateWorkspaceModal
          onClose={() => setShowCreate(false)}
          onCreated={(ws) => {
            fetchWorkspaces();
            switchTo(ws.workspace_id);
            setShowCreate(false);
          }}
        />
      )}
    </div>
  );
}
