import type React from 'react';
import { User, Users } from 'lucide-react';

export type ChatHomeView = 'personal' | 'team';

interface PersonalTeamToggleProps {
  view: ChatHomeView;
  onChange: (v: ChatHomeView) => void;
}

/** /chat 顶部「个人 | 团队」pill 切换。视觉对齐 baseline 其他 segmented 控件。 */
export function PersonalTeamToggle({ view, onChange }: PersonalTeamToggleProps) {
  const pill = (v: ChatHomeView, icon: React.ReactNode, label: string) => {
    const active = view === v;
    return (
      <button
        type="button"
        onClick={() => onChange(v)}
        aria-pressed={active}
        aria-label={label}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '7px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
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
      display: 'inline-flex', gap: 4, padding: 4, borderRadius: 10,
      background: 'var(--t-panel-2)', border: '1px solid var(--t-border)',
    }}>
      {pill('personal', <User size={15} strokeWidth={2} />, '个人')}
      {pill('team', <Users size={15} strokeWidth={2} />, '团队')}
    </div>
  );
}
