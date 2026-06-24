/**
 * TeamPanel — content for the "Team" tab of the RunSession right pane.
 *
 * Composition:
 *   - <BlueprintCanvas /> fills the panel and renders the live DAG.
 *   - <PolicyMatrixMini /> is absolutely positioned at top-right (262px),
 *     mirroring the design-spec `.team-canvas > .pm-mini` overlay.
 *   - <TeamRoster /> (2026-06-24, this stream) is a left-side overlay that
 *     turns the canvas into a real "team feeling": one card per agent node
 *     with avatar, name, role/persona, model + tool chips, and a live status
 *     pill (building / ready / pending). Additive — the canvas + policy matrix
 *     are untouched; the roster floats above the empty left gutter.
 *
 * Data wiring: this panel reads `session.nodes` + `session.edges` from
 * the already-mounted `useRunSession(sessionId)` instance. The hook owns
 * the SSE subscription and lives one level up in `RunSessionPage`, so we
 * MUST take the session via prop rather than calling `useRunSession()`
 * here — otherwise we'd open a duplicate SSE stream. No mock data: every
 * roster card is a real node, and an empty roster renders nothing.
 */
import React from 'react';
import type { useRunSession, RunSessionNode } from '../../core/hooks/useRunSession';
import BlueprintCanvas from './BlueprintCanvas';
import PolicyMatrixMini from './PolicyMatrixMini';
import { TeamRoster } from './TeamRoster';

export interface TeamPanelProps {
  session: ReturnType<typeof useRunSession>;
  /** Optional — jump to the Agent tab focused on a node when a card is clicked. */
  onSelectAgent?: (nodeId: string) => void;
}

const TeamPanel: React.FC<TeamPanelProps> = ({ session, onSelectAgent }) => {
  const nodes: RunSessionNode[] = session.nodes;
  return (
    <div
      data-testid="team-panel"
      style={{
        position: 'relative',
        flex: 1,
        height: '100%',
        minHeight: 0,
        overflow: 'hidden',
        background: 'var(--t-bg, #0a0a0a)',
      }}
    >
      <BlueprintCanvas nodes={nodes} edges={session.edges} isComplete={session.isComplete} />

      {/* Left-side roster overlay — the "real team" view. Only mounts once a
          node exists; otherwise we let the canvas show its own empty state. */}
      {nodes.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: 16,
            left: 16,
            bottom: 16,
            width: 252,
            zIndex: 5,
            pointerEvents: 'auto',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          }}
        >
          <TeamRoster
            agents={nodes}
            edges={session.edges}
            isStreaming={session.isStreaming}
            onSelectAgent={onSelectAgent}
          />
        </div>
      )}

      <div
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          width: 262,
          zIndex: 5,
          pointerEvents: 'auto',
        }}
      >
        <PolicyMatrixMini agents={nodes} isComplete={session.isComplete} />
      </div>
    </div>
  );
};

export default TeamPanel;
