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
 * Visual style mirrors SkillPicker (Tailwind utility classes; no emoji icons).
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
          <div key={i} className="h-9 w-28 rounded-lg bg-white/5 animate-pulse" />
        ))}
      </div>
    );
  }

  // No compatible options — render nothing. Caller can also hide the section
  // entirely; this guard makes the component safe to mount unconditionally.
  if (visible.length === 0) {
    return null;
  }

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
            className={`
              relative inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all
              ${
                selected
                  ? 'border-purple-500/60 bg-purple-500/15 text-white'
                  : 'border-white/10 bg-white/5 text-white/70 hover:border-white/20 hover:text-white/90'
              }
            `}
          >
            <span
              aria-hidden="true"
              className={`
                inline-block h-3 w-3 rounded-full border
                ${selected ? 'border-purple-300 bg-purple-400' : 'border-white/30 bg-transparent'}
              `}
            />
            <span className="font-medium">{ds.name}</span>
          </button>
        );
      })}
    </div>
  );
}

export default DesignSystemPicker;
