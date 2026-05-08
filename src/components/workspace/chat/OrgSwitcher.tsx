/**
 * OrgSwitcher — 钉钉风格 Workspace 切换下拉
 *
 * 受控开关 + 点击外部自动关闭。
 * 数据来源：GET /api/workspaces（真实后端，非 mock）
 * 切换时写入 localStorage + 派发 sf:workspace-changed 事件。
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { FBIcons } from '../FBAtoms';
import { AlertTriangle as OrgSwAlert } from '../../../common/icons/iconRegistry';
import { listWorkspaces, createWorkspace, WorkspaceSummary, WorkspaceApiError } from '../../../api/workspaces';

const CURRENT_WS_KEY = 'sf_current_workspace_id';

function getInitial(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

export function OrgSwitcher() {
  const [open, setOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [currentId, setCurrentId] = useState<string>(
    () => localStorage.getItem(CURRENT_WS_KEY) ?? '',
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const fetchWorkspaces = useCallback(async () => {
    setLoadState('loading');
    try {
      const list = await listWorkspaces();
      setWorkspaces(list);
      setLoadState('ok');
      if (list.length > 0) {
        const ids = list.map(w => w.workspace_id);
        if (!ids.includes(currentId)) {
          const firstId = list[0].workspace_id;
          setCurrentId(firstId);
          localStorage.setItem(CURRENT_WS_KEY, firstId);
        }
      }
    } catch {
      setLoadState('error');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { fetchWorkspaces(); }, [fetchWorkspaces]);

  const handleSelect = useCallback((workspaceId: string) => {
    setCurrentId(workspaceId);
    localStorage.setItem(CURRENT_WS_KEY, workspaceId);
    setOpen(false);
    window.dispatchEvent(new CustomEvent('sf:workspace-changed', { detail: { workspaceId } }));
  }, []);

  const handleCreate = async () => {
    const name = createName.trim();
    if (!name) { setCreateError('名称不能为空'); return; }
    setCreating(true);
    setCreateError(null);
    try {
      const ws = await createWorkspace({ name });
      setCreateOpen(false);
      setCreateName('');
      await fetchWorkspaces();
      handleSelect(ws.workspace_id);
    } catch (e) {
      const msg = e instanceof WorkspaceApiError
        ? `${e.code}: ${e.message}`
        : (e instanceof Error ? e.message : '创建失败');
      setCreateError(msg);
    } finally {
      setCreating(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const currentWs: WorkspaceSummary | undefined =
    workspaces.find(w => w.workspace_id === currentId) ?? workspaces[0];

  const triggerColor = currentWs?.color ?? 'var(--accent)';
  const triggerInit = currentWs ? getInitial(currentWs.name) : '…';
  const triggerName = currentWs?.name ?? (loadState === 'loading' ? '加载中…' : '未选 Workspace');
  const triggerSub = currentWs
    ? `${currentWs.agent_count} agents · ${currentWs.team_count} teams`
    : '';

  return (
    <div ref={ref} style={{ position: 'relative', padding: '8px' }}>
      <div
        data-testid="org-switcher-trigger"
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 9,
          padding: '7px 9px 7px 7px', borderRadius: 8,
          background: 'var(--bg-elev-2)', border: '1px solid var(--border)', cursor: 'pointer',
          transition: 'border-color 120ms',
        }}
      >
        <span style={{
          width: 30, height: 30, borderRadius: 7,
          background: `color-mix(in oklab, ${triggerColor} 22%, var(--bg-elev-2))`,
          border: `1px solid color-mix(in oklab, ${triggerColor} 50%, transparent)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 900, fontSize: triggerInit.length > 1 ? 10.5 : 13, color: triggerColor,
          letterSpacing: '-0.04em',
        }}>{triggerInit}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--fg-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {triggerName}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--fg-4)', marginTop: 1 }}>
            {triggerSub}
          </div>
        </div>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-3)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 120ms' }}>▾</span>
      </div>

      {open && (
        <div data-testid="org-switcher-dropdown" style={{
          position: 'absolute', top: 54, left: 8, right: 8, zIndex: 30,
          background: 'var(--skin-panel)', border: '1px solid var(--border)', borderRadius: 10,
          boxShadow: 'var(--shadow-pop)', padding: 5,
        }}>
          {loadState === 'loading' && (
            <div style={{ padding: '12px 10px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-4)', textAlign: 'center' }}>
              加载中…
            </div>
          )}

          {loadState === 'error' && (
            <div style={{ padding: '10px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--status-reject)' }}>
              加载失败
              <button
                onClick={() => { fetchWorkspaces(); }}
                style={{ marginLeft: 8, cursor: 'pointer', color: 'var(--accent-bright)', background: 'none', border: 'none', fontSize: 11, fontFamily: 'var(--font-mono)' }}
              >重试</button>
            </div>
          )}

          {loadState === 'ok' && workspaces.map((ws) => {
            const isCur = ws.workspace_id === currentId;
            const wsColor = ws.color ?? 'var(--accent)';
            const wsInit = getInitial(ws.name);
            return (
              <div
                key={ws.workspace_id}
                data-testid={`org-item-${ws.workspace_id}`}
                onClick={() => handleSelect(ws.workspace_id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 9,
                  padding: '7px 7px', borderRadius: 6,
                  background: isCur ? 'var(--accent-tint)' : 'transparent', cursor: 'pointer',
                }}
              >
                <span style={{
                  width: 30, height: 30, borderRadius: 7,
                  background: `color-mix(in oklab, ${wsColor} 18%, var(--bg-elev-2))`,
                  border: `1px solid color-mix(in oklab, ${wsColor} 45%, transparent)`,
                  color: wsColor,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 900, fontSize: wsInit.length > 1 ? 10.5 : 12.5, letterSpacing: '-0.03em',
                }}>{wsInit}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: isCur ? 700 : 600, color: 'var(--fg-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {ws.name}
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-5)', marginTop: 1 }}>
                    {ws.agent_count} agents · {ws.team_count} teams
                  </div>
                </div>
                {isCur && <span style={{ color: 'var(--accent)', display: 'flex', width: 14, height: 14 }}>{FBIcons.check}</span>}
              </div>
            );
          })}

          <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 4px' }} />

          <div
            data-testid="org-create-row"
            onClick={() => { setOpen(false); setCreateOpen(true); }}
            style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 7px', borderRadius: 6, cursor: 'pointer', transition: 'background 120ms' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-elev-2)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <span style={{
              width: 30, height: 30, borderRadius: 7,
              background: 'var(--bg-elev-2)', border: '1px dashed var(--border-strong)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg-3)',
            }}><span style={{ width: 14, height: 14, display: 'flex' }}>{FBIcons.plus}</span></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg-2)' }}>创建 / 加入 Workspace</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-4)', marginTop: 1 }}>新建工作空间 · POST /api/workspaces</div>
            </div>
          </div>

          <div style={{ padding: '5px 7px 1px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-5)', letterSpacing: '0.04em' }}>⌘ ⇧ O 切换</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-5)' }}>{workspaces.length} workspaces</span>
          </div>
        </div>
      )}

      {createOpen && (
        <div onClick={() => !creating && setCreateOpen(false)} style={{
          position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.55)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            width: 420, background: 'var(--skin-panel)', border: '1px solid var(--border)',
            borderRadius: 10, padding: 20, boxShadow: 'var(--shadow-pop)',
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>创建 Workspace</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--fg-4)', marginBottom: 14 }}>
              新建一个公司 / 实验室 · POST /api/workspaces
            </div>
            <input
              autoFocus
              value={createName}
              onChange={e => { setCreateName(e.target.value); setCreateError(null); }}
              onKeyDown={e => { if (e.key === 'Enter' && !creating) handleCreate(); }}
              placeholder="名称：如「编辑部」"
              disabled={creating}
              style={{
                width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 6,
                border: `1px solid ${createError ? 'var(--status-reject)' : 'var(--border)'}`,
                background: 'var(--bg-elev-2)',
                color: 'var(--fg-1)', fontSize: 12, fontFamily: 'var(--font-mono)', outline: 'none',
              }}
            />
            {createError && (
              <div style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--status-reject)' }}>
                <OrgSwAlert size={11} strokeWidth={2} /> {createError}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
              <button className="fb-btn fb-btn-ghost" onClick={() => setCreateOpen(false)} disabled={creating} style={{ fontSize: 11 }}>取消</button>
              <button className="fb-btn fb-btn-primary" onClick={handleCreate} disabled={creating || !createName.trim()} style={{ fontSize: 11 }}>
                {creating ? '创建中…' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
