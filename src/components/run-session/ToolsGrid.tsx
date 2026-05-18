/**
 * ToolsGrid — selected/candidate tools grid for the active agent. Mirrors
 * run-session-v2.html `.ag-tools` / `.ag-tool-grid` styles (lines
 * ~663-682).
 *
 * Picked tools render as solid accent-tinted cards with a check mark.
 * Candidate tools render with dashed border + plus mark and reduced
 * opacity. 2-column responsive grid.
 *
 * Data source: RunSessionNode.toolsPicked / toolsCandidate (provided by
 * agent-B backend extension). When toolsPicked is empty AgentDetail
 * derives a fallback list from `chips minus model-chip` and passes that
 * here as `picked`. candidate stays empty in the fallback path — see
 * AgentDetail JSDoc for the full rule.
 */
import React from 'react';
import { Check, Plus } from 'lucide-react';

export interface ToolsGridProps {
  picked: string[];
  candidate: string[];
}

const cardBase: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'auto 1fr auto',
  gap: 8,
  alignItems: 'center',
  padding: '7px 10px',
  borderRadius: 8,
  background: 'var(--bg-elev-2)',
  border: '1px solid var(--border)',
};

const nameStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono, monospace)',
  fontSize: 11,
  color: 'var(--fg-2)',
  fontWeight: 500,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const tagStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono, monospace)',
  fontSize: 8.5,
  color: 'var(--fg-5)',
  letterSpacing: '0.06em',
  padding: '1px 5px',
  borderRadius: 3,
  background: 'var(--bg-elev-3, var(--bg-elev-2))',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 3,
};

export const ToolsGrid: React.FC<ToolsGridProps> = ({ picked, candidate }) => {
  const total = picked.length + candidate.length;
  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: 13,
        padding: '14px 16px',
        background: 'var(--bg-elev-1)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 10,
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: 9,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--fg-4)',
            fontWeight: 700,
          }}
        >
          Tools
        </span>
        <span
          style={{
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: 10,
            color: 'var(--accent-bright)',
            fontWeight: 600,
          }}
        >
          · {picked.length}/{total || 0}
        </span>
        <span style={{ flex: 1 }} />
        <span
          style={{
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: 9.5,
            color: 'var(--fg-5)',
          }}
        >
          {candidate.length > 0 ? '点击候选加入' : '已配置全部工具'}
        </span>
      </div>

      {total === 0 ? (
        <div
          style={{
            padding: '14px 0',
            textAlign: 'center',
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: 10.5,
            color: 'var(--fg-5)',
            fontStyle: 'italic',
          }}
        >
          未指定工具
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 6,
          }}
        >
          {picked.map((name) => (
            <div
              key={`sel-${name}`}
              style={{
                ...cardBase,
                background: 'var(--accent-tint)',
                borderColor: 'var(--accent)',
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: 'var(--accent)',
                  boxShadow: '0 0 6px var(--accent)',
                }}
              />
              <span style={{ ...nameStyle, color: 'var(--accent-bright)' }}>
                {name}
              </span>
              <span
                style={{
                  ...tagStyle,
                  background: 'var(--accent)',
                  color: 'var(--accent-ink)',
                }}
              >
                <Check size={9} strokeWidth={3} />
                SEL
              </span>
            </div>
          ))}
          {candidate.map((name) => (
            <div
              key={`cand-${name}`}
              style={{
                ...cardBase,
                borderStyle: 'dashed',
                opacity: 0.7,
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: 'var(--fg-5)',
                }}
              />
              <span style={nameStyle}>{name}</span>
              <span style={{ ...tagStyle, color: 'var(--fg-4)' }}>
                <Plus size={9} strokeWidth={3} />
              </span>
              {/* TODO (agent-4 2026-05-18): ADDING… mid-state spinner.
                  Currently backend (agent-B) only emits picked/candidate
                  as fixed snapshots. When backend grows a per-tool
                  `state: 'adding' | 'added'` field, render a sf-spin
                  ring here instead of the Plus icon for `adding` rows. */}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ToolsGrid;
