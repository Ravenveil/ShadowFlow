/**
 * OverviewPanel — right-pane Overview tab content.
 *
 * Maps the design-spec `.vpane[data-pane="overview"]` to real run state:
 *   - run heading + concise description
 *   - status flags row (streaming / complete / error — derived from session)
 *   - "Open in Editor" link (live URL when artifactUrl is ready)
 *   - Team summary: workflow-dag row + one row per agent node
 *
 * No mocked content — empty session shows an empty state, not fake rows.
 * The "needs review" callouts from the design demo (paper.reader.v1, retry
 * budget) are intentionally omitted: those concepts don't exist in the
 * current backend, and adding placeholder text would violate the "no mock"
 * rule.
 */
import React from 'react';
import { Check, Circle, ExternalLink } from 'lucide-react';
import type { UseRunSessionReturn } from '../../core/hooks/useRunSession';

interface OverviewPanelProps {
  session: UseRunSessionReturn;
  /** Optional handler when user clicks a Team row. */
  onSelectAgent?: (nodeId: string) => void;
  /** Optional handler when user clicks "Open in Editor". */
  onOpenEditor?: () => void;
}

const statusDot = (kind: 'run' | 'ok' | 'idle'): React.CSSProperties => ({
  width: 6,
  height: 6,
  borderRadius: '50%',
  background: kind === 'run' ? 'var(--t-run, #3B82F6)' : kind === 'ok' ? 'var(--t-ok, #10B981)' : 'var(--t-fg-5)',
  animation: kind === 'run' ? 'sf-pulse 1.4s ease-in-out infinite' : undefined,
  flexShrink: 0,
});

