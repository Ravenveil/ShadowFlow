/**
 * AgentEmptyState — shown by AgentPanel when `session.nodes` is empty
 * (no agent nodes have arrived yet over SSE). Honest "waiting" UI, no
 * mocked agent rows.
 *
 * Layout / tokens follow run-session-v2.html `.ag-empty` class block
 * (lines ~620-628). One idle pulsing dot + a short headline + a body
 * description. No CTA — agents land automatically via the run stream,
 * the user can't manually trigger them from this empty state.
 */
import React from 'react';

const AgentEmptyState: React.FC = () => {
  return (
    <div
      data-stub="agent-panel-empty"
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        style={{
          padding: '28px 22px',
          borderRadius: 14,
          border: '1.5px dashed var(--border)',
          background: 'var(--bg-elev-1)',
          display: 'grid',
          placeItems: 'center',
          textAlign: 'center',
          maxWidth: 420,
        }}
      >
        <span
          aria-hidden
          style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: 'var(--fg-5, #6b7280)',
            animation: 'sf-pulse 1.4s ease-in-out infinite',
            marginBottom: 12,
          }}
        />
        <div
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: 'var(--fg-2)',
            marginBottom: 6,
            letterSpacing: '-0.01em',
          }}
        >
          等待 Agent 节点生成…
        </div>
        <div
          style={{
            fontSize: 12,
            color: 'var(--fg-4)',
            maxWidth: 360,
            lineHeight: 1.5,
            fontFamily: 'var(--font-mono, monospace)',
          }}
        >
          组装阶段会通过 SSE 推送 agent 节点；当首个节点到达后这里会渲染 5 槽
          timeline + persona prompt + tools + I/O 契约。
        </div>
      </div>
    </div>
  );
};

export default AgentEmptyState;
