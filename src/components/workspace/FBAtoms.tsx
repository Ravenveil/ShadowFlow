/**
 * FB-HiFi shared atoms: icons, Avatar, Pill, Kbd, Chrome
 * Derived from design handoff: FB-HiFi.html / fb-shared.jsx
 */

import type { CSSProperties, ReactNode } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Icons
// ─────────────────────────────────────────────────────────────────────────────

export const FBIcons = {
  search: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
    </svg>
  ),
  users: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  team: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="6" r="3" /><circle cx="6" cy="17" r="3" /><circle cx="18" cy="17" r="3" />
      <path d="M12 9v2" /><path d="M9.5 14.5 11 11.5" /><path d="m14.5 14.5-1.5-3" />
    </svg>
  ),
  chat: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a8 8 0 0 1-11.5 7.16L3 21l1.84-6.5A8 8 0 1 1 21 12Z" />
    </svg>
  ),
  template: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  ),
  arrow: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
    </svg>
  ),
  bell: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.36.16.69.39 1 .68a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09c-.62 0-1.18.36-1.51.91Z" />
    </svg>
  ),
  play: (
    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l13-7.5z" /></svg>
  ),
  sun: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2m-7.07-14.07 1.41 1.41m12.72 12.72 1.41 1.41M2 12h2m16 0h2m-16.07 7.07 1.41-1.41m12.72-12.72 1.41-1.41" />
    </svg>
  ),
  moon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  ),
  plus: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  dag: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="5" cy="6" r="2" /><circle cx="19" cy="6" r="2" /><circle cx="12" cy="18" r="2" />
      <path d="M7 7l4 9" /><path d="M17 7l-4 9" />
    </svg>
  ),
  send: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" />
    </svg>
  ),
  check: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m5 12 5 5L20 7" />
    </svg>
  ),
  x: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18" /><path d="M6 6l12 12" />
    </svg>
  ),
  more: (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <circle cx="6" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="18" cy="12" r="1.6" />
    </svg>
  ),
  paper: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" />
    </svg>
  ),
  hash: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="9" x2="20" y2="9" /><line x1="4" y1="15" x2="20" y2="15" />
      <line x1="10" y1="3" x2="8" y2="21" /><line x1="16" y1="3" x2="14" y2="21" />
    </svg>
  ),
};

// ─────────────────────────────────────────────────────────────────────────────
// Tab definitions
// ─────────────────────────────────────────────────────────────────────────────

export const FB_TABS = [
  { key: 'agents',    label: 'Agents',    hint: '人才库',  badge: '7', icon: FBIcons.users },
  { key: 'teams',     label: 'Teams',     hint: '团队',    badge: '3', icon: FBIcons.team },
  { key: 'chat',      label: 'Chat',      hint: '群聊·DM', badge: '2', icon: FBIcons.chat },
  { key: 'templates', label: 'Templates', hint: '模板',    badge: '6', icon: FBIcons.template },
] as const;

export type FBTabKey = typeof FB_TABS[number]['key'];

export const TAB_LABEL: Record<FBTabKey, { num: string; name: string; hint: string }> = {
  agents:    { num: '01', name: 'Agents · 人才库',     hint: '招人 — 单个 agent 的灵魂、技能、模型' },
  teams:     { num: '02', name: 'Teams · 团队',        hint: '组队 — 把 agent 编成 team，配 DAG + Policy' },
  chat:      { num: '03', name: 'Chat · 群聊与 DM',    hint: '运行 — team 跑起来时消息流就是实时 DAG' },
  templates: { num: '04', name: 'Templates · 模板',    hint: '换血 — 一键套用整套 (agents+team+DAG)' },
};

// ─────────────────────────────────────────────────────────────────────────────
// Primitive components
// ─────────────────────────────────────────────────────────────────────────────

interface FBAvProps {
  glyph: string;
  color?: string;
  size?: number;
  status?: 'run' | 'ok' | 'warn' | 'idle';
  square?: boolean;
}

export function FBAv({ glyph, color = 'var(--t-accent)', size = 32, status, square }: FBAvProps) {
  return (
    <span
      className="fb-av"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        background: `color-mix(in oklab, ${color} 18%, var(--t-panel-2))`,
        borderColor: `color-mix(in oklab, ${color} 45%, transparent)`,
        color,
        borderRadius: square ? size * 0.22 : size * 0.28,
      }}
    >
      {glyph}
      {status && (
        <span
          style={{
            position: 'absolute',
            right: -2,
            bottom: -2,
            width: Math.max(8, size * 0.28),
            height: Math.max(8, size * 0.28),
            borderRadius: '50%',
            background: `var(--status-${status})`,
            border: '2px solid var(--skin-panel)',
            animation: status === 'run' ? 'fb-pulse 1.4s ease-in-out infinite' : 'none',
          }}
        />
      )}
    </span>
  );
}

