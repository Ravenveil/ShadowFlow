/**
 * SkillSection — S6.7
 *
 * One stacked section in the v3 AgentDetail layout. The provenance line
 * ("from <agent>.skill.yaml#persona 632 tokens · cached") is the whole
 * point of the redesign: the byte you're reading came from a named
 * fragment of a named skill file, not from a model that paraphrased it.
 *
 * Layout (matches run-session-v3.html ag-persona-h / ag-mh / ag-tools-h):
 *
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │ TITLE · 副标题 [from <skill>.yaml#slot] [N tokens] [cached]  │  ← header row
 *   │                                              [✎ 编辑 stub]   │
 *   ├──────────────────────────────────────────────────────────────┤
 *   │  …body slot (children)…                                      │
 *   └──────────────────────────────────────────────────────────────┘
 *
 * The `id` prop is wired into useFollowMode's SUBSTEP_TO_ANCHOR table so
 * the right pane scrolls here when the matching substep starts streaming.
 *
 * 编辑 button is intentionally a stub (S7+) — clicking it logs the slot
 * + agent id to the console. Visual to-spec; functional later.
 */
import React from 'react';
import { Pencil, FileText, Box, Wrench, Database } from 'lucide-react';

export type SectionStatus = 'cached' | 'loading' | 'waiting' | 'pending' | 'idle';

export interface SkillSectionProps {
  /** DOM id used by useFollowMode.currentAnchor for scrollIntoView. */
  id: string;
  /** Big uppercase label, e.g. "READER.PERSONA". */
  title: string;
  /** Optional middle subtitle, e.g. "· 参数" between title and provenance. */
  subtitle?: string;
  /** Provenance ref like "reader.skill.yaml#persona". Optional — omitted when unknown. */
  source?: string;
  /** Token count of the body, shown after the ref. */
  tokens?: number;
  /** Section streaming status. Drives the colored pill on the right of header. */
  status?: SectionStatus;
  /** Icon family. Defaults to FileText. */
  iconKind?: 'persona' | 'model' | 'tools' | 'memory';
  /** Click handler for the "✎ 编辑" stub. Defaults to a console.log no-op. */
  onEdit?: () => void;
  children: React.ReactNode;
}

const STATUS_LABEL: Record<SectionStatus, string> = {
  cached: 'cached',
  loading: 'loading',
  waiting: 'waiting',
  pending: 'pending',
  idle: 'idle',
};

const STATUS_COLOR: Record<SectionStatus, string> = {
  cached: 'var(--t-status-ok, #16a34a)',
  loading: 'var(--t-accent, #A855F7)',
  waiting: 'var(--t-fg-4, var(--fg-4))',
  pending: 'var(--t-fg-4, var(--fg-4))',
  idle: 'var(--t-fg-5, var(--fg-5))',
};

function pickIcon(kind: SkillSectionProps['iconKind']) {
  switch (kind) {
    case 'model': return Box;
    case 'tools': return Wrench;
    case 'memory': return Database;
    case 'persona':
    default: return FileText;
  }
}

export const SkillSection: React.FC<SkillSectionProps> = ({
  id,
  title,
  subtitle,
  source,
  tokens,
  status = 'idle',
  iconKind,
  onEdit,
  children,
}) => {
  const Icon = pickIcon(iconKind);
  const handleEdit = onEdit ?? (() => {
    // eslint-disable-next-line no-console
    console.log(`[SkillSection] edit stub — section=${id} source=${source ?? '?'}`);
  });

  return (
    <section
      id={id}
      data-component="skill-section"
      data-status={status}
      style={{
        // scroll-margin-top so the header doesn't get hidden behind the
        // RightPaneTabs bar when useFollowMode auto-scrolls here.
        scrollMarginTop: 80,
        borderRadius: 13,
        border: '1px solid var(--t-border, var(--border))',
        background: 'var(--t-bg-elev-1, var(--bg-elev-1))',
        overflow: 'hidden',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 14px',
          borderBottom: '1px solid var(--t-border, var(--border))',
          background: 'var(--t-bg-elev-2, var(--bg-elev-2, transparent))',
          fontSize: 11.5,
          flexWrap: 'wrap',
        }}
      >
        <Icon size={13} strokeWidth={2} color="var(--t-fg-3, var(--fg-3))" />
        <span
          style={{
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--t-fg-1, var(--fg-1))',
          }}
        >
          {title}
        </span>
        {subtitle && (
          <span style={{ fontSize: 11, color: 'var(--t-fg-3, var(--fg-3))' }}>{subtitle}</span>
        )}
        <span style={{ flex: 1 }} />
        {source && (
          <span
            style={{
              fontSize: 10.5,
              color: 'var(--t-fg-4, var(--fg-4))',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            from{' '}
            <code
              style={{
                fontFamily: 'var(--font-mono, monospace)',
                background: 'var(--t-bg-elev-3, transparent)',
                padding: '1px 5px',
                borderRadius: 4,
                color: 'var(--t-fg-2, var(--fg-2))',
              }}
            >
              {source}
            </code>
          </span>
        )}
        {typeof tokens === 'number' && tokens > 0 && (
          <span
            style={{
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: 10,
              color: 'var(--t-fg-4, var(--fg-4))',
            }}
          >
            {tokens} tokens
          </span>
        )}
        <span
          style={{
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: 9.5,
            color: STATUS_COLOR[status],
            border: `1px solid ${STATUS_COLOR[status]}`,
            padding: '1px 6px',
            borderRadius: 999,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}
        >
          {STATUS_LABEL[status]}
        </span>
        <button
          type="button"
          onClick={handleEdit}
          title="编辑"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '3px 8px',
            border: '1px solid var(--t-border, var(--border))',
            background: 'transparent',
            color: 'var(--t-fg-3, var(--fg-3))',
            borderRadius: 6,
            fontSize: 10.5,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          <Pencil size={11} strokeWidth={2} />
          编辑
        </button>
      </header>
      <div style={{ padding: '12px 14px' }}>{children}</div>
    </section>
  );
};

export default SkillSection;
