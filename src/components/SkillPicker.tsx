/**
 * SkillPicker — 3-column card grid for choosing the execution skill before
 * starting a RunSession.
 *
 * Story 15.4. Loads skills from `GET /api/skills` (with `LOCAL_SKILLS`
 * fallback on failure). Selected card is highlighted; clicking another card
 * fires `onChange(skill_id)`.
 *
 * Icons come from lucide-react (no emoji, per project rule).
 *
 * UI5.0（2026-08-14）：弃用 Tailwind 暗色硬编码（border-white/10、bg-blue-500/10
 * 等只在 night 可读的类），改为 --t-* 设计令牌 inline 样式——day/night 双主题
 * 自适应；选中态统一品牌蓝（原 per-skill 紫/绿/蓝散色收敛，clawsgo 克制用色）。
 */
import React, { useEffect, useState } from 'react';
import { Users, Monitor, FileText } from 'lucide-react';
import { listSkills, LOCAL_SKILLS, type SkillInfo } from '../api/skills';

const SKILL_ICONS: Record<string, React.ReactNode> = {
  'agent-team-blueprint': <Users size={20} />,
  'web-prototype': <Monitor size={20} />,
  report: <FileText size={20} />,
};
const FALLBACK_ICON = <FileText size={20} />;

export interface SkillPickerProps {
  value: string;
  onChange: (skillId: string) => void;
}

export function SkillPicker({ value, onChange }: SkillPickerProps) {
  const [skills, setSkills] = useState<SkillInfo[]>(LOCAL_SKILLS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    listSkills()
      .then((s) => {
        if (cancelled) return;
        setSkills(s);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setSkills(LOCAL_SKILLS);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div
        className="grid grid-cols-3 gap-3"
        role="status"
        aria-label="Loading skills"
        data-testid="skill-picker-loading"
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-28 rounded-xl animate-pulse"
            style={{ background: 'var(--t-panel-2)' }}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-3" data-testid="skill-picker">
      {skills.map((skill) => {
        const icon = SKILL_ICONS[skill.skill_id] ?? FALLBACK_ICON;
        const selected = value === skill.skill_id;
        return (
          <button
            key={skill.skill_id}
            type="button"
            onClick={() => onChange(skill.skill_id)}
            aria-pressed={selected}
            data-testid={`skill-card-${skill.skill_id}`}
            style={{
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              padding: 16,
              borderRadius: 14,
              textAlign: 'left',
              cursor: 'pointer',
              border: `1px solid ${selected ? 'var(--t-accent)' : 'var(--t-border)'}`,
              background: selected ? 'var(--t-accent-tint)' : 'var(--t-panel)',
              boxShadow: selected ? '0 0 0 3px var(--t-accent-tint)' : 'none',
              transition: 'border-color 140ms ease, background 140ms ease, box-shadow 140ms ease',
            }}
          >
            <div style={{ color: selected ? 'var(--t-accent)' : 'var(--t-fg-3)' }}>{icon}</div>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--t-fg)' }}>{skill.name}</div>
            <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.5, color: 'var(--t-fg-4)' }}>
              {skill.description}
            </p>
            <span
              style={{
                width: 'fit-content',
                fontSize: 10,
                fontFamily: 'var(--font-mono, monospace)',
                padding: '2px 8px',
                borderRadius: 999,
                border: '1px solid var(--t-border)',
                background: 'var(--t-panel-2)',
                color: 'var(--t-fg-3)',
              }}
            >
              {skill.preview_type}
            </span>
            {selected && (
              <div
                style={{
                  position: 'absolute',
                  top: 10,
                  right: 10,
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: 'var(--t-accent)',
                }}
                aria-hidden="true"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

export default SkillPicker;
