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
 *
 * 2026-06-12 F6 批3 — active pill 从「两按钮各自变底色」升级为单一滑动
 * pill（absolute 元素 transform 过渡，--dur-2 --ease-spring，与右栏 tab
 * 指示条同款）。两按钮等宽/等高（flex:1 / 同 padding），pill 尺寸可用
 * calc(50% - 6px) 静态推出（容器 padding 4 + gap 4），无需测量。
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
            position: 'relative', zIndex: 1,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: '100%', padding: '8px 0', borderRadius: 7, border: 'none', cursor: 'pointer',
            background: 'transparent',
            color: active ? 'var(--t-accent)' : 'var(--t-fg-3)',
            transition: 'color var(--dur-1) var(--ease-out)',
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
          position: 'relative', zIndex: 1,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          flex: 1, padding: '7px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
          fontSize: 13, fontWeight: 600, // UI5.0 — 字重收敛(clawsgo 克制)
          background: 'transparent',
          color: active ? 'var(--t-fg)' : 'var(--t-fg-3)',
          transition: 'color var(--dur-1) var(--ease-out)',
        }}
      >
        {icon}
        <span>{label}</span>
      </button>
    );
  };

  // 滑动 active pill：personal=第 1 格，team=第 2 格（translate 100% + 4px gap）。
  const second = view === 'team';
  const indicator = compact
    ? {
        position: 'absolute' as const,
        left: 4, right: 4, top: 4,
        height: 'calc(50% - 6px)',
        transform: second ? 'translateY(calc(100% + 4px))' : 'translateY(0)',
        borderRadius: 7,
      }
    : {
        position: 'absolute' as const,
        top: 4, bottom: 4, left: 4,
        width: 'calc(50% - 6px)',
        transform: second ? 'translateX(calc(100% + 4px))' : 'translateX(0)',
        borderRadius: 8,
      };

  return (
    <div style={{
      position: 'relative',
      display: compact ? 'flex' : 'inline-flex',
      flexDirection: compact ? 'column' : 'row',
      gap: 4, padding: 4, borderRadius: 10, width: compact ? '100%' : undefined,
      background: 'var(--t-panel-2)', border: '1px solid var(--t-border)',
    }}>
      <span
        aria-hidden
        style={{
          ...indicator,
          background: 'var(--t-panel)',
          // UI5.0 — 滑动 pill 用中性软影;--shadow-pop 在 day 主题带蓝环,太跳。
          boxShadow: 'var(--ui30-shadow-sm, 0 1px 2px rgba(0,0,0,.06))',
          transition: 'transform var(--dur-2) var(--ease-spring)',
          pointerEvents: 'none',
        }}
      />
      {pill('personal', <User size={15} strokeWidth={2} />, '个人')}
      {pill('team', <Users size={15} strokeWidth={2} />, '团队')}
    </div>
  );
}
