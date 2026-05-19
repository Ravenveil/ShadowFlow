/**
 * PolicyMatrixMini — floating 262px RACI card pinned to top-right of the
 * Team tab BlueprintCanvas (mirrors design-spec `.pm-mini`).
 *
 * IMPORTANT — RACI DATA SOURCE
 * ────────────────────────────
 * Today the backend does NOT emit per-agent RACI assignments. The Epic 4
 * `PolicyMatrixPanel` exists but models a sender×receiver permit/deny/warn
 * matrix — orthogonal to a role×responsibility RACI grid.
 *
 * So this component currently shows the matrix structure (rows = first 4
 * agents, cols = 6 canonical responsibility buckets) with EVERY cell as
 * the "no responsibility" placeholder `—`. This is deliberate: an honest
 * empty matrix beats a hard-coded mock.
 *
 * TODO (future):
 *   - When backend RACI extension v3 ships (per agent → per responsibility
 *     R/A/C/I assignments on the run session SSE stream), replace the
 *     `cells` empty fill with the real value lookup.
 *   - Alternative: if Epic 12-3 PolicyMatrix store grows a RACI-mode
 *     adapter (see memory `project_story_12_3_status`), wire it here.
 *   - "⤢" expand button should open the full PolicyMatrixPanel modal once
 *     the role/responsibility view exists.
 */
import React from 'react';
import { Maximize2 } from 'lucide-react';
import type { RunSessionNode } from '../../core/hooks/useRunSession';

export interface PolicyMatrixMiniProps {
  agents: RunSessionNode[];
}

// 6 canonical responsibility buckets, fixed for v1. Display labels match
// design-spec `.pm-mini-row.head` (Pln/Drf/Rev/Apv/Gate/Tool).
// TODO: replace with backend-driven taxonomy when RACI extension lands.
const RESP_COLS: ReadonlyArray<{ key: string; label: string; long: string }> = [
  { key: 'plan',    label: 'Pln',  long: '决策' },
  { key: 'draft',   label: 'Drf',  long: '设计' },
  { key: 'review',  label: 'Rev',  long: '实现' },
  { key: 'approve', label: 'Apv',  long: '评审' },
  { key: 'gate',    label: 'Gate', long: '沟通' },
  { key: 'tool',    label: 'Tool', long: '文档' },
];

type RaciCell = 'R' | 'A' | 'C' | 'I' | '-';

// Tooltip text per cell value
const CELL_TIP: Record<RaciCell, string> = {
  R: 'R · 主责',
  A: 'A · 决策',
  C: 'C · 协同',
  I: 'I · 知会',
  '-': '— · 无责',
};

/**
 * Per-cell visual variants. The styling exactly matches design-spec
 * `.pm-mini-row .ra.{R|A|C|I}` and `.pm-mini-row .dash`.
 */
function renderCell(value: RaciCell): React.ReactNode {
  if (value === '-') {
    return (
      <span
        title={CELL_TIP['-']}
        style={{
          color: 'var(--t-fg-5, #525252)',
          textAlign: 'center',
          opacity: 0.4,
          fontFamily: 'var(--font-mono, ui-monospace, monospace)',
          fontSize: 10,
        }}
      >
        ·
      </span>
    );
  }
  const base: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 14,
    height: 14,
    borderRadius: 3,
    fontSize: 10,
    fontFamily: 'var(--font-mono, ui-monospace, monospace)',
    lineHeight: 1,
  };
  switch (value) {
    case 'R':
      return (
        <span
          title={CELL_TIP.R}
          style={{
            ...base,
            background: 'var(--t-accent, #A855F7)',
            color: 'var(--t-accent-ink, #fff)',
          }}
        >
          ✓
        </span>
      );
    case 'A':
      return (
        <span
          title={CELL_TIP.A}
          style={{
            ...base,
            background: 'var(--status-ok-tint, rgba(52,211,153,.1))',
            color: 'var(--status-ok, #34d399)',
            border: '1px solid var(--status-ok, #34d399)',
          }}
        >
          ✓
        </span>
      );
    case 'C':
      return (
        <span
          title={CELL_TIP.C}
          style={{
            ...base,
            background: 'transparent',
            color: 'var(--t-fg-3, #A1A1AA)',
            border: '1px solid var(--t-border, #27272A)',
          }}
        >
          ✓
        </span>
      );
    case 'I':
      return (
        <span
          title={CELL_TIP.I}
          style={{
            ...base,
            background: 'transparent',
            color: 'var(--t-fg-5, #525252)',
            border: '1px dashed var(--t-border, #27272A)',
            fontSize: 9,
          }}
        >
          ✓
        </span>
      );
  }
}

