/**
 * SkillPicker — 3-column card grid for choosing the execution skill before
 * starting a RunSession.
 *
 * Story 15.4. Loads skills from `GET /api/skills` (with `LOCAL_SKILLS`
 * fallback on failure). Selected card is highlighted; clicking another card
 * fires `onChange(skill_id)`.
 *
 * Icons come from lucide-react (no emoji, per project rule).
 */
import React, { useEffect, useState } from 'react';
import { Users, Monitor, FileText } from 'lucide-react';
import { listSkills, LOCAL_SKILLS, type SkillInfo } from '../api/skills';

interface SkillMeta {
  icon: React.ReactNode;
  selectedClass: string;
}

const SKILL_META: Record<string, SkillMeta> = {
  'agent-team-blueprint': {
    icon: <Users size={20} />,
    selectedClass: 'border-blue-500/60 bg-blue-500/10',
  },
  'web-prototype': {
    icon: <Monitor size={20} />,
    selectedClass: 'border-purple-500/60 bg-purple-500/10',
  },
  report: {
    icon: <FileText size={20} />,
    selectedClass: 'border-green-500/60 bg-green-500/10',
  },
};

const FALLBACK_META: SkillMeta = {
  icon: <FileText size={20} />,
  selectedClass: 'border-blue-500/60 bg-blue-500/10',
};

const PREVIEW_BADGE: Record<string, string> = {
  yaml: 'bg-yellow-500/20 text-yellow-300',
  html: 'bg-purple-500/20 text-purple-300',
  markdown: 'bg-green-500/20 text-green-300',
};

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
            className="h-28 rounded-xl bg-white/5 animate-pulse"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-3" data-testid="skill-picker">
      {skills.map((skill) => {
        const meta = SKILL_META[skill.skill_id] ?? FALLBACK_META;
        const selected = value === skill.skill_id;
        const badgeClass =
          PREVIEW_BADGE[skill.preview_type] ?? 'bg-white/10 text-white/50';
        return (
          <button
            key={skill.skill_id}
            type="button"
            onClick={() => onChange(skill.skill_id)}
            aria-pressed={selected}
            data-testid={`skill-card-${skill.skill_id}`}
            className={`
              relative flex flex-col gap-2 p-4 rounded-xl border text-left transition-all
              ${
                selected
                  ? meta.selectedClass
                  : 'border-white/10 bg-white/5 hover:border-white/20'
              }
            `}
          >
            <div className="text-white/70">{meta.icon}</div>
            <div className="text-sm font-medium text-white">{skill.name}</div>
            <p className="text-xs text-white/50 line-clamp-2">
              {skill.description}
            </p>
            <span
              className={`text-xs px-2 py-0.5 rounded-full w-fit ${badgeClass}`}
            >
              {skill.preview_type}
            </span>
            {selected && (
              <div
                className="absolute top-2 right-2 w-2 h-2 rounded-full bg-blue-400"
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
