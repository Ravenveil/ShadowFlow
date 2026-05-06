/**
 * TraceView — Story 4.4 节点详情面板。
 *
 * Renders four collapsible sections for a selected node:
 *   1. Inputs       — JSON viewer (auto-collapse > 2KB).
 *   2. Outputs      — content-type aware (json / markdown / plain).
 *   3. Timeline     — retry-preserving vertical event log.
 *   4. Error        — code / message / stack (if failed).
 *
 * Reads `selectedNodeId` + per-node timeline from `useRunStore`.
 */

import { useMemo, useState } from 'react';
import { useRunStore, NodeState, TimelineEvent } from '../../stores/useRunStore';

const PANEL_WIDTH = 480;
const INPUTS_AUTO_COLLAPSE_BYTES = 2048;

const SENSITIVE_KEYS = /(api_key|apikey|password|token|secret)/i;

interface SectionProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function Section({ title, defaultOpen = true, children }: SectionProps): JSX.Element {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%',
          textAlign: 'left',
          padding: '10px 14px',
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '.1em',
          textTransform: 'uppercase',
          color: 'var(--fg-3)',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
        }}
      >
        {open ? '▾' : '▸'} {title}
      </button>
      {open && <div style={{ padding: '0 14px 14px' }}>{children}</div>}
    </div>
  );
}

function maskSensitive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(maskSensitive);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.test(k)) {
        out[k] = '***';
      } else {
        out[k] = maskSensitive(v);
      }
    }
    return out;
  }
  return value;
}

function JsonBlock({ data, label }: { data: unknown; label: string }): JSX.Element {
  const hasValue = data !== undefined && data !== null;
  const masked = useMemo(() => maskSensitive(data), [data]);
  const text = useMemo(() => {
    if (!hasValue) return '';
    try {
      return JSON.stringify(masked, null, 2) ?? String(masked);
    } catch {
      return String(masked);
    }
  }, [masked, hasValue]);
  const size = text.length;
  const [expanded, setExpanded] = useState(size <= INPUTS_AUTO_COLLAPSE_BYTES);

  if (!hasValue) {
    return <div style={{ fontSize: 12, color: 'var(--fg-5)' }}>(no {label})</div>;
  }

  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--fg-5)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>
        {size}B {size > INPUTS_AUTO_COLLAPSE_BYTES ? '· auto-collapsed' : ''}
      </div>
      {expanded ? (
        <pre
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            background: 'var(--bg-elev-1)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: 10,
            margin: 0,
            maxHeight: 260,
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {text}
        </pre>
      ) : (
        <button
          onClick={() => setExpanded(true)}
          style={{
            fontSize: 11,
            padding: '6px 10px',
            background: 'var(--bg-elev-1)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            color: 'var(--accent-bright)',
            cursor: 'pointer',
          }}
        >
          Show {label} ({size}B)
        </button>
      )}
    </div>
  );
}

function OutputsBlock({ node }: { node: NodeState }): JSX.Element {
  const out = node.outputs ?? node.output;
  const contentType = node.contentType ?? 'text/plain';

  if (out === undefined || out === null || out === '') {
    return <div style={{ fontSize: 12, color: 'var(--fg-5)' }}>(no output)</div>;
  }

  if (contentType.startsWith('application/json')) {
    return <JsonBlock data={out} label="output" />;
  }

  if (contentType.startsWith('text/markdown')) {
    // Minimal markdown rendering (avoid new dep) — preserve line breaks + basic headings
    const text = String(out);
    return (
      <div
        style={{
          fontSize: 13,
          lineHeight: 1.55,
          color: 'var(--fg-2)',
          whiteSpace: 'pre-wrap',
        }}
      >
        {text}
      </div>
    );
  }

  return (
    <pre
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        background: 'var(--bg-elev-1)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        padding: 10,
        margin: 0,
        whiteSpace: 'pre-wrap',
      }}
    >
      {String(out)}
    </pre>
  );
}

const TIMELINE_COLORS: Record<TimelineEvent['kind'], string> = {
  started:   'var(--accent)',
  retried:   '#F59E0B',
  succeeded: '#22C55E',
  rejected:  '#EF4444',
  failed:    '#B91C1C',
};

