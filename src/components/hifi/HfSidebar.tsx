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
import { Home, MessageCircle, Users, Bot, LayoutTemplate, Search, PanelLeftClose, PanelLeftOpen, Folder, CalendarDays } from 'lucide-react';
import { WorkspaceSelector } from '../workspace/WorkspaceStrip';
import type { LucideIcon } from 'lucide-react';
import { HfDot } from './HfAtoms';
import { useI18n } from '../../common/i18n';
import { Settings as HfSettingsIcon } from '../../common/icons/iconRegistry';
import { useAuth } from '../../core/auth/AuthContext';
import type { UserProfile, AuthStatus } from '../../core/auth/AuthContext';
import { WalletLoginModal } from './WalletLoginModal';

export type HfSidebarActive =
  | 'start'
  | 'chat'
  | 'teams'
  | 'agents'
  | 'templates'
  | 'calendar'
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
  { k: 'calendar',  Icon: CalendarDays,  label: t('shell.navCalendar'),  hint: '⌘6', to: '/calendar' },
  // Story 15.24 — Projects nav entry (Project + Conversation history page).
  { k: 'projects',  Icon: Folder,        label: t('projects.navLabel'),  hint: '⌘7', to: '/projects' },
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

// ── UserCard — live auth state ────────────────────────────────────────────────

function avatarGlyph(user: UserProfile | null): string {
  if (!user) return '?';
  if (user.display_name) return user.display_name.charAt(0).toUpperCase();
  if (user.type === 'guest') return 'G';
  return user.address.slice(2, 4).toUpperCase();
}

function shortAddress(address: string): string {
  if (address.startsWith('guest_')) return '访客模式';
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

interface UserCardProps {
  user: UserProfile | null;
  status: AuthStatus;
  collapsed: boolean;
  onOpen: () => void;
}

function UserCard({ user, status, collapsed, onOpen }: UserCardProps) {
  const isLoading = status === 'loading';
  const glyph = avatarGlyph(user);
  const avatarBg = user?.type === 'wallet' ? 'var(--t-accent)' : 'var(--t-fg-4)';
  const name = user?.display_name ?? (user?.type === 'guest' ? '访客' : (user ? shortAddress(user.address) : '未登录'));
  const sub = user ? shortAddress(user.address) : '点击登录';

  if (collapsed) {
    return (
      <div
        title={user ? `${name} · ${sub}` : '点击登录'}
        onClick={onOpen}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px 0', cursor: 'pointer', position: 'relative' }}
      >
        <div style={{ width: 26, height: 26, borderRadius: '50%', background: avatarBg, color: 'var(--t-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 10, opacity: isLoading ? 0.5 : 1 }}>
          {isLoading ? '…' : glyph}
        </div>
        {user && (
          <span style={{ position: 'absolute', bottom: 8, right: 6 }}>
            <HfDot color={user.type === 'wallet' ? 'var(--t-ok)' : 'var(--t-fg-4)'} pulse={user.type === 'wallet'} />
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      onClick={onOpen}
      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', marginTop: 6, background: 'var(--t-panel-2)', border: '1px solid var(--t-border)', borderRadius: 8, cursor: 'pointer' }}
    >
      <div style={{ width: 24, height: 24, borderRadius: '50%', background: avatarBg, color: 'var(--t-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 10, flexShrink: 0, opacity: isLoading ? 0.5 : 1 }}>
        {isLoading ? '…' : glyph}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{isLoading ? '加载中…' : name}</div>
        <div className="hf-meta" style={{ fontSize: 9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{isLoading ? '' : sub}</div>
      </div>
      {user && <HfDot color={user.type === 'wallet' ? 'var(--t-ok)' : 'var(--t-fg-4)'} pulse={user.type === 'wallet'} />}
    </div>
  );
}

export function HfSidebar({ active = 'start' }: HfSidebarProps) {
  const { t } = useI18n();
  const NAV_ITEMS = useMemo(() => buildNavItems(t), [t]);
  const [collapsed, setCollapsed] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const { user, status } = useAuth();

  const W = collapsed ? 56 : 260;

  return (
    <aside
      style={{
        width: W,
        height: '100%',
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
      {/* Workspace switcher + collapse toggle */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: collapsed ? '8px 6px' : '8px 10px',
          marginBottom: 8,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <WorkspaceSelector collapsed={collapsed} />
        </div>
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
        <UserCard
          user={user}
          status={status}
          collapsed={collapsed}
          onOpen={() => setShowLogin(true)}
        />
        {showLogin && <WalletLoginModal onClose={() => setShowLogin(false)} />}
      </div>
    </aside>
  );
}
