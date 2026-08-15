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
import { Check, Eye, RotateCcw, AlertTriangle, Wrench } from 'lucide-react';
import ToolCallCard from './ToolCallCard';
import type { RunSessionToolCall } from '../../core/hooks/useRunSession';

export interface StepSubstepRow {
  /** e.g. "reader · identity + persona" — left column display text. */
  label: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  elapsedMs: number | null;
}

export interface StepRow {
  index: number;
  name: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  elapsedMs: number | null;
  /** When true, the row shows a "查看产出 ▸" button that opens the drawer. */
  hasArtifact: boolean;
  /**
   * S6.8 — tree-expanded substep rows beneath the parent step. Drives the
   * v3 design's `配置 Agent 角色 → reader · identity + persona / reader ·
   * model / reader · tools` indented list. When present and non-empty the
   * parent row auto-expands.
   */
  substeps?: StepSubstepRow[];
  /**
   * Tool-call visualization (clawsgo parity) — real tool invocations the agent
   * made during this step (search / fetch / read-write / shell / …). Rendered
   * as nested ToolCallCard rows beneath the step row, additively (existing
   * step rows + actions + substeps stay intact). Empty / undefined → nothing
   * extra renders, so legacy steps without tool data look exactly as before.
   */
  toolCalls?: RunSessionToolCall[];
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
        // UI5.0 — 光环跟随 --t-run 令牌（day #1447E6 / night #3B82F6）
        boxShadow: '0 0 0 3px color-mix(in oklab, var(--t-run, #3B82F6) 18%, transparent)',
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

// ── Tool-call group header ────────────────────────────────────────────────────
// Compact "工具调用 · N" label above a step's nested ToolCallCards. Surfaces
// per-step tool progress (running vs settled) the way clawsgo shows live tool
// activity. Pure derived display from the step's toolCalls — additive only.
const ToolCallGroupHeader: React.FC<{ calls: RunSessionToolCall[] }> = ({ calls }) => {
  const total = calls.length;
  const running = calls.filter((c) => c.status === 'running').length;
  const failed = calls.filter((c) => c.status === 'failed').length;
  const done = total - running - failed;
  // Aggregate the real result count across settled search-style calls so the
  // step header echoes clawsgo's "找到 N 个结果" when the runtime announced hits.
  const settledLinks = calls.reduce((n, c) => n + (c.links?.length ?? 0), 0);
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        paddingLeft: 1,
        fontSize: 10,
        color: 'var(--t-fg-5)',
        fontWeight: 600,
        letterSpacing: '.02em',
      }}
    >
      <Wrench size={10} color="var(--t-accent-bright, var(--t-accent, #1890FF))" />
      <span>工具调用</span>
      <span style={{ color: 'var(--t-fg-4)' }}>·</span>
      {running > 0 ? (
        <span style={{ color: 'var(--t-accent-bright, var(--t-accent))' }}>
          {`${done + failed}/${total} 进行中`}
        </span>
      ) : (
        <span style={{ color: failed > 0 ? 'var(--t-err, #EF4444)' : 'var(--t-ok, #10B981)' }}>
          {failed > 0 ? `${done} 完成 · ${failed} 失败` : `${total} 完成`}
        </span>
      )}
      {settledLinks > 0 && (
        <span style={{ color: 'var(--t-fg-4)' }}>{`· ${settledLinks} 个链接`}</span>
      )}
    </div>
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
            {/* S6.8 — substep tree (indented child rows). Auto-expanded
                when non-empty; no collapse toggle in MVP because the parent
                row is usually the one currently running. */}
            {step.substeps && step.substeps.length > 0 && (
              <div
                style={{
                  paddingLeft: 30,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                  marginTop: -2,
                  marginBottom: 4,
                }}
              >
                {step.substeps.map((sub, i) => (
                  <div
                    key={`${sub.label}-${i}`}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '14px 1fr auto',
                      gap: 8,
                      alignItems: 'center',
                      padding: '3px 0',
                      fontSize: 11.5,
                    }}
                  >
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 14,
                        height: 14,
                      }}
                    >
                      {sub.status === 'done' ? (
                        <Check size={11} color="var(--t-ok, #10B981)" strokeWidth={2.5} />
                      ) : sub.status === 'failed' ? (
                        <AlertTriangle size={11} color="var(--t-err, #EF4444)" />
                      ) : (
                        <span aria-hidden style={dotStyle(sub.status)} />
                      )}
                    </span>
                    <span
                      style={{
                        color: sub.status === 'pending' ? 'var(--t-fg-4)' : 'var(--t-fg-2)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={sub.label}
                    >
                      {sub.label}
                    </span>
                    <span
                      style={{
                        fontFamily: 'var(--font-mono, monospace)',
                        fontSize: 9.5,
                        color: 'var(--t-fg-4)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {formatElapsed(sub.elapsedMs, sub.status)}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {/* Tool-call visualization — clawsgo parity. Real tool invocations
                made during this step, nested as compact ToolCallCard rows.
                Additive: renders only when the step carries tool calls. */}
            {step.toolCalls && step.toolCalls.length > 0 && (
              <div
                style={{
                  paddingLeft: 26,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  marginTop: 2,
                  marginBottom: 4,
                }}
              >
                {/* Tool-call group header — at-a-glance tool activity for the
                    step (clawsgo per-step progress). Additive: a small label
                    above the existing nested cards; counts running vs done so
                    an in-flight step reads "工具调用 · 2/3". */}
                <ToolCallGroupHeader calls={step.toolCalls} />
                {step.toolCalls.map((tc) => (
                  <ToolCallCard key={tc.id} call={tc} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default StepList;
