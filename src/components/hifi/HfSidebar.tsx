/**
 * Hi-Fi v2 Sidebar — 220px left rail.
 *
 * Recreated pixel-faithful from `hf-shared.jsx` HfSidebar in the design
 * handoff bundle. Wires nav items to `react-router-dom` Link and pulls
 * workspace name + agent/team counts from `useWorkspaceStore` when
 * available (falls back to the design's static text otherwise).
 *
 * 2026-05-07 selective upgrade — workspace card now hosts:
 *   1. Click-to-expand workspace switcher dropdown (real switchTo wired)
 *   2. Online member avatar stack (3-5 round chips, +N overflow, hover tooltip)
 *   3. Unread aggregation pulse dot (8x8) — visible only when current ws has unread
 *   4. Recent activity meta line ("最近：10 分钟前 · …" / fallback "暂无活动")
 *   5. "✦ 新建工作区" inline action at the dropdown footer
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { HfDot } from './HfAtoms';
import {
  selectCurrentWorkspace,
  useWorkspaceStore,
} from '../../store/workspaceStore';
import { useInboxStore } from '../../core/store/useInboxStore';
import { useI18n } from '../../common/i18n';

export type HfSidebarActive =
  | 'start'
  | 'chat'
  | 'teams'
  | 'agents'
  | 'templates'
  | 'settings';

interface NavItem {
  k: HfSidebarActive;
  g: string;
  label: string;
  hint: string;
  to: string;
  badge?: number;
}

const buildNavItems = (T: (zh: string, en: string) => string): NavItem[] => [
  { k: 'start',     g: '✦', label: T('开始',   'Start'),     hint: '⌘1', to: '/start' },
  { k: 'chat',      g: '☰', label: T('聊天',   'Chat'),      hint: '⌘2', to: '/chat/default', badge: 3 },
  { k: 'teams',     g: '⊞', label: T('团队',   'Teams'),     hint: '⌘3', to: '/teams' },
  { k: 'agents',    g: '◉', label: T('员工',   'Agents'),    hint: '⌘4', to: '/agents' },
  { k: 'templates', g: '◆', label: T('模板',   'Templates'), hint: '⌘5', to: '/templates' },
];

interface HfSidebarProps {
  active?: HfSidebarActive;
}

function rowStyle(on: boolean): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '7px 12px',
    marginBottom: 1,
    borderRadius: 7,
    cursor: 'pointer',
    position: 'relative',
    background: on ? 'var(--t-accent-tint)' : 'transparent',
    textDecoration: 'none',
    color: 'inherit',
  };
}

const activeBar: CSSProperties = {
  position: 'absolute',
  left: -10,
  top: '50%',
  transform: 'translateY(-50%)',
  width: 3,
  height: 18,
  background: 'var(--t-accent)',
  borderRadius: 2,
};

// ---------------------------------------------------------------------------
// Mock fixtures (TODO: hook into real APIs)
// ---------------------------------------------------------------------------
// TODO: replace with real listAgents() filtered by online presence.
const MOCK_ONLINE_MEMBERS: Array<{ id: string; name: string; glyph: string; color: string }> = [
  { id: 'm1', name: '读读',   glyph: '读', color: 'var(--t-accent)' },
  { id: 'm2', name: '写写',   glyph: '写', color: 'var(--t-ok)' },
  { id: 'm3', name: '审审',   glyph: '审', color: 'var(--t-warn)' },
  { id: 'm4', name: '查查',   glyph: '查', color: 'var(--t-info, var(--t-accent))' },
  { id: 'm5', name: '编编',   glyph: '编', color: 'var(--t-err)' },
  { id: 'm6', name: '跑跑',   glyph: '跑', color: 'var(--t-accent)' },
];

export function HfSidebar({ active = 'start' }: HfSidebarProps) {
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const fetchWorkspaces = useWorkspaceStore((s) => s.fetchWorkspaces);
  const currentId = useWorkspaceStore((s) => s.currentId);
  const switchTo = useWorkspaceStore((s) => s.switchTo);
  const current = useWorkspaceStore(selectCurrentWorkspace);
  const inboxGroups = useInboxStore((s) => s.groups);
  const { language } = useI18n();
  const T = (zh: string, en: string) => (language === 'zh' ? zh : en);
  const NAV_ITEMS = useMemo(() => buildNavItems(T), [language]);

  // ---- Workspace dropdown state ------------------------------------------
  const [wsOpen, setWsOpen] = useState(false);
  const wsCardRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click
  useEffect(() => {
    if (!wsOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (!wsCardRef.current) return;
      if (!wsCardRef.current.contains(e.target as Node)) setWsOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setWsOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [wsOpen]);

  // Lazy-load workspace list once if empty (best-effort; falls back gracefully on failure).
  useEffect(() => {
    if (workspaces.length === 0) {
      fetchWorkspaces().catch(() => {
        /* offline / no backend — fall back to static design text */
      });
    }
  }, [workspaces.length, fetchWorkspaces]);

  const wsName = current?.name ?? T('论文实验室', 'Paper Lab');
  const wsGlyph = useMemo(() => {
    const fallback = language === 'zh' ? '论' : 'P';
    const name = current?.name ?? fallback;
    return Array.from(name)[0] ?? fallback;
  }, [current?.name, language]);
  const agentLabel = T('员工', 'AGENTS');
  const teamLabel = T('团队', 'TEAMS');
  const wsMeta = current
    ? `${current.agent_count} ${agentLabel} · ${current.team_count} ${teamLabel}`
    : `7 ${agentLabel} · 3 ${teamLabel}`;

  // ---- Unread aggregation -------------------------------------------------
  // TODO: scope to currentWorkspaceId once inbox is workspace-aware. For now
  // we sum all groups visible to the inbox store (whichever template was
  // last fetched — falls back to 0 silently if inbox not yet loaded).
  const unreadTotal = useMemo(
    () => inboxGroups.reduce((sum, g) => sum + (g.unreadCount ?? 0), 0),
    [inboxGroups],
  );
  const hasUnread = unreadTotal > 0;

  // ---- Online members (mock) ----------------------------------------------
  // TODO: wire to GET /api/agents?workspace_id=<id>&presence=online once the
  // presence channel exists. Static mock keeps the visual contract testable.
  const onlineMembers = MOCK_ONLINE_MEMBERS;
  const MAX_AVATARS = 4; // shows 4 + overflow chip when >4
  const visibleAvatars = onlineMembers.slice(0, MAX_AVATARS);
  const overflowCount = Math.max(0, onlineMembers.length - MAX_AVATARS);

  // ---- Recent activity (mock) ---------------------------------------------
  // TODO: hook into events stream / SSE topic 'workspace.activity'.
  const recentActivity: { who: string; verb: string; at: string } | null = current
    ? { who: '读读', verb: T('finished review', 'finished review'), at: T('10 分钟前', '10m ago') }
    : null;

  const recentText = recentActivity
    ? `${T('最近', 'Recent')}: ${recentActivity.at} · ${recentActivity.who} ${recentActivity.verb}`
    : T('暂无活动', 'No recent activity');

  // Suppress unused-var warning for currentId (used implicitly via store subscription).
  void currentId;

  // ---- Dropdown handlers --------------------------------------------------
  const handleSwitchWorkspace = (id: string) => {
    switchTo(id);
    setWsOpen(false);
  };
  const handleCreateWorkspace = () => {
    // TODO: open <CreateWorkspaceDialog/> once Story 12.4 dialog is wired.
    // For now, just close — keeps the UI affordance discoverable.
    setWsOpen(false);
  };

  return (
    <aside
      style={{
        width: 220,
        flexShrink: 0,
        background: 'var(--t-panel)',
        borderRight: '1px solid var(--t-border)',
        display: 'flex',
        flexDirection: 'column',
        padding: '12px 10px',
      }}
    >
      {/* Workspace switcher (clickable; expands dropdown) */}
      <div
        ref={wsCardRef}
        style={{ position: 'relative', marginBottom: 12 }}
      >
        <div
          role="button"
          tabIndex={0}
          aria-expanded={wsOpen}
          aria-haspopup="listbox"
          aria-label={T('切换工作区', 'Switch workspace')}
          onClick={() => setWsOpen((o) => !o)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setWsOpen((o) => !o);
            }
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 10px',
            background: 'var(--t-panel-2)',
            border: '1px solid var(--t-border)',
            borderRadius: 10,
            cursor: 'pointer',
            position: 'relative',
            outline: 'none',
            boxShadow: wsOpen ? '0 0 0 1px var(--t-accent)' : 'none',
          }}
        >
          {/* Unread aggregation dot — top-right corner */}
          {hasUnread && (
            <span
              aria-label={T('有未读消息', 'Unread messages')}
              title={`${unreadTotal} ${T('未读', 'unread')}`}
              style={{
                position: 'absolute',
                top: -4,
                right: -4,
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: 'var(--t-accent)',
                border: '1.5px solid var(--t-panel)',
                animation: 'hf-pulse 1.4s ease-in-out infinite',
                zIndex: 1,
              }}
            />
          )}

          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: 7,
              background: 'var(--t-accent)',
              color: 'var(--t-accent-ink)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 900,
              fontSize: 12,
              flexShrink: 0,
            }}
          >
            {wsGlyph}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                fontWeight: 700,
                lineHeight: 1.2,
              }}
            >
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {wsName}
              </span>
              <span
                aria-hidden="true"
                style={{
                  fontSize: 9,
                  color: 'var(--t-fg-4)',
                  transform: wsOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 120ms ease',
                  flexShrink: 0,
                }}
              >
                ▾
              </span>
            </div>
            <div className="hf-meta" style={{ marginTop: 2 }}>
              {wsMeta}
            </div>
            {/* Online member avatar stack — second row, left side */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                marginTop: 6,
              }}
            >
              <div
                aria-label={T('在线成员', 'Online members')}
                style={{ display: 'flex', alignItems: 'center' }}
              >
                {visibleAvatars.map((m, i) => (
                  <span
                    key={m.id}
                    title={m.name}
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      background: `color-mix(in oklab, ${m.color} 22%, var(--t-panel-2))`,
                      border: '1.5px solid var(--t-panel-2)',
                      color: m.color,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 9,
                      fontWeight: 800,
                      marginLeft: i === 0 ? 0 : -6,
                      zIndex: visibleAvatars.length - i,
                      flexShrink: 0,
                    }}
                  >
                    {m.glyph}
                  </span>
                ))}
                {overflowCount > 0 && (
                  <span
                    title={T(`其他 ${overflowCount} 人`, `+${overflowCount} more`)}
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      background: 'var(--t-panel)',
                      border: '1.5px solid var(--t-panel-2)',
                      color: 'var(--t-fg-3)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 8,
                      fontWeight: 700,
                      marginLeft: -6,
                      flexShrink: 0,
                    }}
                  >
                    +{overflowCount}
                  </span>
                )}
              </div>
              <span
                className="hf-meta"
                style={{ fontSize: 9, color: 'var(--t-fg-5)' }}
              >
                {T('在线', 'Online')}
              </span>
            </div>
            {/* Recent activity meta */}
            <div
              className="hf-meta"
              title={recentText}
              style={{
                marginTop: 4,
                fontSize: 9,
                color: 'var(--t-fg-4)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {recentText}
            </div>
          </div>
          <span
            style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--t-fg-5)', alignSelf: 'flex-start', marginTop: 2 }}
          >
            ⌘⇧K
          </span>
        </div>

        {/* Dropdown */}
        {wsOpen && (
          <div
            role="listbox"
            aria-label={T('工作区列表', 'Workspace list')}
            style={{
              position: 'absolute',
              top: 'calc(100% + 4px)',
              left: 0,
              right: 0,
              background: 'var(--t-panel)',
              border: '1px solid var(--t-border)',
              borderRadius: 10,
              boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
              padding: 4,
              zIndex: 30,
              maxHeight: 320,
              overflowY: 'auto',
            }}
          >
            {workspaces.length === 0 && (
              <div
                className="hf-meta"
                style={{ padding: '8px 10px', fontSize: 10, color: 'var(--t-fg-4)' }}
              >
                {T('暂无工作区', 'No workspaces yet')}
              </div>
            )}
            {workspaces.map((w) => {
              const isActive = w.workspace_id === currentId;
              const initial = Array.from(w.name)[0] ?? '?';
              return (
                <div
                  key={w.workspace_id}
                  role="option"
                  aria-selected={isActive}
                  tabIndex={0}
                  onClick={() => handleSwitchWorkspace(w.workspace_id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleSwitchWorkspace(w.workspace_id);
                    }
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 8px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    background: isActive ? 'var(--t-accent-tint)' : 'transparent',
                    outline: 'none',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      (e.currentTarget as HTMLDivElement).style.background = 'var(--t-panel-2)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      (e.currentTarget as HTMLDivElement).style.background = 'transparent';
                    }
                  }}
                >
                  <div
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 6,
                      background: w.color || 'var(--t-accent)',
                      color: 'var(--t-accent-ink)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 800,
                      fontSize: 11,
                      flexShrink: 0,
                    }}
                  >
                    {initial}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 11.5,
                        fontWeight: isActive ? 700 : 500,
                        color: 'var(--t-fg)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {w.name}
                    </div>
                    <div className="hf-meta" style={{ fontSize: 9 }}>
                      {w.agent_count} {agentLabel} · {w.team_count} {teamLabel}
                    </div>
                  </div>
                  {isActive && (
                    <span
                      aria-label={T('当前', 'Active')}
                      style={{ color: 'var(--t-accent)', fontSize: 12, flexShrink: 0 }}
                    >
                      ✓
                    </span>
                  )}
                </div>
              );
            })}
            {/* Divider + create-workspace footer */}
            <div
              style={{
                height: 1,
                background: 'var(--t-border)',
                margin: '4px 4px',
              }}
            />
            <div
              role="button"
              tabIndex={0}
              onClick={handleCreateWorkspace}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleCreateWorkspace();
                }
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '7px 8px',
                borderRadius: 6,
                cursor: 'pointer',
                color: 'var(--t-accent)',
                fontSize: 11.5,
                fontWeight: 600,
                outline: 'none',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.background = 'var(--t-accent-tint)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.background = 'transparent';
              }}
            >
              <span style={{ fontSize: 13, lineHeight: 1 }}>✦</span>
              <span>{T('新建工作区', 'New workspace')}</span>
            </div>
          </div>
        )}
      </div>

      {/* Search */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '7px 10px',
          marginBottom: 14,
          background: 'var(--t-bg)',
          border: '1px solid var(--t-border)',
          borderRadius: 8,
        }}
      >
        <span style={{ color: 'var(--t-fg-4)', fontSize: 11 }}>⌕</span>
        <span style={{ flex: 1, fontSize: 11.5, color: 'var(--t-fg-4)' }}>{T('跳转 / 搜索', 'Jump / Search')}</span>
        <span className="hf-kbd">⌘K</span>
      </div>

      <div className="hf-label" style={{ padding: '2px 12px 6px' }}>
        {T('导航', 'NAVIGATION')}
      </div>

      {NAV_ITEMS.map((it) => {
        const on = it.k === active;
        return (
          <Link key={it.k} to={it.to} style={rowStyle(on)}>
            {on && <span style={activeBar} />}
            <span
              style={{
                width: 18,
                textAlign: 'center',
                fontSize: 13,
                color: on ? 'var(--t-accent)' : 'var(--t-fg-3)',
              }}
            >
              {it.g}
            </span>
            <span
              style={{
                flex: 1,
                fontSize: 12.5,
                fontWeight: on ? 700 : 500,
                color: on ? 'var(--t-fg)' : 'var(--t-fg-2)',
              }}
            >
              {it.label}
            </span>
            {it.badge ? (
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 9,
                  fontWeight: 700,
                  padding: '1px 5px',
                  borderRadius: 3,
                  background: 'var(--t-accent)',
                  color: 'var(--t-accent-ink)',
                }}
              >
                {it.badge}
              </span>
            ) : (
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 9,
                  color: 'var(--t-fg-5)',
                }}
              >
                {it.hint}
              </span>
            )}
          </Link>
        );
      })}

      <div style={{ flex: 1 }} />

      {/* Settings + user */}
      <div style={{ borderTop: '1px solid var(--t-border)', paddingTop: 6 }}>
        <Link to="/settings" style={rowStyle(active === 'settings')}>
          {active === 'settings' && <span style={activeBar} />}
          <span
            style={{
              width: 18,
              textAlign: 'center',
              fontSize: 13,
              color: active === 'settings' ? 'var(--t-accent)' : 'var(--t-fg-3)',
            }}
          >
            ⚙
          </span>
          <span
            style={{
              flex: 1,
              fontSize: 12.5,
              color: 'var(--t-fg-2)',
              fontWeight: active === 'settings' ? 700 : 500,
            }}
          >
            {T('设置', 'Settings')}
          </span>
          <span className="hf-kbd">⌘,</span>
        </Link>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 10px',
            marginTop: 6,
            background: 'var(--t-panel-2)',
            border: '1px solid var(--t-border)',
            borderRadius: 8,
            cursor: 'pointer',
          }}
        >
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              background: 'var(--t-ok)',
              color: 'var(--t-bg)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: 10,
            }}
          >
            张
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11.5, fontWeight: 600 }}>张明</div>
            <div className="hf-meta" style={{ fontSize: 9 }}>
              0x3f7a…bc91
            </div>
          </div>
          <HfDot color="var(--t-ok)" pulse />
        </div>
      </div>
    </aside>
  );
}
