/**
 * DesignSystemPicker — radio-button group for choosing a Design System
 * (Story 15.5).
 *
 * Loads from `GET /api/design-systems` (with `LOCAL_DS` fallback). The picker
 * filters its options against `compatible_skills` so users only see DS values
 * that make sense for the currently-selected skill. The caller is expected to
 * conditionally render or hide the entire component when no DS is compatible
 * with the skill — this component does NOT render a "no options" placeholder.
 *
 * Visual style mirrors SkillPicker. UI5.0：改为 --t-* 令牌 inline 样式（原
 * Tailwind 暗色硬编码在 day 主题不可读）。
 */
import { useEffect, useMemo, useState } from 'react';
import { listDesignSystems, LOCAL_DS, type DesignSystemInfo } from '../api/designSystems';

export interface DesignSystemPickerProps {
  /** Currently-selected `ds_id`. Use 'none' for "no constraint". */
  value: string;
  onChange: (ds_id: string) => void;
  /** Skill id used to filter `compatible_skills`. */
  skillId: string;
}

export function DesignSystemPicker({ value, onChange, skillId }: DesignSystemPickerProps) {
  const [items, setItems] = useState<DesignSystemInfo[]>(LOCAL_DS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    listDesignSystems()
      .then((list) => {
        if (cancelled) return;
        setItems(list);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setItems(LOCAL_DS);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = useMemo(
    () => items.filter((ds) => ds.compatible_skills.includes(skillId)),
    [items, skillId],
  );

  if (loading) {
    return (
      <div
        className="flex flex-wrap gap-2"
        role="status"
        aria-label="Loading design systems"
        data-testid="design-system-picker-loading"
      >
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-9 w-28 rounded-lg animate-pulse"
            style={{ background: 'var(--t-panel-2)' }}
          />
        ))}
      </div>
    );
  }

  // No compatible options — render nothing. Caller can also hide the section
  // entirely; this guard makes the component safe to mount unconditionally.
  if (visible.length === 0) {
    return null;
  }

  // UI5.0（2026-08-14）：暗色 Tailwind（border-white/10、text-white/70）→ --t-*
  // 令牌，day/night 自适应；选中态统一品牌蓝。
  return (
    <div
      role="radiogroup"
      aria-label="Design System"
      data-testid="design-system-picker"
      className="flex flex-wrap gap-2"
    >
      {visible.map((ds) => {
        const selected = value === ds.ds_id;
        return (
          <button
            key={ds.ds_id}
            type="button"
            role="radio"
            aria-checked={selected}
            data-testid={`ds-option-${ds.ds_id}`}
            onClick={() => onChange(ds.ds_id)}
            title={ds.description}
            style={{
              position: 'relative',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 12px',
              borderRadius: 10,
              fontSize: 13,
              cursor: 'pointer',
              border: `1px solid ${selected ? 'var(--t-accent)' : 'var(--t-border)'}`,
              background: selected ? 'var(--t-accent-tint)' : 'var(--t-panel)',
              color: selected ? 'var(--t-fg)' : 'var(--t-fg-2)',
              transition: 'border-color 140ms ease, background 140ms ease, color 140ms ease',
            }}
          >
            <span
              aria-hidden="true"
              style={{
                display: 'inline-block',
                width: 12,
                height: 12,
                borderRadius: '50%',
                border: `1px solid ${selected ? 'var(--t-accent)' : 'var(--t-fg-4)'}`,
                background: selected ? 'var(--t-accent)' : 'transparent',
                boxShadow: selected ? 'inset 0 0 0 2px var(--t-panel)' : 'none',
              }}
            />
            <span style={{ fontWeight: 500 }}>{ds.name}</span>
          </button>
        );
      })}
    </div>
  );
}

export default DesignSystemPicker;
