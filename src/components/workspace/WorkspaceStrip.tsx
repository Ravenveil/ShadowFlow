/**
 * WorkspaceSelector — sidebar workspace switcher (DingTalk-style).
 * Replaces the old separate WorkspaceStrip row.
 *
 * Props:
 *   collapsed — sidebar is in icon-only mode; show monogram only,
 *               dropdown opens via portal to the right of the icon.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { CreateWorkspaceModal } from './CreateWorkspaceModal';
import type { WorkspaceSummary } from '../../api/workspaces';

interface WorkspaceSelectorProps {
  collapsed?: boolean;
}

export function WorkspaceSelector({ collapsed }: WorkspaceSelectorProps) {
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const currentId  = useWorkspaceStore((s) => s.currentId);
  const switchTo   = useWorkspaceStore((s) => s.switchTo);
  const fetchWs    = useWorkspaceStore((s) => s.fetchWorkspaces);

  const [open, setOpen]           = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  const wrapRef    = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropRef    = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (workspaces.length === 0) fetchWs().catch(() => {});
  }, [workspaces.length, fetchWs]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (!wrapRef.current?.contains(t) && !dropRef.current?.contains(t)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const getInit = (name: string) => {
    const a = Array.from(name);
    return a.length >= 2 ? a[0] + a[1] : (a[0] ?? '?');
  };
  const current = workspaces.find((w) => w.workspace_id === currentId) ?? workspaces[0];
  const color   = current?.color || 'var(--t-accent)';
  const init    = current ? getInit(current.name) : 'Sh';

  function handleClick() {
    if (collapsed && triggerRef.current) {
      setAnchorRect(triggerRef.current.getBoundingClientRect());
    }
    setOpen((v) => !v);
  }

  // ── Dropdown content (shared between portal and inline) ─────────────────────
  const dropdownContent = (
    <div
      ref={dropRef}
      style={{
        ...(collapsed && anchorRect
          ? { position: 'fixed', top: anchorRect.top, left: anchorRect.right + 8 }
          : { position: 'absolute', top: 'calc(100% + 6px)', left: 0 }),
        minWidth: 220, background: 'var(--t-panel)',
        border: '1px solid var(--t-border)', borderRadius: 10,
        boxShadow: '0 8px 24px rgba(0,0,0,.18)',
        zIndex: 9999, padding: '6px',
        display: 'flex', flexDirection: 'column', gap: 2,
      }}
    >
      {workspaces.map((ws: WorkspaceSummary) => {
        const on = ws.workspace_id === currentId;
        const c  = ws.color || 'var(--t-accent)';
        const i  = getInit(ws.name);
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
            <span style={{
              width: 30, height: 30, borderRadius: 7,
              background: `color-mix(in oklab, ${c} 18%, var(--t-panel-2))`,
              border: `1px solid color-mix(in oklab, ${c} 45%, transparent)`,
              color: c, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 900, fontSize: i.length > 1 ? 10.5 : 12.5,
              letterSpacing: '-0.03em', flexShrink: 0,
            }}>{i}</span>
            <span style={{ fontSize: 12, fontWeight: on ? 700 : 500, color: on ? c : 'var(--t-fg-2)', whiteSpace: 'nowrap' }}>
              {ws.name}
            </span>
          </button>
        );
      })}

      {/* Fallback row when no workspaces loaded */}
      {workspaces.length === 0 && (
        <div style={{ padding: '8px 10px', fontSize: 12, color: 'var(--t-fg-4)', fontFamily: 'var(--font-mono)' }}>
          ShadowFlow · Default
        </div>
      )}

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
  );

  // ── Collapsed: icon-only, dropdown opens via portal to the right ─────────────
  if (collapsed) {
    return (
      <div ref={wrapRef} style={{ position: 'relative' }}>
        <div
          ref={triggerRef}
          data-testid="org-switcher-trigger"
          onClick={handleClick}
          title={current?.name ?? 'ShadowFlow'}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: '3px 0' }}
        >
          <span style={{
            width: 28, height: 28, borderRadius: 7, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 900, fontSize: init.length > 1 ? 10 : 13,
            background: `color-mix(in oklab, ${color} 22%, var(--t-panel-2))`,
            border: `1px solid color-mix(in oklab, ${color} 50%, transparent)`,
            color: color, letterSpacing: '-0.03em',
          }}>{init}</span>
        </div>
        {open && createPortal(dropdownContent, document.body)}
        {showCreate && (
          <CreateWorkspaceModal
            onClose={() => setShowCreate(false)}
            onCreated={(ws) => { void fetchWs(); switchTo(ws.workspace_id); setShowCreate(false); }}
          />
        )}
      </div>
    );
  }

  // ── Expanded: full card, dropdown inline (sidebar is wide enough) ────────────
  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%' }}>
      <div
        ref={triggerRef}
        data-testid="org-switcher-trigger"
        onClick={handleClick}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 9px', borderRadius: 8,
          background: 'var(--t-panel-2)', border: '1px solid var(--t-border)',
          cursor: 'pointer', width: '100%',
        }}
      >
        <span style={{
          width: 28, height: 28, borderRadius: 7, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 900, fontSize: init.length > 1 ? 10 : 13,
          background: `color-mix(in oklab, ${color} 22%, var(--t-panel-2))`,
          border: `1px solid color-mix(in oklab, ${color} 50%, transparent)`,
          color: color, letterSpacing: '-0.03em',
        }}>{init}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--t-fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {current?.name ?? 'ShadowFlow'}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--t-fg-4)', marginTop: 1 }}>
            {current ? `${current.agent_count} agents · ${current.team_count} teams` : 'Workspace'}
          </div>
        </div>
        <ChevronDown size={13} strokeWidth={2} style={{ color: 'var(--t-fg-4)', flexShrink: 0, transition: 'transform 150ms', transform: open ? 'rotate(180deg)' : 'none' }} />
      </div>

      {open && dropdownContent}

      {showCreate && (
        <CreateWorkspaceModal
          onClose={() => setShowCreate(false)}
          onCreated={(ws) => { void fetchWs(); switchTo(ws.workspace_id); setShowCreate(false); }}
        />
      )}
    </div>
  );
}

/** @deprecated use WorkspaceSelector instead */
export { WorkspaceSelector as WorkspaceStrip };
