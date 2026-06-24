/**
 * TeamRoster — the live "real team" roster overlay for the Team tab.
 *
 * Born 2026-06-24 (right-workspace stream) to make the Team pane feel like a
 * produced roster rather than a bare DAG. Each card is a real `RunSessionNode`
 * from the SSE stream — avatar, name, role/persona one-liner, model + tool
 * chips, and a live status pill (building / ready / pending). The header
 * summarises team size + how many are ready + edge count.
 *
 * Strictly additive + no mock data: the component is only mounted by TeamPanel
 * when `agents.length > 0`, and every field falls back gracefully (model is
 * derived from chips when `node.model` is absent, persona truncates, tools come
 * from `toolsPicked` or chips-minus-model). Conventions: inline styles +
 * `var(--t-*)` tokens + `sf-pulse` keyframe, matching the surrounding panels.
 */
import React from 'react';
import type { RunSessionNode, RunSessionEdge } from '../../core/hooks/useRunSession';

const MODEL_RE = /claude|gpt|gemini|deepseek|qwen|llama|mistral|o[134]/i;

function modelChip(node: RunSessionNode): string | undefined {
  if (node.model) return node.model;
  return node.chips.find((c) => MODEL_RE.test(c));
}

function toolChips(node: RunSessionNode): string[] {
  if (node.toolsPicked && node.toolsPicked.length > 0) return node.toolsPicked;
  const model = modelChip(node);
  return node.chips.filter((c) => c !== model);
}

function roleLine(node: RunSessionNode): string {
  const persona = node.persona?.trim();
  if (persona) {
    // first non-empty line, stripped of leading comment markers
    const first = persona
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.length > 0);
    if (first) return first.replace(/^[#/]+\s*/, '');
  }
  if (node.sub && node.sub.trim().length > 0) return node.sub;
  return node.type === 'coordinator' ? '编排与调度' : 'Agent';
}

type StatusKind = 'building' | 'ready' | 'pending';

const STATUS_META: Record<StatusKind, { label: string; color: string; pulse: boolean }> = {
  building: { label: 'BUILDING', color: 'var(--t-accent, #1890FF)', pulse: true },
  ready: { label: 'READY', color: 'var(--t-ok, #10B981)', pulse: false },
  pending: { label: 'PENDING', color: 'var(--t-fg-5, #6b7280)', pulse: false },
};

export interface TeamRosterProps {
  agents: RunSessionNode[];
  edges: RunSessionEdge[];
  isStreaming: boolean;
  onSelectAgent?: (nodeId: string) => void;
}

export const TeamRoster: React.FC<TeamRosterProps> = ({ agents, edges, isStreaming, onSelectAgent }) => {
  const ready = agents.filter((a) => a.status === 'ready').length;
  return (
    <div
      data-component="team-roster"
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        maxHeight: '100%',
        background: 'var(--t-panel, rgba(20,20,22,.92))',
        border: '1px solid var(--t-border, var(--border))',
        borderRadius: 12,
        overflow: 'hidden',
        backdropFilter: 'blur(8px)',
        boxShadow: '0 8px 28px -18px rgba(0,0,0,.55)',
      }}
    >
      {/* Header — team summary */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '11px 14px',
          borderBottom: '1px solid var(--t-border, var(--border))',
          background: 'var(--t-panel-2, var(--bg-elev-2))',
          flexShrink: 0,
        }}
      >
        <span
          aria-hidden
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: isStreaming ? 'var(--t-accent, #1890FF)' : 'var(--t-ok, #10B981)',
            animation: isStreaming ? 'sf-pulse 1.4s ease-in-out infinite' : undefined,
            flexShrink: 0,
          }}
        />
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t-fg, #FAFAFA)' }}>团队</span>
        <span style={{ flex: 1 }} />
        <span
          style={{
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: 10,
            color: 'var(--t-fg-4)',
          }}
        >
          {ready}/{agents.length} 就绪 · {edges.length} 连线
        </span>
      </div>

      {/* Roster cards */}
      <div
        className="sf-scroll"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          padding: 8,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        {agents.map((node) => (
          <RosterCard key={node.id} node={node} onSelect={onSelectAgent} />
        ))}
      </div>
    </div>
  );
};

