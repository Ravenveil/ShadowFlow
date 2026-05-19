/**
 * StepList — vertical pipeline step rows for the RunSession left stream.
 *
 * Story S0.3 (intent-workflow-design-v1): extract the step rendering that
 * previously lived inline inside RunSessionPage.tsx (ProgressSteps fn) and
 * OverviewPanel.tsx into a single reusable component. Each row shows:
 *   - status dot (pending / running / done / failed)
 *   - step name
 *   - elapsed ms in mono font
 *   - inline actions: "查看产出" (when hasArtifact) and "重跑" (when done/failed)
 *
 * Story S4.3 (StepRetryButton): retry button is rendered inline here per the
 * brief's recommendation — RotateCcw icon + 2s disabled cooldown after click,
 * non-fatal 404 toast handled by parent (RunSessionPage) via onStepRetry which
 * returns a Promise<boolean> (true = accepted, false = endpoint missing).
 *
 * Pure presentational + minimal local state for the per-row retry cooldown.
 */
import React, { useState } from 'react';
import { Check, Eye, RotateCcw, AlertTriangle } from 'lucide-react';

export interface StepRow {
  index: number;
  name: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  elapsedMs: number | null;
  /** When true, the row shows a "查看产出 ▸" button that opens the drawer. */
  hasArtifact: boolean;
}

export interface StepListProps {
  steps: StepRow[];
  /** Open StepArtifactDrawer for the given step index. */
  onStepView: (index: number) => void;
  /**
   * Trigger a step retry. Resolves to true when the daemon accepted the
   * request, false when the endpoint is missing (404 / 405). The component
   * disables the button for 2 s either way so accidental double-clicks are
   * absorbed.
   */
  onStepRetry: (index: number) => Promise<boolean> | void;
}

// ── Status dot ───────────────────────────────────────────────────────────────
const dotStyle = (status: StepRow['status']): React.CSSProperties => {
  const base: React.CSSProperties = {
    width: 8,
    height: 8,
    borderRadius: '50%',
    flexShrink: 0,
    display: 'inline-block',
  };
  switch (status) {
    case 'running':
      return {
        ...base,
        background: 'var(--t-run, #3B82F6)',
        boxShadow: '0 0 0 3px rgba(59,130,246,.18)',
        animation: 'sf-pulse 1.4s ease-in-out infinite',
      };
    case 'done':
      return { ...base, background: 'var(--t-ok, #10B981)' };
    case 'failed':
      return { ...base, background: 'var(--t-err, #EF4444)' };
    case 'pending':
    default:
      return { ...base, background: 'var(--t-fg-5)', opacity: 0.5 };
  }
};

function formatElapsed(ms: number | null, status: StepRow['status']): string {
  if (ms == null || ms <= 0) return status === 'running' ? '…' : '';
  const sec = ms / 1000;
  if (sec < 1) return `${ms}ms`;
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const m = Math.floor(sec / 60);
  const r = Math.round(sec % 60);
  return `${m}m${r}s`;
}

// ── Inline action button (reused for view + retry) ───────────────────────────
const ActionButton: React.FC<{
  onClick: () => void;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}> = ({ onClick, disabled, title, children }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={title}
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      padding: '3px 8px',
      borderRadius: 6,
      background: 'transparent',
      border: '1px solid var(--t-border, var(--border))',
      color: disabled ? 'var(--t-fg-5)' : 'var(--t-fg-3)',
      fontSize: 10.5,
      fontFamily: 'inherit',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.55 : 1,
      whiteSpace: 'nowrap',
      lineHeight: 1.2,
    }}
  >
    {children}
  </button>
);

