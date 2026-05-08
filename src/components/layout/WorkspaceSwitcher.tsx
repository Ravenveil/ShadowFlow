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
        className="flex items-center gap-2 rounded-lg px-3 py-1.5 hover:bg-white/5 focus:outline-none"
        data-testid="workspace-switcher-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {/* Color dot */}
        <span
          className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
          style={{ background: current?.color ?? '#6366f1' }}
        />
        <span className="max-w-[140px] truncate text-[13px] font-medium text-white/85">
          {current?.name ?? '…'}
        </span>
        <span
          className={`text-[9px] text-white/40 transition-transform ${open ? 'rotate-180' : ''}`}
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
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] hover:bg-white/5 ${
                  ws.workspace_id === currentId ? 'text-white/90' : 'text-white/50'
                }`}
                data-testid={`ws-option-${ws.workspace_id}`}
              >
                <span
                  className="h-2 w-2 flex-shrink-0 rounded-full"
                  style={{ background: ws.color }}
                />
                <span className="flex-1 truncate">{ws.name}</span>
                <span className="text-[10px] text-white/30">
                  {ws.agent_count}A · {ws.team_count}T
                </span>
                {ws.workspace_id === currentId && (
                  <span className="text-[10px] text-white/60">✓</span>
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
              className="flex w-full items-center gap-2 px-3 py-1.5 text-[12px] text-white/40 hover:bg-white/5 hover:text-white/70"
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
