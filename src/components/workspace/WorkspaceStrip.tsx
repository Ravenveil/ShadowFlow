/**
 * WorkspaceStrip — single-row dropdown workspace selector.
 * Shows current workspace; click to open list and switch.
 */
import { useEffect, useRef, useState } from 'react';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { CreateWorkspaceModal } from './CreateWorkspaceModal';
import type { WorkspaceSummary } from '../../api/workspaces';

export function WorkspaceStrip() {
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
    <div
      ref={ref}
      style={{
        position: 'relative',
        padding: '6px 18px',
        borderBottom: '1px solid var(--t-border)',
        background: 'var(--t-panel)',
        flexShrink: 0,
      }}
    >
      {/* Trigger button — single row */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '5px 10px',
          borderRadius: 8,
          border: `1px solid color-mix(in oklab, ${color} 35%, var(--t-border))`,
          background: `color-mix(in oklab, ${color} 10%, var(--t-panel))`,
          cursor: 'pointer',
          minWidth: 160,
          transition: 'all 120ms ease',
        }}
      >
        <div style={{
          width: 22, height: 22, borderRadius: 6,
          background: color, color: '#0A0A0A',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 900, fontSize: 11, flexShrink: 0,
        }}>{init}</div>
        <span style={{
          fontSize: 13, fontWeight: 600, color: 'var(--t-fg)',
          whiteSpace: 'nowrap', flex: 1, textAlign: 'left',
        }}>
          {current?.name ?? '—'}
        </span>
        <svg
          width="12" height="12" viewBox="0 0 12 12" fill="none"
          stroke="var(--t-fg-4)" strokeWidth="1.8" strokeLinecap="round"
          style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms ease' }}
        >
          <polyline points="2,4 6,8 10,4" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% - 2px)',
          left: 18,
          minWidth: 220,
          background: 'var(--t-panel)',
          border: '1px solid var(--t-border)',
          borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,.18)',
          zIndex: 200,
          padding: '6px',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}>
          {workspaces.map((ws: WorkspaceSummary) => {
            const on    = ws.workspace_id === currentId;
            const c     = ws.color || 'var(--t-accent)';
            const i     = Array.from(ws.name)[0] ?? '?';
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
                  transition: 'all 100ms ease',
                  width: '100%', textAlign: 'left',
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
                  color: on ? c : 'var(--t-fg-2)',
                  whiteSpace: 'nowrap',
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
                width: '100%', textAlign: 'left',
                color: 'var(--t-fg-4)', fontSize: 12,
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