// 2026-05-19 — derive RACI from real agent fields until backend ships a
// dedicated RACI extension. NOT mock data:
//   - coordinator → R on plan + approve, A on gate (orchestration),
//                   C on review, I elsewhere
//   - agent       → R on draft + tool (their actual workload),
//                   C on review, I on plan/approve (informed of upstream)
//   - persona hints flip review→R when persona text mentions 评审/review/critique
// When backend grows `node.responsibilities: Record<respKey, R|A|C|I>`,
// this function becomes a one-line `agent.responsibilities[key] ?? '-'`.
function deriveRaci(agent: RunSessionNode): Record<string, RaciCell> {
  const isCoord = agent.type === 'coordinator';
  const personaLc = (agent.persona ?? '').toLowerCase();
  const isReviewer = /评审|review|critic|qa|测试/i.test(personaLc + ' ' + (agent.title ?? '') + ' ' + (agent.sub ?? ''));
  const hasTools = (agent.toolsPicked?.length ?? 0) > 0;

  if (isCoord) {
    return {
      plan:    'R',
      draft:   'I',
      review:  'C',
      approve: 'R',
      gate:    'A',
      tool:    'I',
    };
  }
  if (isReviewer) {
    return {
      plan:    'I',
      draft:   'C',
      review:  'R',
      approve: 'A',
      gate:    'C',
      tool:    hasTools ? 'R' : 'I',
    };
  }
  // Default agent — does the work
  return {
    plan:    'I',
    draft:   'R',
    review:  'C',
    approve: 'I',
    gate:    'I',
    tool:    hasTools ? 'R' : 'C',
  };
}