interface FBPillProps {
  color?: string;
  dim?: boolean;
  children: ReactNode;
  style?: CSSProperties;
}

export function FBPill({ color = 'var(--t-fg-4)', dim, children, style }: FBPillProps) {
  return (
    <span
      className="fb-pill"
      style={{
        color,
        background: dim
          ? `color-mix(in oklab, ${color} 8%, transparent)`
          : `color-mix(in oklab, ${color} 16%, transparent)`,
        borderColor: `color-mix(in oklab, ${color} 35%, transparent)`,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

export function FBKbd({ children }: { children: ReactNode }) {
  return <span className="fb-kbd">{children}</span>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Top chrome: titlebar + tabbar
// ─────────────────────────────────────────────────────────────────────────────

interface FBChromeProps {
  active: FBTabKey;
  theme: 'day' | 'night';
  onTabChange: (tab: FBTabKey) => void;
  onThemeToggle: () => void;
  onNotification?: () => void;
  onRun?: () => void;
}

export function FBChrome({ active, theme, onTabChange, onThemeToggle, onNotification, onRun }: FBChromeProps) {
  return (
    <>
      {/* Titlebar */}
      <div className="fb-titlebar">
        <a href="/" className="fb-logo" style={{ textDecoration: 'none', cursor: 'pointer' }} title="回首页">S</a>
        <div className="fb-bread">
          <span className="b-app">ShadowFlow</span>
          <span className="b-sep">/</span>
          <span className="b-ws">paper-lab</span>
          <span className="b-sep">/</span>
          <span className="b-cur">论文深读小队</span>
          <span className="dirty" title="未保存" />
        </div>
        <div className="fb-omnibar" role="button" tabIndex={0}>
          <span className="o-icon" style={{ width: 14, height: 14, display: 'flex' }}>
            {FBIcons.search}
          </span>
          <span className="o-hint">跳转 agent · team · 消息 · 模板…</span>
          <span className="o-kbd">⌘ K</span>
        </div>
        <div className="fb-tools">
          <div className="fb-theme-toggle" onClick={onThemeToggle} title="切换主题" role="button" tabIndex={0}>
            <span className={`seg ${theme === 'day' ? 'on' : ''}`} style={{ display: 'flex' }}>
              {FBIcons.sun}
            </span>
            <span className={`seg ${theme === 'night' ? 'on' : ''}`} style={{ display: 'flex' }}>
              {FBIcons.moon}
            </span>
          </div>
          <button className="fb-btn fb-btn-icon" title="通知" style={{ display: 'flex' }} onClick={onNotification}>
            <span style={{ width: 16, height: 16, display: 'flex' }}>{FBIcons.bell}</span>
          </button>
          <button className="fb-btn fb-btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={onRun}>
            <span style={{ display: 'flex', width: 14, height: 14 }}>{FBIcons.play}</span>
            Run
          </button>
          <FBAv glyph="张" color="#10B981" size={28} />
        </div>
      </div>

      {/* Tabbar */}
      <div className="fb-tabbar">
        {FB_TABS.map((t) => (
          <div
            key={t.key}
            className={`fb-tab ${t.key === active ? 'on' : ''}`}
            onClick={() => onTabChange(t.key)}
            role="tab"
            aria-selected={t.key === active}
            tabIndex={0}
          >
            <span
              className="t-icon"
              style={{
                color: t.key === active ? 'var(--t-accent)' : 'var(--t-fg-4)',
                width: 16,
                height: 16,
                display: 'flex',
              }}
            >
              {t.icon}
            </span>
            <span className="t-label">{t.label}</span>
            <span className="t-hint">{t.hint}</span>
            {t.badge && <span className="t-badge">{t.badge}</span>}
          </div>
        ))}
        <div className="fb-tab-arrow">
          <span>招人</span><span className="ar">→</span>
          <span>组队</span><span className="ar">→</span>
          <span>群聊</span><span className="ar">→</span>
          <span>换血</span>
        </div>
      </div>
    </>
  );
}
