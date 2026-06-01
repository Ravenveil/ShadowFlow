/**
 * StepArtifactDrawer — right-side slide-out drawer (440px) that renders the
 * persisted payload for a single pipeline step.
 *
 * Story S2.4 (intent-workflow-design-v1):
 *   - opened by clicking "查看产出" in <StepList>
 *   - data sources (in priority order):
 *       1. cached session.stepArtifacts[index] (populated by SSE
 *          'step-artifact' frame; instant render with zero round-trip)
 *       2. GET /api/run-sessions/:id/steps/:n via fetchStepArtifact
 *       3. fallback: "该步骤产出尚未落盘" empty state
 *   - branches on output_kind:
 *       - 'nodes'    → JSON tree inside <details>
 *       - 'edges'    → table (from → to)
 *       - 'yaml'     → mono pre with line numbers (PreviewPanel-style)
 *       - 'classify' → structured card (output_type + confidence + reasons)
 *       - 'none'     → "无产出" gray text
 *
 * Network errors that are NOT 404 surface a tiny error row; 404 collapses
 * gracefully into the "未落盘" state per the brief.
 */
import React, { useEffect, useState } from 'react';
import { X, FileText } from 'lucide-react';
import { fetchStepArtifact } from '../../api/runSessions';
import type { StepArtifact, OutputKind } from '../../api/runSessions';

export interface StepArtifactDrawerProps {
  sessionId: string;
  /** Index of the step to render. `null` keeps the drawer closed. */
  step: number | null;
  /** Display name shown in the drawer header (defaults to "step N"). */
  stepName?: string;
  /** Synchronous cache from useRunSession.stepArtifacts. */
  cached?: StepArtifact | null;
  onClose: () => void;
}

const DRAWER_WIDTH = 440;

const StepArtifactDrawer: React.FC<StepArtifactDrawerProps> = ({
  sessionId,
  step,
  stepName,
  cached,
  onClose,
}) => {
  const open = step !== null;
  const [artifact, setArtifact] = useState<StepArtifact | null>(cached ?? null);
  const [loading, setLoading] = useState(false);
  // 'missing' = 404 (designed empty state); 'error' = real network failure.
  const [state, setState] = useState<'idle' | 'missing' | 'error'>('idle');
  const [errMsg, setErrMsg] = useState<string>('');

  // Reset + (re)fetch whenever the open step changes.
  useEffect(() => {
    if (step == null) {
      setArtifact(null);
      setState('idle');
      setErrMsg('');
      return;
    }
    if (cached) {
      setArtifact(cached);
      setState('idle');
      return;
    }
    let cancelled = false;
    setLoading(true);
    setState('idle');
    fetchStepArtifact(sessionId, step)
      .then((data) => {
        if (cancelled) return;
        setArtifact(data);
        setLoading(false);
      })
      .catch((err: Error & { status?: number }) => {
        if (cancelled) return;
        setLoading(false);
        if (err.status === 404) {
          setState('missing');
        } else {
          setState('error');
          setErrMsg(err.message || 'fetch failed');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, step, cached]);

  // Escape key closes drawer.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const heading = artifact?.step_name ?? stepName ?? `step ${step}`;

  return (
    <>
      <div
        aria-hidden
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,.32)',
          zIndex: 100,
          animation: 'rs-fade-in 140ms ease',
        }}
      />
      <aside
        data-component="step-artifact-drawer"
        role="dialog"
        aria-label={`Step artifact: ${heading}`}
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          height: '100vh',
          width: DRAWER_WIDTH,
          background: 'var(--t-panel, var(--bg-elev-1))',
          borderLeft: '1px solid var(--t-border, var(--border))',
          color: 'var(--t-fg)',
          zIndex: 101,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '-8px 0 24px rgba(0,0,0,.32)',
          animation: 'rs-drawer-in 180ms ease',
          fontFamily: 'inherit',
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '14px 16px',
            borderBottom: '1px solid var(--t-border, var(--border))',
            flexShrink: 0,
          }}
        >
          <FileText size={14} color="var(--t-fg-3)" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--t-fg)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {heading}
            </span>
            <span
              style={{
                fontFamily: 'var(--font-mono, monospace)',
                fontSize: 10,
                color: 'var(--t-fg-5)',
                letterSpacing: '0.06em',
              }}
            >
              step #{step}
              {artifact?.output_kind ? ` · ${artifact.output_kind}` : ''}
              {artifact?.status ? ` · ${artifact.status}` : ''}
            </span>
          </div>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close drawer"
            title="关闭 (Esc)"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 28,
              height: 28,
              borderRadius: 6,
              border: 'none',
              background: 'transparent',
              color: 'var(--t-fg-3)',
              cursor: 'pointer',
            }}
          >
            <X size={14} />
          </button>
        </header>

        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflow: 'auto',
            padding: '16px 18px',
            fontSize: 12.5,
            color: 'var(--t-fg-2)',
          }}
        >
          {loading && <EmptyRow>正在加载…</EmptyRow>}
          {!loading && state === 'missing' && (
            <EmptyRow>该步骤产出尚未落盘</EmptyRow>
          )}
          {!loading && state === 'error' && (
            <ErrorRow message={`加载失败：${errMsg}`} />
          )}
          {!loading && state === 'idle' && artifact && (
            <ArtifactBody
              kind={artifact.output_kind}
              payload={artifact.payload}
              error={artifact.error}
            />
          )}
          {!loading && state === 'idle' && !artifact && (
            <EmptyRow>该步骤产出尚未落盘</EmptyRow>
          )}
        </div>
      </aside>
    </>
  );
};

