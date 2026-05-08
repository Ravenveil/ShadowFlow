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
import { useMemo, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { Home, MessageCircle, Users, Bot, LayoutTemplate, Search } from 'lucide-react';
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
  | 'settings';

interface NavItem {
  k: HfSidebarActive;
  Icon: LucideIcon;
  label: string;
  hint: string;
  to: string;
  badge?: number;
}

const buildNavItems = (T: (zh: string, en: string) => string): NavItem[] => [
  { k: 'start',     Icon: Home,           label: T('开始', 'Start'),     hint: '⌘1', to: '/start' },
  { k: 'chat',      Icon: MessageCircle,  label: T('聊天', 'Chat'),      hint: '⌘2', to: '/chat/default', badge: 3 },
  { k: 'teams',     Icon: Users,          label: T('团队', 'Teams'),     hint: '⌘3', to: '/teams' },
  { k: 'agents',    Icon: Bot,            label: T('员工', 'Agents'),    hint: '⌘4', to: '/agents' },
  { k: 'templates', Icon: LayoutTemplate, label: T('模板', 'Templates'), hint: '⌘5', to: '/templates' },
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
  const { language } = useI18n();
  const T = (zh: string, en: string) => (language === 'zh' ? zh : en);
  const NAV_ITEMS = useMemo(() => buildNavItems(T), [language]);

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
      {/* Minimalist brand bar — workspace switcher relocated to ChatPage */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 12px',
          marginBottom: 8,
        }}
      >
        <span style={{ fontSize: 13, color: 'var(--t-accent)' }}>✦</span>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.14em',
            color: 'var(--t-fg-2)',
          }}
        >
          SHADOWFLOW
        </span>
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
        <span style={{ color: 'var(--t-fg-4)', display: 'inline-flex', alignItems: 'center' }}>
          <Search size={12} strokeWidth={2} aria-hidden />
        </span>
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
