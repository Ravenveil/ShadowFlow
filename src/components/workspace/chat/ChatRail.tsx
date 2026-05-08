/**
 * ChatRail — 左侧 52px 图标导航栏
 */

import { CI } from './icons';

export type RailTab = 'msg' | 'task' | 'cal' | 'doc' | 'bot';

interface ChatRailProps {
  active: RailTab;
  onActiveChange: (tab: RailTab) => void;
}

export function ChatRail({ active, onActiveChange }: ChatRailProps) {
  const items = [
    { k: 'msg',  ic: CI.msg,  l: '消息',  badge: 7 },
    { k: 'task', ic: CI.task, l: '任务',  badge: 2 },
    { k: 'cal',  ic: CI.cal,  l: '日历' },
    { k: 'doc',  ic: CI.doc,  l: '文档' },
    { k: 'bot',  ic: CI.bot,  l: 'Agents' },
  ];
  return (
    <div style={{
      width: 52, background: 'var(--t-panel)', borderRight: '1px solid var(--t-border)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '10px 0 14px', gap: 4,
    }}>
      {items.map(it => (
        <div key={it.k} title={it.l} onClick={() => onActiveChange(it.k as RailTab)} data-testid={`rail-${it.k}`} style={{
          width: 40, height: 42, borderRadius: 8,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 2, cursor: 'pointer', position: 'relative',
          background: it.k === active ? 'var(--t-accent-tint)' : 'transparent',
          color: it.k === active ? 'var(--t-accent-bright)' : 'var(--t-fg-3)',
          transition: 'background 120ms, color 120ms',
        }}>
          <span style={{ width: 18, height: 18, display: 'flex' }}>{it.ic}</span>
          <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.02em' }}>{it.l}</span>
          {it.badge !== undefined && (
            <span style={{
              position: 'absolute', top: 2, right: 4, minWidth: 14, height: 14,
              padding: '0 4px', borderRadius: 7,
              background: 'var(--status-reject)', color: 'white',
              fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 800,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '1.5px solid var(--t-panel)',
            }}>{it.badge}</span>
          )}
        </div>
      ))}
      <div style={{ flex: 1 }} />
      <div
        title="新建会话"
        onClick={() => onActiveChange('msg')}
        style={{ width: 40, height: 40, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--t-fg-4)', cursor: 'pointer', transition: 'background 120ms' }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--t-panel-2)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      >
        {CI.pls}
      </div>
    </div>
  );
}