function TimelineRow({ event }: { event: TimelineEvent }): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const color = TIMELINE_COLORS[event.kind];
  const time = event.at ? event.at.slice(11, 19) : '';
  return (
    <li style={{ position: 'relative', paddingLeft: 22, marginBottom: 10 }}>
      <span
        aria-hidden
        style={{
          position: 'absolute',
          left: 6,
          top: 6,
          width: 10,
          height: 10,
          borderRadius: '50%',
          background: color,
          boxShadow: `0 0 0 3px ${color}33`,
        }}
      />
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-3)' }}>
          {time}
        </span>
        <span style={{ fontSize: 12, fontWeight: 700, color }}>
          {event.kind}
        </span>
        <span style={{ fontSize: 11, color: 'var(--fg-5)' }}>
          #{event.attempt}
        </span>
      </div>
      {event.fail_reason && (
        <div style={{ fontSize: 11, color: 'var(--fg-4)', marginTop: 2 }}>
          {event.fail_reason}
        </div>
      )}
      {(event.inputs !== undefined || event.outputs !== undefined) && (
        <button
          onClick={() => setExpanded((x) => !x)}
          style={{
            fontSize: 10,
            color: 'var(--accent-bright)',
            background: 'transparent',
            border: 'none',
            padding: 0,
            marginTop: 4,
            cursor: 'pointer',
            textDecoration: 'underline',
          }}
        >
          {expanded ? 'Hide' : 'Replay'} attempt #{event.attempt}
        </button>
      )}
      {expanded && (
        <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {event.inputs !== undefined && <JsonBlock data={event.inputs} label="inputs" />}
          {event.outputs !== undefined && <JsonBlock data={event.outputs} label="outputs" />}
        </div>
      )}
    </li>
  );
}

export interface TraceViewProps {
  /** Optional external control: when provided overrides store-driven selection. */
  nodeId?: string | null;
  /** Called when the user clicks × to close. Defaults to clearing store selection. */
  onClose?: () => void;
}

export function TraceView({ nodeId, onClose }: TraceViewProps = {}): JSX.Element | null {
  const storeSelected = useRunStore((s) => s.selectedNodeId);
  const effectiveId = nodeId !== undefined ? nodeId : storeSelected;
  const node = useRunStore((s) => (effectiveId ? s.nodes[effectiveId] : undefined));
  const selectFromStore = useRunStore((s) => s.selectNode);

  const open = Boolean(effectiveId);

  const close = () => {
    if (onClose) onClose();
    else selectFromStore(null);
  };

  return (
    <aside
      data-testid="trace-view"
      aria-label="TraceView"
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: PANEL_WIDTH,
        background: 'var(--skin-panel, #0F0F11)',
        borderLeft: '1px solid var(--border)',
        transform: open ? 'translateX(0)' : `translateX(${PANEL_WIDTH}px)`,
        transition: 'transform 280ms ease-out',
        zIndex: 40,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-elev-1)',
        }}
      >
        <div>
          <div style={{ fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--fg-5)' }}>
            TraceView
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--fg-0)' }}>
            {effectiveId ?? '—'}
          </div>
        </div>
        <button
          aria-label="Close TraceView"
          onClick={close}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--fg-3)',
            fontSize: 18,
            cursor: 'pointer',
            padding: '4px 8px',
          }}
        >
          ×
        </button>
      </header>

      {open && !node && (
        <div style={{ padding: 20, color: 'var(--fg-4)', fontSize: 13 }}>
          No node state yet. Waiting for events…
        </div>
      )}

      {node && (
        <div style={{ flex: 1, overflow: 'auto' }}>
          <Section title="Inputs">
            <JsonBlock data={node.inputs} label="inputs" />
          </Section>
          <Section title="Outputs">
            <OutputsBlock node={node} />
          </Section>
          <Section title={`Timeline (${node.timeline.length})`}>
            {node.timeline.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--fg-5)' }}>(no events yet)</div>
            ) : (
              <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {node.timeline.map((evt, idx) => (
                  <TimelineRow key={idx} event={evt} />
                ))}
              </ol>
            )}
          </Section>
          <Section title="Error" defaultOpen={Boolean(node.error)}>
            {node.error ? (
              <pre
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  background: '#1a0f12',
                  border: '1px solid #EF444455',
                  borderRadius: 6,
                  color: '#FCA5A5',
                  padding: 10,
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                  maxHeight: 200,
                  overflow: 'auto',
                }}
              >
                {node.error}
              </pre>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--fg-5)' }}>(no error)</div>
            )}
          </Section>
        </div>
      )}
    </aside>
  );
}

export default TraceView;
