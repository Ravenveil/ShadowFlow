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
