/**
 * WorkspaceSelector — inline single-row dropdown for the TopBar.
 * Replaces the old separate WorkspaceStrip row.
 */
import { useEffect, useRef, useState } from 'react';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { CreateWorkspaceModal } from './CreateWorkspaceModal';
import type { WorkspaceSummary } from '../../api/workspaces';

export function WorkspaceSelector() {
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const currentId  = useWorkspaceStore((s) => s.currentId);
  const switchTo   = useWorkspaceStore((s) => s.switchTo);
  const fetchWs    = useWorkspaceStore((s) => s.fetchWorkspaces);

  const [open, setOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (workspaces.length === 0) fetchWs().catch(() => {});
  }, [workspaces.length, fetchWs]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const current = workspaces.find((w) => w.workspace_id === currentId) ?? workspaces[0];
  const color   = current?.color || 'var(--t-accent)';
  const init    = current ? (Array.from(current.name)[0] ?? '?') : '?';

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <div
        data-testid="org-switcher-trigger"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 9,
          padding: '7px 9px 7px 7px', borderRadius: 8,
          background: 'var(--t-panel-2)', border: '1px solid var(--t-border)',
          cursor: 'pointer', transition: 'border-color 120ms',
        }}
      >
        <span style={{
          width: 30, height: 30, borderRadius: 7,
          background: `color-mix(in oklab, ${color} 22%, var(--t-panel-2))`,
          border: `1px solid color-mix(in oklab, ${color} 50%, transparent)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 900, fontSize: init.length > 1 ? 10.5 : 13,
          color: color, letterSpacing: '-0.04em', flexShrink: 0,
        }}>{init}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--t-fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {current?.name ?? '—'}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--t-fg-4)', marginTop: 1 }}>
            {current ? `${current.agent_count} agents · ${current.team_count} teams` : ''}
          </div>
        </div>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--t-fg-3)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 120ms', flexShrink: 0 }}>▾</span>
      </div>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0,
          minWidth: 200, background: 'var(--t-panel)',
          border: '1px solid var(--t-border)', borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,.18)',
          zIndex: 200, padding: '6px',
          display: 'flex', flexDirection: 'column', gap: 2,
        }}>
          {workspaces.map((ws: WorkspaceSummary) => {
            const on = ws.workspace_id === currentId;
            const c  = ws.color || 'var(--t-accent)';
            const i  = Array.from(ws.name)[0] ?? '?';
            return (
              <button
                key={ws.workspace_id}
                type="button"
                onClick={() => { switchTo(ws.workspace_id); setOpen(false); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 8px', borderRadius: 7, cursor: 'pointer',
                  border: on ? `1px solid color-mix(in oklab, ${c} 40%, transparent)` : '1px solid transparent',
                  background: on ? `color-mix(in oklab, ${c} 12%, var(--t-panel))` : 'transparent',
                  width: '100%', textAlign: 'left', transition: 'all 100ms ease',
                }}
              >
                <div style={{
                  width: 20, height: 20, borderRadius: 5,
                  background: c, color: '#0A0A0A',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 900, fontSize: 10, flexShrink: 0,
                }}>{i}</div>
                <span style={{
                  fontSize: 12, fontWeight: on ? 700 : 500,
                  color: on ? c : 'var(--t-fg-2)', whiteSpace: 'nowrap',
                }}>{ws.name}</span>
              </button>
            );
          })}

          <div style={{ borderTop: '1px solid var(--t-border)', marginTop: 2, paddingTop: 4 }}>
            <button
              type="button"
              onClick={() => { setOpen(false); setShowCreate(true); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 8px', borderRadius: 7, cursor: 'pointer',
                border: '1px solid transparent', background: 'transparent',
                width: '100%', textAlign: 'left', color: 'var(--t-fg-4)', fontSize: 12,
              }}
            >
              <span style={{
                width: 20, height: 20, borderRadius: 5,
                border: '1.5px dashed var(--t-border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, flexShrink: 0, color: 'var(--t-fg-5)',
              }}>+</span>
              新建 Workspace
            </button>
          </div>
        </div>
      )}

      {showCreate && (
        <CreateWorkspaceModal
          onClose={() => setShowCreate(false)}
          onCreated={(ws) => {
            void fetchWs();
            switchTo(ws.workspace_id);
            setShowCreate(false);
          }}
        />
      )}
    </div>
  );
}

/** @deprecated use WorkspaceSelector instead */
export { WorkspaceSelector as WorkspaceStrip };
