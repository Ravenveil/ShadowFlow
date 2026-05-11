/**
 * Hi-Fi v2 Sidebar — 220px left rail.
 *
 * Recreated pixel-faithful from `hf-shared.jsx` HfSidebar in the design
 * handoff bundle. Wires nav items to `react-router-dom` Link.
 *
 * 2026-05-07 — Workspace switcher MOVED to ChatPage left column (per
 * G1 audit + handoff `fb-tab-chat.jsx:29-112` OrgSwitcher which is rendered
 * inside the Chat page itself, not on the global sidebar). The global rail
 * now shows only a minimalist brand bar to reclaim vertical space for
 * navigation. Search / NAV / Settings / user card unchanged.
 */
import { useMemo, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { openQuickSwitcher } from './QuickSwitcher';
import { Home, MessageCircle, Users, Bot, LayoutTemplate, Search, PanelLeftClose, PanelLeftOpen, Sparkles, Folder } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { HfDot } from './HfAtoms';
import { useI18n } from '../../common/i18n';
import { Settings as HfSettingsIcon } from '../../common/icons/iconRegistry';

export type HfSidebarActive =
  | 'start'
  | 'chat'
  | 'teams'
  | 'agents'
  | 'templates'
  | 'skill-studio'
  | 'projects'
  | 'settings';

interface NavItem {
  k: HfSidebarActive;
  Icon: LucideIcon;
  label: string;
  hint: string;
  to: string;
  badge?: number;
}

const buildNavItems = (t: (key: string) => string): NavItem[] => [
  { k: 'start',     Icon: Home,           label: t('shell.navStart'),     hint: '⌘1', to: '/start' },
  { k: 'chat',      Icon: MessageCircle,  label: t('shell.navChat'),      hint: '⌘2', to: '/chat/default', badge: 3 },
  { k: 'teams',     Icon: Users,          label: t('shell.navTeams'),     hint: '⌘3', to: '/teams' },
  { k: 'agents',    Icon: Bot,            label: t('shell.navAgents'),    hint: '⌘4', to: '/agents' },
  { k: 'templates', Icon: LayoutTemplate, label: t('shell.navTemplates'), hint: '⌘5', to: '/templates' },
  // Story 15.28 — Skill Studio top-level entry. Falls under main nav so users
  // can reach `/run-session` from any logged-in screen.
  { k: 'skill-studio', Icon: Sparkles,    label: t('skillStudio.entry.navLabel'), hint: '⌘6', to: '/run-session' },
  // Story 15.24 — Projects nav entry (Project + Conversation history page).
  { k: 'projects',     Icon: Folder,      label: t('projects.navLabel'),         hint: '⌘7', to: '/projects' },
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

export function HfSidebar({ active = 'start' }: HfSidebarProps) {
  const { t } = useI18n();
  const NAV_ITEMS = useMemo(() => buildNavItems(t), [t]);
  const [collapsed, setCollapsed] = useState(false);

  const W = collapsed ? 56 : 220;

  return (
    <aside
      style={{
        width: W,
        flexShrink: 0,
        background: 'var(--t-panel)',
        borderRight: '1px solid var(--t-border)',
        display: 'flex',
        flexDirection: 'column',
        padding: collapsed ? '12px 6px' : '12px 10px',
        transition: 'width 200ms ease, padding 200ms ease',
        overflow: 'hidden',
      }}
    >
      {/* Brand bar + collapse toggle */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: collapsed ? '10px 4px' : '10px 12px',
          marginBottom: 8,
          justifyContent: collapsed ? 'center' : 'flex-start',
        }}
      >
        {!collapsed && (
          <>
            <span style={{ fontSize: 13, color: 'var(--t-accent)', flexShrink: 0 }}>✦</span>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.14em',
                color: 'var(--t-fg-2)',
                flex: 1,
                whiteSpace: 'nowrap',
              }}
            >
              SHADOWFLOW
            </span>
          </>
        )}
        <button
          onClick={() => setCollapsed(c => !c)}
          title={collapsed ? t('shell.expandSidebar') : t('shell.collapseSidebar')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--t-fg-4)',
            padding: 4,
            borderRadius: 5,
            flexShrink: 0,
          }}
        >
          {collapsed
            ? <PanelLeftOpen size={14} strokeWidth={1.75} aria-hidden />
            : <PanelLeftClose size={14} strokeWidth={1.75} aria-hidden />
          }
        </button>
      </div>

      {/* Search — hidden when collapsed */}
      {!collapsed && (
        <div
          onClick={openQuickSwitcher}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '7px 10px',
            marginBottom: 14,
            background: 'var(--t-bg)',
            border: '1px solid var(--t-border)',
            borderRadius: 8,
            cursor: 'pointer',
          }}
        >
          <span style={{ color: 'var(--t-fg-4)', display: 'inline-flex', alignItems: 'center' }}>
            <Search size={12} strokeWidth={2} aria-hidden />
          </span>
          <span style={{ flex: 1, fontSize: 11.5, color: 'var(--t-fg-4)' }}>{t('shell.search')}</span>
          <span className="hf-kbd">⌘K</span>
        </div>
      )}

      {/* Collapsed: search icon only */}
      {collapsed && (
        <div
          title={t('shell.search')}
          onClick={openQuickSwitcher}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '7px 0',
            marginBottom: 14,
            color: 'var(--t-fg-4)',
            cursor: 'pointer',
          }}
        >
          <Search size={14} strokeWidth={2} aria-hidden />
        </div>
      )}

      {!collapsed && (
        <div className="hf-label" style={{ padding: '2px 12px 6px' }}>
          {t('shell.navigation')}
        </div>
      )}

      {NAV_ITEMS.map((it) => {
        const on = it.k === active;
        if (collapsed) {
          return (
            <Link
              key={it.k}
              to={it.to}
              title={it.label}
              data-testid={`sidenav-${it.k}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                padding: '9px 0',
                marginBottom: 1,
                borderRadius: 7,
                background: on ? 'var(--t-accent-tint)' : 'transparent',
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              {on && <span style={{ ...activeBar, left: -6 }} />}
              <span style={{ color: on ? 'var(--t-accent)' : 'var(--t-fg-3)', display: 'inline-flex' }}>
                <it.Icon size={16} strokeWidth={1.75} aria-hidden />
              </span>
              {it.badge ? (
                <span style={{
                  position: 'absolute',
                  top: 5,
                  right: 6,
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  background: 'var(--t-accent)',
                  color: 'var(--t-accent-ink)',
                  fontSize: 8,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: 'var(--font-mono)',
                }}>
                  {it.badge}
                </span>
              ) : null}
            </Link>
          );
        }
        return (
          <Link key={it.k} to={it.to} data-testid={`sidenav-${it.k}`} style={rowStyle(on)}>
            {on && <span style={activeBar} />}
            <span
              style={{
                width: 18,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: on ? 'var(--t-accent)' : 'var(--t-fg-3)',
              }}
            >
              <it.Icon size={14} strokeWidth={1.75} aria-hidden />
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
        {collapsed ? (
          <Link
            to="/settings"
            title={t('shell.settings')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              padding: '9px 0',
              marginBottom: 6,
              borderRadius: 7,
              background: active === 'settings' ? 'var(--t-accent-tint)' : 'transparent',
              textDecoration: 'none',
              color: 'inherit',
            }}
          >
            {active === 'settings' && <span style={{ ...activeBar, left: -6 }} />}
            <span style={{ color: active === 'settings' ? 'var(--t-accent)' : 'var(--t-fg-3)', display: 'inline-flex' }}>
              <HfSettingsIcon size={16} strokeWidth={2} />
            </span>
          </Link>
        ) : (
          <Link to="/settings" style={rowStyle(active === 'settings')}>
            {active === 'settings' && <span style={activeBar} />}
            <span
              style={{
                width: 18,
                textAlign: 'center',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: active === 'settings' ? 'var(--t-accent)' : 'var(--t-fg-3)',
              }}
            >
              <HfSettingsIcon size={14} strokeWidth={2} />
            </span>
            <span
              style={{
                flex: 1,
                fontSize: 12.5,
                color: 'var(--t-fg-2)',
                fontWeight: active === 'settings' ? 700 : 500,
              }}
            >
              {t('shell.settings')}
            </span>
            <span className="hf-kbd">⌘,</span>
          </Link>
        )}

        {/* User card */}
        {collapsed ? (
          <div
            title="张明 · 0x3f7a…bc91"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '8px 0',
              cursor: 'pointer',
              position: 'relative',
            }}
          >
            <div
              style={{
                width: 26,
                height: 26,
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
            <span style={{ position: 'absolute', bottom: 8, right: 6 }}>
              <HfDot color="var(--t-ok)" pulse />
            </span>
          </div>
        ) : (
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
                flexShrink: 0,
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
        )}
      </div>
    </aside>
  );
}
