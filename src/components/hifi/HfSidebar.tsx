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
import { useState, type CSSProperties } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { openQuickSwitcher } from './QuickSwitcher';
import { Search, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { PersonalTeamToggle } from '../../pages/chat-home/PersonalTeamToggle';
import { PRIMARY_NAV } from '../../config/navConfig';
import { HfDot } from './HfAtoms';
import { useI18n } from '../../common/i18n';
import { Settings as HfSettingsIcon, User as HfUserIcon } from '../../common/icons/iconRegistry';
import { useAuth } from '../../core/auth/AuthContext';
import type { UserProfile, AuthStatus } from '../../core/auth/AuthContext';
import { WalletLoginModal } from './WalletLoginModal';
import { useInboxStore } from '../../core/store/useInboxStore';

export type HfSidebarActive =
  | 'start'
  | 'chat'
  | 'teams'
  | 'agents'
  | 'templates'
  | 'calendar'
  | 'projects'
  | 'settings';

// 2026-06-22 侧栏统一 — 全局侧栏导航改读单一真相源 PRIMARY_NAV（src/config/
// navConfig.ts），与 /chat 的 ChatRail 逐字一致；换页时左侧 nav 纹丝不动。
// 当前路由是否命中某 nav —— 按 to 的 path 部分（忽略 query）前缀匹配。
function navItemActive(to: string, pathname: string): boolean {
  const path = to.split('?')[0];
  return path === '/chat' ? pathname.startsWith('/chat') : pathname.startsWith(path);
}

interface HfSidebarProps {
  active?: HfSidebarActive;
}

function rowStyle(_on: boolean): CSSProperties {
  // UI 3.0（2026-08-11）：背景迁出 inline，由 .ui30-navrow 类提供 hover/active 态
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '7px 12px',
    marginBottom: 1,
    borderRadius: 10,
    cursor: 'pointer',
    position: 'relative',
    textDecoration: 'none',
    color: 'inherit',
  };
}

// UI 4.0（2026-08-13）：选中指示条统一由 .ui30-navrow.on::before 渲染（弹性生长
// 动效），删除原 inline activeBar，避免双指示条。

// ── UserCard — live auth state ────────────────────────────────────────────────

function avatarGlyph(user: UserProfile | null): string {
  if (!user) return ''; // 未登录头像由游客图标渲染，不再用字符
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
  // 未登录时不用「?」字符当头像，改用游客线性图标
  const guestIcon = !user && !isLoading;
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
          {isLoading ? '…' : guestIcon ? <HfUserIcon size={14} strokeWidth={2} /> : glyph}
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
      className="ui30-usercard"
      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', marginTop: 6, background: 'var(--t-panel-2)', border: '1px solid var(--t-border)', borderRadius: 10, cursor: 'pointer' }}
    >
      <div style={{ width: 24, height: 24, borderRadius: '50%', background: avatarBg, color: 'var(--t-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 10, flexShrink: 0, opacity: isLoading ? 0.5 : 1 }}>
        {isLoading ? '…' : guestIcon ? <HfUserIcon size={13} strokeWidth={2} /> : glyph}
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
  // 未读计数 → 「消息」项徽标（全 app 未读求和）。
  const chatUnread = useInboxStore((s) =>
    s.groups.reduce((acc, g) => acc + (g.unreadCount ?? 0), 0),
  );
  const [collapsed, setCollapsed] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const { user, status } = useAuth();

  // 个人/团队 全局切换（clawsgo 式，常驻侧栏顶）。用 URL ?view= 驱动，
  // 点击导航到 /chat 对应态，让 ChatHomePage 内容联动切换。
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const chatView =
    location.pathname.startsWith('/chat') && searchParams.get('view') === 'personal'
      ? 'personal'
      : 'team';
  const goChatView = (v: 'personal' | 'team') =>
    navigate(v === 'personal' ? '/chat?view=personal' : '/chat');

  const W = collapsed ? 68 : 260;

  return (
    <aside
      className="sf-settings-bg"
      style={{
        width: W,
        height: '100%',
        flexShrink: 0,
        borderRight: '1px solid var(--t-border)',
        display: 'flex',
        flexDirection: 'column',
        padding: collapsed ? '12px 6px' : '12px 10px',
        // UI5.0：折叠/展开 240ms spring（clawsgo 120–280ms 刻度），更丝滑
        transition: 'width 240ms var(--ease-spring, cubic-bezier(.2,.8,.2,1)), padding 240ms var(--ease-spring, cubic-bezier(.2,.8,.2,1))',
        overflow: 'hidden',
      }}
    >
      {/* 个人/团队 全局切换（clawsgo 式，取代原工作区选择器位置）+ 折叠按钮 */}
      <div
        style={{
          display: 'flex',
          flexDirection: collapsed ? 'column' : 'row',
          alignItems: 'center',
          gap: 6,
          padding: collapsed ? '8px 6px' : '8px 10px',
          marginBottom: 8,
        }}
      >
        <div style={{ flex: collapsed ? undefined : 1, minWidth: 0, width: collapsed ? '100%' : undefined, display: 'flex' }}>
          <PersonalTeamToggle view={chatView} onChange={goChatView} compact={collapsed} />
        </div>
        <button
          onClick={() => setCollapsed(c => !c)}
          title={collapsed ? t('shell.expandSidebar') : t('shell.collapseSidebar')}
          className="ui50-ibtn"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--t-fg-4)',
            padding: 4,
            borderRadius: 6,
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
          className="ui30-searchpill"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '7px 10px',
            marginBottom: 14,
            background: 'var(--t-bg)',
            border: '1px solid var(--t-border)',
            borderRadius: 10,
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
          className="ui50-ibtn"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '7px 0',
            marginBottom: 14,
            borderRadius: 10,
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

      {PRIMARY_NAV.map((it) => {
        const on = navItemActive(it.to, location.pathname);
        const label = t(it.labelKey);
        const badge = it.key === 'inbox' && chatUnread > 0 ? chatUnread : undefined;
        if (collapsed) {
          return (
            <Link
              key={it.key}
              to={it.to}
              title={label}
              data-testid={`sidenav-${it.key}`}
              className={`ui30-navrow${on ? ' on' : ''}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                padding: '9px 0',
                marginBottom: 1,
                borderRadius: 10,
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              <span style={{ color: on ? 'var(--t-accent)' : 'var(--t-fg-3)', display: 'inline-flex' }}>
                <it.Icon size={16} strokeWidth={1.75} aria-hidden />
              </span>
              {badge ? (
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
                  {badge}
                </span>
              ) : null}
            </Link>
          );
        }
        return (
          <Link key={it.key} to={it.to} data-testid={`sidenav-${it.key}`} className={`ui30-navrow${on ? ' on' : ''}`} style={rowStyle(on)}>
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
              {label}
            </span>
            {badge ? (
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
                {badge}
              </span>
            ) : null}
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
            className={`ui30-navrow${active === 'settings' ? ' on' : ''}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              padding: '9px 0',
              marginBottom: 6,
              borderRadius: 10,
              textDecoration: 'none',
              color: 'inherit',
            }}
          >
            <span style={{ color: active === 'settings' ? 'var(--t-accent)' : 'var(--t-fg-3)', display: 'inline-flex' }}>
              <HfSettingsIcon size={16} strokeWidth={2} />
            </span>
          </Link>
        ) : (
          <Link to="/settings" className={`ui30-navrow${active === 'settings' ? ' on' : ''}`} style={rowStyle(active === 'settings')}>
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