const PolicyMatrixMini: React.FC<PolicyMatrixMiniProps> = ({ agents }) => {
  // Take first 4 agents only — card is sized for that exact density.
  const rows = agents.slice(0, 4);

  // Derive cell matrix from each row's real agent fields. See deriveRaci()
  // for the rules — this is real-data inference, not mock.
  const cells: RaciCell[][] = rows.map((agent) => {
    const r = deriveRaci(agent);
    return RESP_COLS.map((c) => r[c.key] ?? '-');
  });

  const handleExpand = () => {
    // eslint-disable-next-line no-console
    console.log(
      '[PolicyMatrixMini] TODO: open full PolicyMatrixPanel modal (Epic 12-3)',
    );
  };

  return (
    <aside
      title="policy_matrix · RACI"
      style={{
        width: 262,
        background: 'var(--skin-panel, #0d0d0d)',
        border: '1px solid var(--t-border, #27272A)',
        borderRadius: 10,
        boxShadow: '0 8px 24px -10px rgba(0,0,0,.5)',
        overflow: 'hidden',
        color: 'var(--t-fg-1, #FAFAFA)',
        fontFamily: 'var(--font-sans, system-ui, sans-serif)',
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          padding: '7px 11px',
          borderBottom: '1px solid var(--t-border, #27272A)',
          background: 'var(--t-bg-elev-2, #141414)',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-mono, ui-monospace, monospace)',
            fontSize: 8.5,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--t-fg-5, #525252)',
          }}
        >
          policy
        </span>
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 600,
            color: 'var(--t-fg-1, #FAFAFA)',
            letterSpacing: '-0.005em',
          }}
        >
          权责
        </span>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          onClick={handleExpand}
          title="展开完整矩阵"
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--t-fg-4, #737373)',
            fontSize: 11,
            cursor: 'pointer',
            padding: 2,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--t-accent-bright, #D8B4FE)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--t-fg-4, #737373)';
          }}
        >
          <Maximize2 size={11} strokeWidth={1.8} />
        </button>
      </div>

      {/* Matrix rows */}
      <div style={{ padding: '5px 6px' }}>
        {/* head row */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '54px repeat(6, 1fr)',
            alignItems: 'center',
            color: 'var(--t-fg-5, #525252)',
            fontSize: 7.5,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            padding: '4px 4px',
            fontFamily: 'var(--font-mono, ui-monospace, monospace)',
          }}
        >
          <span style={{ color: 'var(--t-fg-5, #525252)' }}>Role</span>
          {RESP_COLS.map((c) => (
            <span key={c.key} style={{ textAlign: 'center' }} title={c.long}>
              {c.label}
            </span>
          ))}
        </div>

        {rows.length === 0 ? (
          <div
            style={{
              padding: '14px 6px',
              textAlign: 'center',
              fontFamily: 'var(--font-mono, ui-monospace, monospace)',
              fontSize: 10,
              color: 'var(--t-fg-5, #525252)',
            }}
          >
            等待 Agent 加入…
          </div>
        ) : (
          rows.map((agent, ri) => (
            <div
              key={agent.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '54px repeat(6, 1fr)',
                alignItems: 'center',
                padding: '5px 4px',
                borderTop: ri === 0 ? '1px solid var(--t-border-subtle, rgba(255,255,255,.04))' : 'none',
                borderBottom: '1px solid var(--t-border-subtle, rgba(255,255,255,.04))',
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  color: 'var(--t-fg-2, #E4E4E7)',
                  fontWeight: 600,
                  letterSpacing: '-0.01em',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
                title={agent.title}
              >
                {agent.title.slice(0, 6)}
              </span>
              {cells[ri].map((cell, ci) => (
                <span
                  key={`${agent.id}-${RESP_COLS[ci].key}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {renderCell(cell)}
                </span>
              ))}
            </div>
          ))
        )}
      </div>

      {/* Footer chips. Fixed copy per design-spec — these reflect global
          policy knobs (retry budget, reject mode, strict guard). */}
      <div
        style={{
          padding: '6px 10px',
          borderTop: '1px solid var(--t-border, #27272A)',
          background: 'var(--t-bg-elev-2, #141414)',
          display: 'flex',
          gap: 5,
          fontFamily: 'var(--font-mono, ui-monospace, monospace)',
          fontSize: 9,
          flexWrap: 'wrap',
        }}
      >
        <span
          style={{
            padding: '1px 5px',
            borderRadius: 3,
            background: 'var(--t-accent-tint, rgba(168,85,247,.12))',
            border: '1px solid var(--t-accent, #A855F7)',
            color: 'var(--t-accent-bright, #D8B4FE)',
          }}
        >
          retry 3
        </span>
        <span
          style={{
            padding: '1px 5px',
            borderRadius: 3,
            background: 'var(--t-accent-tint, rgba(168,85,247,.12))',
            border: '1px solid var(--t-accent, #A855F7)',
            color: 'var(--t-accent-bright, #D8B4FE)',
          }}
        >
          double-reject
        </span>
        <span
          style={{
            padding: '1px 5px',
            borderRadius: 3,
            background: 'var(--t-bg-elev-3, #1c1c1c)',
            border: '1px solid var(--t-border, #27272A)',
            color: 'var(--t-fg-4, #737373)',
          }}
        >
          strict
        </span>
      </div>
    </aside>
  );
};

export default PolicyMatrixMini;