const OverviewPanel: React.FC<OverviewPanelProps> = ({ session, onSelectAgent, onOpenEditor }) => {
  const isStreaming = !session.isComplete && session.error == null;
  const flagsState = {
    live: isStreaming || session.isComplete,
    complete: session.isComplete,
    error: session.error != null,
  };

  // ── hermes-style observability — all derived from existing session state.
  // Step progress: count done vs total announced steps.
  const totalSteps = session.steps.length;
  const doneSteps = session.steps.filter((s) => s.status === 'done').length;
  const runningStep = session.steps.find((s) => s.status === 'running');
  const progressPct = totalSteps > 0 ? Math.round((doneSteps / totalSteps) * 100) : 0;

  // Elapsed: sum of per-step elapsed strings (e.g. "1.4s"). The hook stores
  // elapsed as a formatted string; parse the leading number back to seconds so
  // we can present a single run total without touching the backend.
  const elapsedSec = session.steps.reduce((acc, s) => {
    if (!s.elapsed) return acc;
    const n = parseFloat(s.elapsed);
    return Number.isFinite(n) ? acc + n : acc;
  }, 0);
  const elapsedLabel = elapsedSec > 0
    ? elapsedSec < 60
      ? `${elapsedSec.toFixed(1)}s`
      : `${Math.floor(elapsedSec / 60)}m ${Math.round(elapsedSec % 60)}s`
    : null;

  // Artifact count — blueprint + any persisted per-step artifacts.
  const stepArtifactCount = Object.keys(session.stepArtifacts).length;
  const artifactCount = (session.blueprintFile ? 1 : 0) + stepArtifactCount;

  // Reasoning + roster size for the observability strip.
  const thinkingCount = session.thinkingStream.length;
  const readyNodes = session.nodes.filter((n) => n.status === 'ready').length;

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        overflow: 'auto',
        padding: '24px 28px',
        color: 'var(--t-fg-2)',
        fontSize: 13,
        lineHeight: 1.55,
      }}
      data-component="overview-panel"
    >
      <h1
        style={{
          fontSize: 18,
          fontWeight: 600,
          margin: 0,
          marginBottom: 4,
          color: 'var(--t-fg, #FAFAFA)',
        }}
      >
        Run session
      </h1>
      <p style={{ margin: 0, marginBottom: 16, color: 'var(--t-fg-3)', fontSize: 12.5 }}>
        {session.error
          ? '本次 run 已停止（出错）。请查看左侧错误详情。'
          : session.isComplete
          ? '本次 run 已完成。可切到 Preview 看产物，或去聊天继续。'
          : 'AI 团队正在构建中。右侧 tab 会随步骤进度自动跟随。'}
      </p>

      {/* Status flags row */}
      <div
        style={{
          display: 'flex',
          gap: 14,
          flexWrap: 'wrap',
          padding: '10px 12px',
          background: 'var(--t-panel-2, var(--bg-elev-2))',
          borderRadius: 8,
          border: '1px solid var(--t-border, var(--border))',
          marginBottom: 14,
        }}
      >
        <Flag label="流式中" active={isStreaming} />
        <Flag label="已完成" active={flagsState.complete} />
        <Flag label="出错" active={flagsState.error} tone="warn" />
      </div>

      {/* hermes-style observability — calm run summary. Output type / mode /
          step progress / elapsed / tokens / artifacts. Every value comes
          straight from session state; nothing rendered when truly empty. */}
      <SectionLabel>运行概览</SectionLabel>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
          gap: 8,
          marginBottom: 14,
        }}
      >
        <Stat label="输出类型" value={session.outputType ?? '推断中…'} />
        <Stat label="模式" value={session.mode ?? '—'} />
        <Stat
          label="Agents"
          value={
            session.nodes.length === 0
              ? '—'
              : `${readyNodes}/${session.nodes.length} 就绪`
          }
          accent={readyNodes > 0 && readyNodes === session.nodes.length}
        />
        <Stat
          label="Tokens"
          value={session.tokenCount > 0 ? session.tokenCount.toLocaleString() : '0'}
          mono
        />
        <Stat label="耗时" value={elapsedLabel ?? '—'} mono />
        <Stat label="产物" value={artifactCount > 0 ? `${artifactCount}` : '—'} mono />
      </div>

      {/* Step progress — a single calm bar with done/total + current step. */}
      {totalSteps > 0 && (
        <div
          style={{
            padding: '12px 14px',
            background: 'var(--t-panel-2, var(--bg-elev-2))',
            borderRadius: 8,
            border: '1px solid var(--t-border, var(--border))',
            marginBottom: 14,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 8,
              fontSize: 12,
            }}
          >
            <span aria-hidden style={statusDot(isStreaming ? 'run' : 'ok')} />
            <span style={{ color: 'var(--t-fg-2)', fontWeight: 500 }}>步骤进度</span>
            <span style={{ flex: 1 }} />
            <span
              style={{
                fontFamily: 'var(--font-mono, monospace)',
                fontSize: 11,
                color: 'var(--t-fg-4)',
              }}
            >
              {doneSteps}/{totalSteps} · {progressPct}%
            </span>
          </div>
          <div
            style={{
              height: 5,
              borderRadius: 3,
              background: 'var(--t-panel-3, var(--bg-elev-3))',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${progressPct}%`,
                height: '100%',
                borderRadius: 3,
                background: session.error
                  ? 'var(--t-warn, #F59E0B)'
                  : isStreaming
                  ? 'var(--t-run, #3B82F6)'
                  : 'var(--t-ok, #10B981)',
                transition: 'width var(--dur-2, .3s) var(--ease-out, ease)',
              }}
            />
          </div>
          {runningStep && (
            <div
              style={{
                marginTop: 8,
                fontSize: 11.5,
                color: 'var(--t-fg-3)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                minWidth: 0,
              }}
            >
              <span style={{ color: 'var(--t-fg-5)' }}>正在执行</span>
              <code
                style={{
                  fontFamily: 'var(--font-mono, monospace)',
                  fontSize: 11,
                  color: 'var(--t-fg-2)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {runningStep.name}
              </code>
              {thinkingCount > 0 && (
                <>
                  <span style={{ flex: 1 }} />
                  <span style={{ color: 'var(--t-fg-5)', fontFamily: 'var(--font-mono, monospace)', fontSize: 10.5 }}>
                    {thinkingCount} 条推理
                  </span>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Open in Editor */}
      {session.artifactUrl && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 12px',
            background: 'var(--t-panel-2, var(--bg-elev-2))',
            borderRadius: 8,
            border: '1px solid var(--t-border, var(--border))',
            marginBottom: 14,
          }}
        >
          <span style={{ fontSize: 12, color: 'var(--t-fg-4)' }}>Open this run</span>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            onClick={onOpenEditor}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '4px 10px',
              borderRadius: 6,
              background: 'transparent',
              border: '1px solid var(--t-border-2, var(--border-strong))',
              color: 'var(--t-fg-2)',
              fontSize: 11.5,
              cursor: 'pointer',
            }}
          >
            <ExternalLink size={11} /> Open in Editor
          </button>
        </div>
      )}

      {/* Team summary */}
      <div style={{ marginBottom: 14 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 10.5,
            letterSpacing: '0.08em',
            color: 'var(--t-fg-5)',
            textTransform: 'uppercase',
            fontWeight: 600,
            marginBottom: 8,
          }}
        >
          <span>Team</span>
          <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 10 }}>
            {session.nodes.length}
          </span>
        </div>
        {session.nodes.length === 0 ? (
          <div style={{ color: 'var(--t-fg-5)', fontSize: 12, padding: '8px 0' }}>
            等待 Agent 节点生成…
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <RowItem
              chev
              name="workflow-dag"
              meta={`canvas · ${session.nodes.length} nodes · ${session.edges.length} edges`}
              dot={isStreaming ? 'run' : 'ok'}
            />
            {session.nodes.map((n) => (
              <RowItem
                key={n.id}
                chev
                name={n.title || n.id}
                meta={n.sub || n.type}
                dot={n.status === 'building' ? 'run' : n.status === 'ready' ? 'ok' : 'idle'}
                onClick={onSelectAgent ? () => onSelectAgent(n.id) : undefined}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      fontSize: 10.5,
      letterSpacing: '0.08em',
      color: 'var(--t-fg-5)',
      textTransform: 'uppercase',
      fontWeight: 600,
      marginBottom: 8,
    }}
  >
    {children}
  </div>
);

const Stat: React.FC<{ label: string; value: string; mono?: boolean; accent?: boolean }> = ({
  label,
  value,
  mono,
  accent,
}) => (
  <div
    style={{
      padding: '9px 11px',
      background: 'var(--t-panel-2, var(--bg-elev-2))',
      borderRadius: 8,
      border: '1px solid var(--t-border, var(--border))',
      minWidth: 0,
    }}
  >
    <div
      style={{
        fontSize: 9.5,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: 'var(--t-fg-5)',
        fontWeight: 600,
        marginBottom: 4,
      }}
    >
      {label}
    </div>
    <div
      style={{
        fontSize: 14,
        fontWeight: 600,
        color: accent ? 'var(--t-ok, #10B981)' : 'var(--t-fg, #FAFAFA)',
        fontFamily: mono ? 'var(--font-mono, monospace)' : 'inherit',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}
      title={value}
    >
      {value}
    </div>
  </div>
);

const Flag: React.FC<{ label: string; active: boolean; tone?: 'normal' | 'warn' }> = ({
  label,
  active,
  tone = 'normal',
}) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      fontSize: 12,
      color: active
        ? tone === 'warn'
          ? 'var(--t-warn, #F59E0B)'
          : 'var(--t-fg-2)'
        : 'var(--t-fg-5)',
    }}
  >
    {active ? (
      <Check size={11} color={tone === 'warn' ? 'var(--t-warn, #F59E0B)' : 'var(--t-ok, #10B981)'} strokeWidth={2.5} />
    ) : (
      <Circle size={9} color="var(--t-fg-5)" />
    )}
    {label}
  </span>
);

const RowItem: React.FC<{
  chev?: boolean;
  name: string;
  meta: string;
  dot: 'run' | 'ok' | 'idle';
  onClick?: () => void;
}> = ({ chev, name, meta, dot, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={!onClick}
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '8px 10px',
      borderRadius: 7,
      background: 'transparent',
      border: '1px solid var(--t-border, var(--border))',
      color: 'inherit',
      fontFamily: 'inherit',
      cursor: onClick ? 'pointer' : 'default',
      textAlign: 'left',
      width: '100%',
    }}
  >
    {chev && <span style={{ color: 'var(--t-fg-5)', fontSize: 11 }}>›</span>}
    <span style={{ fontSize: 12.5, color: 'var(--t-fg-2)', fontWeight: 500 }}>{name}</span>
    <span style={{ flex: 1 }} />
    <span style={{ fontSize: 10.5, color: 'var(--t-fg-5)', fontFamily: 'var(--font-mono, monospace)' }}>
      {meta}
    </span>
    <span aria-hidden style={statusDot(dot)} />
  </button>
);

export default OverviewPanel;