const EmptyRow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      padding: '24px 8px',
      textAlign: 'center',
      color: 'var(--t-fg-5)',
      fontSize: 12,
    }}
  >
    {children}
  </div>
);

const ErrorRow: React.FC<{ message: string }> = ({ message }) => (
  <div
    style={{
      padding: '10px 12px',
      borderRadius: 8,
      background: 'rgba(239,68,68,.08)',
      border: '1px solid rgba(239,68,68,.32)',
      color: 'var(--t-err, #EF4444)',
      fontSize: 12,
    }}
  >
    {message}
  </div>
);

// ── Body dispatcher ──────────────────────────────────────────────────────────
const ArtifactBody: React.FC<{
  kind: OutputKind;
  payload: unknown;
  error?: string;
}> = ({ kind, payload, error }) => {
  if (error) return <ErrorRow message={error} />;
  switch (kind) {
    case 'nodes':
      return <NodesBody payload={payload} />;
    case 'edges':
      return <EdgesBody payload={payload} />;
    case 'yaml':
      return <YamlBody payload={payload} />;
    case 'classify':
      return <ClassifyBody payload={payload} />;
    case 'none':
    default:
      return <EmptyRow>无产出</EmptyRow>;
  }
};

// ── nodes ────────────────────────────────────────────────────────────────────
const NodesBody: React.FC<{ payload: unknown }> = ({ payload }) => {
  const arr = Array.isArray(payload) ? payload : [];
  if (arr.length === 0) {
    return <EmptyRow>nodes 列表为空</EmptyRow>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {arr.map((node, i) => {
        const obj = (node && typeof node === 'object' ? node : { value: node }) as Record<
          string,
          unknown
        >;
        const title =
          (typeof obj.title === 'string' && obj.title) ||
          (typeof obj.name === 'string' && obj.name) ||
          (typeof obj.id === 'string' && obj.id) ||
          `node ${i}`;
        return (
          <details
            key={i}
            style={{
              border: '1px solid var(--t-border, var(--border))',
              borderRadius: 8,
              background: 'var(--t-panel-2, var(--bg-elev-2))',
              padding: '6px 10px',
            }}
          >
            <summary
              style={{
                fontSize: 12.5,
                fontWeight: 600,
                color: 'var(--t-fg)',
                cursor: 'pointer',
                listStyle: 'revert',
                padding: '2px 0',
              }}
            >
              {title}
            </summary>
            <pre
              style={{
                margin: '6px 0 0',
                fontFamily: 'var(--font-mono, monospace)',
                fontSize: 11,
                color: 'var(--t-fg-3)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                background: 'transparent',
              }}
            >
              {safeStringify(obj)}
            </pre>
          </details>
        );
      })}
    </div>
  );
};

