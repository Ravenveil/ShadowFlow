/**
 * WorkspaceStrip — universal horizontal workspace switcher.
 * Renders at the top of every page via HfLayout.
 * Replaces the per-topbar WorkspaceCrumb for all pages.
 */
import { useEffect, useState } from 'react';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { CreateWorkspaceModal } from './CreateWorkspaceModal';
import type { WorkspaceSummary } from '../../api/workspaces';

export function WorkspaceStrip() {
  const workspaces   = useWorkspaceStore((s) => s.workspaces);
  const currentId    = useWorkspaceStore((s) => s.currentId);
  const switchTo     = useWorkspaceStore((s) => s.switchTo);
  const fetchWs      = useWorkspaceStore((s) => s.fetchWorkspaces);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    if (workspaces.length === 0) fetchWs().catch(() => {});
  }, [workspaces.length, fetchWs]);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '8px 22px',
        borderBottom: '1px solid var(--t-border)',
        background: 'var(--t-panel)',
        overflowX: 'auto',
        flexShrink: 0,
      }}
    >
      {workspaces.map((ws: WorkspaceSummary) => {
        const on    = ws.workspace_id === currentId;
        const color = ws.color || 'var(--t-accent)';
        const init  = Array.from(ws.name)[0] ?? '?';
        return (
          <button
            key={ws.workspace_id}
            type="button"
            onClick={() => switchTo(ws.workspace_id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '5px 11px', borderRadius: 8, cursor: 'pointer',
              border: on
                ? `1px solid color-mix(in oklab, ${color} 45%, transparent)`
                : '1px solid var(--t-border)',
              background: on
                ? `color-mix(in oklab, ${color} 12%, var(--t-panel))`
                : 'transparent',
              boxShadow: on
                ? `0 0 0 3px color-mix(in oklab, ${color} 14%, transparent)`
                : 'none',
              transition: 'all 120ms ease',
              flexShrink: 0,
            }}
          >
            <div
              style={{
                width: 18, height: 18, borderRadius: 5,
                background: color, color: '#0A0A0A',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 900, fontSize: 10, flexShrink: 0,
              }}
            >{init}</div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1 }}>
              <span style={{
                fontSize: 12, fontWeight: on ? 700 : 500, lineHeight: 1.2,
                color: on ? color : 'var(--t-fg-2)',
                whiteSpace: 'nowrap',
              }}>{ws.name}</span>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 9.5, lineHeight: 1.2,
                color: 'var(--t-fg-5)', whiteSpace: 'nowrap',
              }}>{ws.agent_count} agents · {ws.team_count} teams</span>
            </div>
          </button>
        );
      })}

      <button
        type="button"
        title="新建 Workspace"
        onClick={() => setShowCreate(true)}
        style={{
          width: 28, height: 28, borderRadius: 8, flexShrink: 0,
          border: '1.5px dashed var(--t-border)', background: 'transparent',
          color: 'var(--t-fg-5)', fontSize: 16, fontWeight: 300,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
        }}
      >+</button>

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