// ── Per-row retry button (encapsulates the 2 s cooldown locally) ─────────────
const StepRowRetry: React.FC<{
  index: number;
  status: StepRow['status'];
  onStepRetry: StepListProps['onStepRetry'];
}> = ({ index, status, onStepRetry }) => {
  const [pending, setPending] = useState(false);
  const [missing, setMissing] = useState(false);

  if (status !== 'done' && status !== 'failed') return null;

  const handleClick = async () => {
    if (pending) return;
    setPending(true);
    try {
      const result = onStepRetry(index);
      const accepted = result instanceof Promise ? await result : true;
      if (!accepted) setMissing(true);
    } finally {
      // 2-second cooldown regardless of outcome so accidental double clicks
      // don't fire two POSTs back-to-back.
      setTimeout(() => {
        setPending(false);
        setMissing(false);
      }, 2000);
    }
  };

  return (
    <ActionButton
      onClick={handleClick}
      disabled={pending}
      title={missing ? '该端点尚未实现' : '重跑此步骤'}
    >
      {missing ? (
        <AlertTriangle size={10} />
      ) : (
        <RotateCcw size={10} style={{ animation: pending ? 'sf-spin 1s linear infinite' : undefined }} />
      )}
      {pending ? (missing ? '未实现' : '已发送') : '重跑'}
    </ActionButton>
  );
};

// ── Main list ────────────────────────────────────────────────────────────────
const StepList: React.FC<StepListProps> = ({ steps, onStepView, onStepRetry }) => {
  if (steps.length === 0) {
    return (
      <div
        style={{
          padding: '10px 12px',
          fontSize: 12,
          color: 'var(--t-fg-5)',
          fontFamily: 'inherit',
        }}
      >
        等待开始…
      </div>
    );
  }
  return (
    <div
      data-component="step-list"
      style={{
        border: '1px solid var(--t-border)',
        borderRadius: 14,
        background: 'var(--t-panel)',
        padding: 6,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      {steps.map((step, idx) => {
        const isActive = step.status === 'running';
        return (
          <div key={`${step.index}-${step.name}`} style={{ position: 'relative' }}>
            {idx < steps.length - 1 && (
              <div
                aria-hidden
                style={{
                  position: 'absolute',
                  left: 16 + 6 - 1,
                  top: 22 + 9,
                  width: 1,
                  height: 14,
                  background: 'var(--t-border)',
                  zIndex: 0,
                }}
              />
            )}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '22px 1fr auto auto auto',
                gap: 8,
                alignItems: 'center',
                padding: '9px 10px',
                borderRadius: 10,
                background: isActive ? 'var(--t-accent-tint)' : 'transparent',
                border: isActive
                  ? '1px solid var(--t-accent)'
                  : '1px solid transparent',
              }}
            >
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 22,
                  height: 22,
                }}
              >
                {step.status === 'done' ? (
                  <Check size={13} color="var(--t-ok, #10B981)" strokeWidth={2.5} />
                ) : step.status === 'failed' ? (
                  <AlertTriangle size={13} color="var(--t-err, #EF4444)" />
                ) : (
                  <span aria-hidden style={dotStyle(step.status)} />
                )}
              </span>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: step.status === 'pending' ? 500 : 600,
                  color: step.status === 'pending' ? 'var(--t-fg-4)' : 'var(--t-fg)',
                  lineHeight: 1.3,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={step.name}
              >
                {step.name}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-mono, monospace)',
                  fontSize: 10,
                  color:
                    step.status === 'running'
                      ? 'var(--t-accent-bright)'
                      : step.status === 'failed'
                      ? 'var(--t-err, #EF4444)'
                      : 'var(--t-fg-4)',
                  whiteSpace: 'nowrap',
                }}
              >
                {formatElapsed(step.elapsedMs, step.status)}
              </span>
              {step.hasArtifact ? (
                <ActionButton
                  onClick={() => onStepView(step.index)}
                  title="查看该步骤产出"
                >
                  <Eye size={10} />
                  查看产出
                </ActionButton>
              ) : (
                <span />
              )}
              <StepRowRetry
                index={step.index}
                status={step.status}
                onStepRetry={onStepRetry}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default StepList;