// ── edges ────────────────────────────────────────────────────────────────────
const EdgesBody: React.FC<{ payload: unknown }> = ({ payload }) => {
  const arr = Array.isArray(payload) ? payload : [];
  if (arr.length === 0) return <EmptyRow>edges 列表为空</EmptyRow>;
  return (
    <table
      style={{
        width: '100%',
        borderCollapse: 'collapse',
        fontFamily: 'var(--font-mono, monospace)',
        fontSize: 11.5,
      }}
    >
      <thead>
        <tr style={{ color: 'var(--t-fg-5)', textAlign: 'left' }}>
          <th style={{ padding: '6px 8px', borderBottom: '1px solid var(--t-border)' }}>from</th>
          <th style={{ padding: '6px 8px', borderBottom: '1px solid var(--t-border)' }}>→</th>
          <th style={{ padding: '6px 8px', borderBottom: '1px solid var(--t-border)' }}>to</th>
          <th style={{ padding: '6px 8px', borderBottom: '1px solid var(--t-border)' }}>status</th>
        </tr>
      </thead>
      <tbody>
        {arr.map((edge, i) => {
          const obj = (edge && typeof edge === 'object' ? edge : {}) as Record<string, unknown>;
          return (
            <tr key={i} style={{ color: 'var(--t-fg-2)' }}>
              <td style={{ padding: '4px 8px', borderBottom: '1px solid var(--t-border)' }}>
                {String(obj.from ?? '')}
              </td>
              <td style={{ padding: '4px 8px', borderBottom: '1px solid var(--t-border)', color: 'var(--t-fg-5)' }}>
                →
              </td>
              <td style={{ padding: '4px 8px', borderBottom: '1px solid var(--t-border)' }}>
                {String(obj.to ?? '')}
              </td>
              <td style={{ padding: '4px 8px', borderBottom: '1px solid var(--t-border)', color: 'var(--t-fg-4)' }}>
                {String(obj.status ?? '')}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};

// ── yaml ─────────────────────────────────────────────────────────────────────
const YamlBody: React.FC<{ payload: unknown }> = ({ payload }) => {
  const text =
    typeof payload === 'string'
      ? payload
      : payload && typeof payload === 'object'
      ? safeStringify(payload)
      : '';
  if (!text) return <EmptyRow>YAML 为空</EmptyRow>;
  const lines = text.split('\n');
  return (
    <div
      style={{
        border: '1px solid var(--t-border)',
        borderRadius: 8,
        background: 'var(--t-panel-2, var(--bg-elev-2))',
        overflow: 'hidden',
      }}
    >
      <pre
        style={{
          margin: 0,
          padding: '8px 0',
          fontFamily: 'var(--font-mono, monospace)',
          fontSize: 11,
          lineHeight: 1.55,
          color: 'var(--t-fg-2)',
          overflow: 'auto',
        }}
      >
        {lines.map((line, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, padding: '0 12px' }}>
            <span
              style={{
                color: 'var(--t-fg-5)',
                fontSize: 10,
                textAlign: 'right',
                minWidth: 28,
                userSelect: 'none',
              }}
            >
              {i + 1}
            </span>
            <span style={{ whiteSpace: 'pre' }}>{line || ' '}</span>
          </div>
        ))}
      </pre>
    </div>
  );
};

// ── classify ─────────────────────────────────────────────────────────────────
const ClassifyBody: React.FC<{ payload: unknown }> = ({ payload }) => {
  const obj = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;
  const outputType = String(obj.output_type ?? obj.outputType ?? '—');
  const confidence = typeof obj.confidence === 'number' ? obj.confidence : null;
  const reasonsRaw = obj.reasons ?? obj.reason;
  const reasons: string[] = Array.isArray(reasonsRaw)
    ? reasonsRaw.map((r) => String(r))
    : typeof reasonsRaw === 'string'
    ? [reasonsRaw]
    : [];

  return (
    <div
      style={{
        border: '1px solid var(--t-border)',
        borderRadius: 10,
        background: 'var(--t-panel-2, var(--bg-elev-2))',
        padding: '12px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <ClassifyRow label="output_type" value={outputType} mono />
      {confidence != null && (
        <ClassifyRow
          label="confidence"
          value={`${(confidence * 100).toFixed(1)}%`}
          mono
        />
      )}
      {reasons.length > 0 && (
        <div>
          <div
            style={{
              fontSize: 10.5,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--t-fg-5)',
              marginBottom: 6,
            }}
          >
            reasons
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--t-fg-2)' }}>
            {reasons.map((r, i) => (
              <li key={i} style={{ fontSize: 12, lineHeight: 1.55 }}>
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

const ClassifyRow: React.FC<{ label: string; value: string; mono?: boolean }> = ({
  label,
  value,
  mono,
}) => (
  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
    <span
      style={{
        fontSize: 10.5,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--t-fg-5)',
        minWidth: 92,
      }}
    >
      {label}
    </span>
    <span
      style={{
        fontFamily: mono ? 'var(--font-mono, monospace)' : 'inherit',
        fontSize: 12.5,
        color: 'var(--t-fg)',
      }}
    >
      {value}
    </span>
  </div>
);

// ── helpers ──────────────────────────────────────────────────────────────────
function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export default StepArtifactDrawer;
