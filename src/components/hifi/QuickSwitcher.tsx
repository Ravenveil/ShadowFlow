/**
 * QuickSwitcher — ⌘K 全局命令面板
 *
 * 参考 open-design FileWorkspace 里的 QuickSwitcher（Cmd+P）模式。
 * 触发方式：
 *   - 全局 ⌘K / Ctrl+K 键盘快捷键
 *   - HfSidebar 搜索栏点击
 *   - StartPage 搜索栏点击（通过 openQuickSwitcher() 事件）
 *
 * 搜索范围：导航页面 / 最近会话 / Agents
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Home, MessageCircle, Users, Bot, LayoutTemplate,
  Settings, Search, ArrowRight, Hash, Lock,
} from 'lucide-react';
import { useI18n } from '../../common/i18n';

// ---------------------------------------------------------------------------
// 数据模型
// ---------------------------------------------------------------------------

type ItemKind = 'nav' | 'conv' | 'agent';

interface SwitcherItem {
  id: string;
  kind: ItemKind;
  label: string;
  sub?: string;
  icon: React.ReactNode;
  to: string;
  accent?: boolean;
}

function buildNavItems(t: (key: string) => string): SwitcherItem[] {
  return [
    { id: 'nav-start',     kind: 'nav', label: t('shell.navStart'),     sub: 'Start',     icon: <Home size={14} strokeWidth={1.75} />,          to: '/start' },
    { id: 'nav-chat',      kind: 'nav', label: t('shell.navChat'),      sub: 'Chat',      icon: <MessageCircle size={14} strokeWidth={1.75} />, to: '/chat/default' },
    { id: 'nav-teams',     kind: 'nav', label: t('shell.navTeams'),     sub: 'Teams',     icon: <Users size={14} strokeWidth={1.75} />,         to: '/teams' },
    { id: 'nav-agents',    kind: 'nav', label: t('shell.navAgents'),    sub: 'Agents',    icon: <Bot size={14} strokeWidth={1.75} />,           to: '/agents' },
    { id: 'nav-templates', kind: 'nav', label: t('shell.navTemplates'), sub: 'Templates', icon: <LayoutTemplate size={14} strokeWidth={1.75} />,to: '/templates' },
    { id: 'nav-settings',  kind: 'nav', label: t('shell.navSettings'),  sub: 'Settings',  icon: <Settings size={14} strokeWidth={1.75} />,      to: '/settings' },
  ];
}

const CONV_ITEMS: SwitcherItem[] = [
  { id: 'conv-main',      kind: 'conv', label: '论文深读小队', sub: '阿批 · 发现 3 处不一致', icon: <Hash size={13} strokeWidth={2} />, to: '/chat/default?conv=main', accent: true },
  { id: 'conv-eng',       kind: 'conv', label: 'engineering',  sub: 'Devon · PR #312 已合并', icon: <Hash size={13} strokeWidth={2} />, to: '/chat/default?conv=engineering' },
  { id: 'conv-secret',    kind: 'conv', label: '文献综述-机密', sub: 'wait · approval gate',   icon: <Lock size={13} strokeWidth={2} />, to: '/chat/default?conv=secret' },
];

const AGENT_ITEMS: SwitcherItem[] = [
  { id: 'agent-dudu',    kind: 'agent', label: '读读',  sub: 'READER · L1',   icon: <span style={{ width: 18, height: 18, borderRadius: '50%', background: '#A855F7', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, flexShrink: 0 }}>读</span>, to: '/chat/default?conv=dudu' },
  { id: 'agent-api',     kind: 'agent', label: '阿批',  sub: 'CRITIC · L2',   icon: <span style={{ width: 18, height: 18, borderRadius: '50%', background: '#F59E0B', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, flexShrink: 0 }}>批</span>, to: '/chat/default?conv=api' },
  { id: 'agent-chaxha',  kind: 'agent', label: '查查',  sub: 'CITE · L1',     icon: <span style={{ width: 18, height: 18, borderRadius: '50%', background: '#22D3EE', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, flexShrink: 0 }}>查</span>, to: '/chat/default?conv=chaxha' },
  { id: 'agent-xiaoxie', kind: 'agent', label: '小写',  sub: 'WRITER · L3',   icon: <span style={{ width: 18, height: 18, borderRadius: '50%', background: '#EF4444', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, flexShrink: 0 }}>写</span>, to: '/chat/default?conv=xiaoxie' },
];

function buildKindLabels(t: (key: string) => string): Record<ItemKind, string> {
  return {
    nav: t('quickswitcher.groupNav'),
    conv: t('quickswitcher.groupConv'),
    agent: t('quickswitcher.groupAgent'),
  };
}

// ---------------------------------------------------------------------------
// 全局事件总线（用于 HfSidebar / StartPage 触发开启）
// ---------------------------------------------------------------------------

export function openQuickSwitcher() {
  window.dispatchEvent(new CustomEvent('qs:open'));
}

// ---------------------------------------------------------------------------
// 组件
// ---------------------------------------------------------------------------

export function QuickSwitcher() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const NAV_ITEMS = buildNavItems(t);
  const KIND_LABELS = buildKindLabels(t);
  const ALL_ITEMS = [...NAV_ITEMS, ...CONV_ITEMS, ...AGENT_ITEMS];

  // 打开 / 关闭
  const openSwitcher = useCallback(() => {
    setOpen(true);
    setQuery('');
    setIdx(0);
    setTimeout(() => inputRef.current?.focus(), 30);
  }, []);

  const closeSwitcher = useCallback(() => {
    setOpen(false);
    setQuery('');
  }, []);

  // 全局 ⌘K + 自定义事件
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        openSwitcher();
      }
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener('qs:open', openSwitcher);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('qs:open', openSwitcher);
    };
  }, [openSwitcher]);

  // 过滤
  const q = query.trim().toLowerCase();
  const filtered = q
    ? ALL_ITEMS.filter(
        it =>
          it.label.toLowerCase().includes(q) ||
          (it.sub ?? '').toLowerCase().includes(q),
      )
    : ALL_ITEMS;

  // 分组
  const grouped: Partial<Record<ItemKind, SwitcherItem[]>> = {};
  for (const it of filtered) {
    if (!grouped[it.kind]) grouped[it.kind] = [];
    grouped[it.kind]!.push(it);
  }

  const flatFiltered = filtered; // for keyboard nav index

  // 确保 idx 不越界
  const safeIdx = Math.min(idx, flatFiltered.length - 1);

  function go(item: SwitcherItem) {
    closeSwitcher();
    navigate(item.to);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { closeSwitcher(); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIdx(i => Math.min(i + 1, flatFiltered.length - 1));
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIdx(i => Math.max(i - 1, 0));
    }
    if (e.key === 'Enter' && flatFiltered[safeIdx]) {
      go(flatFiltered[safeIdx]);
    }
  }

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={closeSwitcher}
        style={{
          position: 'fixed', inset: 0, zIndex: 998,
          background: 'rgba(0,0,0,0.45)',
          backdropFilter: 'blur(2px)',
        }}
      />

      {/* Panel */}
      <div
        style={{
          position: 'fixed',
          top: '18vh',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 560,
          maxWidth: 'calc(100vw - 32px)',
          background: 'var(--t-panel)',
          border: '1px solid var(--t-border)',
          borderRadius: 14,
          boxShadow: '0 24px 60px -12px rgba(0,0,0,.55)',
          zIndex: 999,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '60vh',
        }}
      >
        {/* Search input */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 16px',
          borderBottom: '1px solid var(--t-border)',
          flexShrink: 0,
        }}>
          <span style={{ color: 'var(--t-fg-4)', display: 'inline-flex' }}>
            <Search size={15} strokeWidth={2} />
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setIdx(0); }}
            onKeyDown={handleKeyDown}
            placeholder={t('quickswitcher.placeholder')}
            style={{
              flex: 1, border: 'none', outline: 'none',
              background: 'transparent', fontSize: 14,
              color: 'var(--t-fg)', fontFamily: 'inherit',
            }}
          />
          <span
            onClick={closeSwitcher}
            style={{
              fontFamily: 'var(--font-mono)', fontSize: 10,
              color: 'var(--t-fg-5)', cursor: 'pointer',
              padding: '2px 6px', borderRadius: 4,
              border: '1px solid var(--t-border)',
            }}
          >
            ESC
          </span>
        </div>

        {/* Results */}
        <div style={{ overflowY: 'auto', padding: '6px 8px 8px' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 13, color: 'var(--t-fg-4)' }}>
              {t('quickswitcher.noResults')}
            </div>
          ) : (
            (Object.keys(grouped) as ItemKind[]).map(kind => (
              <div key={kind}>
                <div style={{
                  padding: '8px 8px 4px',
                  fontFamily: 'var(--font-mono)', fontSize: 9.5,
                  fontWeight: 700, letterSpacing: '0.08em',
                  color: 'var(--t-fg-5)', textTransform: 'uppercase',
                }}>
                  {KIND_LABELS[kind]}
                </div>
                {grouped[kind]!.map(item => {
                  const globalIdx = flatFiltered.indexOf(item);
                  const active = globalIdx === safeIdx;
                  return (
                    <div
                      key={item.id}
                      onClick={() => go(item)}
                      onMouseEnter={() => setIdx(globalIdx)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                        background: active ? 'var(--t-accent-tint)' : 'transparent',
                        transition: 'background 80ms ease',
                      }}
                    >
                      <span style={{
                        display: 'inline-flex', width: 20, height: 20,
                        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        color: active ? 'var(--t-accent)' : 'var(--t-fg-3)',
                      }}>
                        {item.icon}
                      </span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{
                          fontSize: 13, fontWeight: 600,
                          color: active ? 'var(--t-accent)' : 'var(--t-fg)',
                        }}>
                          {item.label}
                        </span>
                        {item.sub && (
                          <span style={{
                            fontSize: 11, color: 'var(--t-fg-4)', marginLeft: 6,
                          }}>
                            {item.sub}
                          </span>
                        )}
                      </span>
                      {active && (
                        <span style={{ color: 'var(--t-accent)', display: 'inline-flex' }}>
                          <ArrowRight size={13} strokeWidth={2} />
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer hint */}
        <div style={{
          borderTop: '1px solid var(--t-border)',
          padding: '6px 14px',
          display: 'flex', gap: 14, alignItems: 'center',
          flexShrink: 0,
        }}>
          {[['↑↓', t('quickswitcher.hintSelect')], ['↵', t('quickswitcher.hintGo')], ['ESC', t('quickswitcher.hintClose')]].map(([k, v]) => (
            <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 9.5,
                padding: '1px 5px', borderRadius: 3,
                border: '1px solid var(--t-border)', color: 'var(--t-fg-4)',
              }}>{k}</span>
              <span style={{ fontSize: 10, color: 'var(--t-fg-5)' }}>{v}</span>
            </span>
          ))}
        </div>
      </div>
    </>
  );
}