const RosterCard: React.FC<{ node: RunSessionNode; onSelect?: (id: string) => void }> = ({
  node,
  onSelect,
}) => {
  const status = (node.status as StatusKind) ?? 'pending';
  const meta = STATUS_META[status] ?? STATUS_META.pending;
  const model = modelChip(node);
  const tools = toolChips(node);
  const role = roleLine(node);
  const isCoordinator = node.type === 'coordinator';
  const clickable = !!onSelect;

  return (
    <button
      type="button"
      onClick={onSelect ? () => onSelect(node.id) : undefined}
      disabled={!clickable}
      className={clickable ? 'sf-hoverable sf-press sf-focus-ring' : undefined}
      style={{
        textAlign: 'left',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 7,
        padding: '10px 11px',
        borderRadius: 9,
        background: 'var(--t-panel-2, var(--bg-elev-2))',
        border: `1px solid ${status === 'building' ? meta.color : 'var(--t-border, var(--border))'}`,
        color: 'inherit',
        fontFamily: 'inherit',
        cursor: clickable ? 'pointer' : 'default',
        // sf-hoverable / sf-press own the interactive transition when clickable;
        // keep a calm border/background transition only for the static case.
        transition: clickable
          ? undefined
          : 'border-color var(--dur-1, .15s) ease, background var(--dur-1, .15s) ease',
      }}
    >
      {/* Identity row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span
          aria-hidden
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: 13,
            fontWeight: 800,
            background: 'var(--t-accent-tint, rgba(24,144,255,.14))',
            border: `1.5px solid ${isCoordinator ? meta.color : 'var(--t-accent, #1890FF)'}`,
            color: 'var(--t-accent, #1890FF)',
          }}
        >
          {node.avatarChar || node.title.charAt(0) || '?'}
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              color: 'var(--t-fg, #FAFAFA)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {node.title || node.id}
          </div>
          <div
            style={{
              fontSize: 10.5,
              color: 'var(--t-fg-4)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={role}
          >
            {isCoordinator ? '协调者 · ' : ''}
            {role}
          </div>
        </div>
        <StatusPill meta={meta} />
      </div>

      {/* Chips row — model + tools */}
      {(model || tools.length > 0) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {model && <Chip kind="model" label={model} />}
          {tools.slice(0, 4).map((tool) => (
            <Chip key={tool} kind="tool" label={tool} />
          ))}
          {tools.length > 4 && <Chip kind="more" label={`+${tools.length - 4}`} />}
        </div>
      )}
    </button>
  );
};

const StatusPill: React.FC<{ meta: { label: string; color: string; pulse: boolean } }> = ({ meta }) => (
  <span
    style={{
      flexShrink: 0,
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      padding: '2px 7px',
      borderRadius: 999,
      fontFamily: 'var(--font-mono, monospace)',
      fontSize: 8.5,
      fontWeight: 700,
      letterSpacing: '0.1em',
      color: meta.color,
      border: `1px solid ${meta.color}`,
      background: 'transparent',
    }}
  >
    <span
      aria-hidden
      style={{
        width: 4,
        height: 4,
        borderRadius: '50%',
        background: meta.color,
        animation: meta.pulse ? 'sf-pulse 1.4s ease-in-out infinite' : undefined,
      }}
    />
    {meta.label}
  </span>
);

const Chip: React.FC<{ kind: 'model' | 'tool' | 'more'; label: string }> = ({ kind, label }) => {
  const base: React.CSSProperties = {
    fontFamily: 'var(--font-mono, monospace)',
    fontSize: 9.5,
    padding: '2px 6px',
    borderRadius: 4,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: 120,
  };
  if (kind === 'model') {
    return (
      <span
        style={{
          ...base,
          color: 'var(--t-accent, #1890FF)',
          background: 'var(--t-accent-tint, rgba(24,144,255,.14))',
          border: '1px solid var(--t-accent, #1890FF)',
          fontWeight: 600,
        }}
        title={label}
      >
        {label}
      </span>
    );
  }
  return (
    <span
      style={{
        ...base,
        color: kind === 'more' ? 'var(--t-fg-5)' : 'var(--t-fg-3)',
        background: 'var(--t-panel-3, var(--bg-elev-3))',
        border: '1px solid var(--t-border, var(--border))',
      }}
      title={label}
    >
      {label}
    </span>
  );
};

export default TeamRoster;
