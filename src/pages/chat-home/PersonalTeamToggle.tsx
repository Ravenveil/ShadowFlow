import type React from 'react';
import { User, Users } from 'lucide-react';

export type ChatHomeView = 'personal' | 'team';

interface PersonalTeamToggleProps {
  view: ChatHomeView;
  onChange: (v: ChatHomeView) => void;
  /** 折叠侧栏：图标竖排、无文字。 */
  compact?: boolean;
}

/**
 * 「个人 | 团队」segmented 切换。
 * - 默认（compact=false）：横向 pill，带图标 + 文字。
 * - compact=true：图标竖排、无文字，给折叠态侧栏（68px）用。
 * 视觉对齐 baseline 其他 segmented 控件。
 */
export function PersonalTeamToggle({ view, onChange, compact = false }: PersonalTeamToggleProps) {
  const pill = (v: ChatHomeView, icon: React.ReactNode, label: string) => {
    const active = view === v;
    if (compact) {
      return (
        <button
          type="button"
          onClick={() => onChange(v)}
          aria-pressed={active}
          aria-label={label}
          title={label}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: '100%', padding: '8px 0', borderRadius: 7, border: 'none', cursor: 'pointer',
            background: active ? 'var(--t-panel)' : 'transparent',
            color: active ? 'var(--t-accent)' : 'var(--t-fg-3)',
            boxShadow: active ? 'var(--shadow-pop)' : 'none',
            transition: 'background 120ms ease, color 120ms ease',
          }}
        >
          {icon}
        </button>
      );
    }
    return (
      <button
        type="button"
        onClick={() => onChange(v)}
        aria-pressed={active}
        aria-label={label}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          flex: 1, padding: '7px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
          fontSize: 13, fontWeight: 700,
          background: active ? 'var(--t-panel)' : 'transparent',
          color: active ? 'var(--t-fg)' : 'var(--t-fg-3)',
          boxShadow: active ? 'var(--shadow-pop)' : 'none',
          transition: 'background 120ms ease, color 120ms ease',
        }}
      >
        {icon}
        <span>{label}</span>
      </button>
    );
  };

  return (
    <div style={{
      display: compact ? 'flex' : 'inline-flex',
      flexDirection: compact ? 'column' : 'row',
      gap: 4, padding: 4, borderRadius: 10, width: compact ? '100%' : undefined,
      background: 'var(--t-panel-2)', border: '1px solid var(--t-border)',
    }}>
      {pill('personal', <User size={15} strokeWidth={2} />, '个人')}
      {pill('team', <Users size={15} strokeWidth={2} />, '团队')}
    </div>
  );
}
