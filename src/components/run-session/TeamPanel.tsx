/**
 * TeamPanel — content for the "Team" tab of the RunSession right pane.
 *
 * Composition:
 *   - <BlueprintCanvas /> fills the panel and renders the live DAG.
 *   - <PolicyMatrixMini /> is absolutely positioned at top-right (262px),
 *     mirroring the design-spec `.team-canvas > .pm-mini` overlay.
 *
 * Data wiring: this panel reads `session.nodes` + `session.edges` from
 * the already-mounted `useRunSession(sessionId)` instance. The hook owns
 * the SSE subscription and lives one level up in `RunSessionPage`, so we
 * MUST take the session via prop rather than calling `useRunSession()`
 * here — otherwise we'd open a duplicate SSE stream.
 */
import React from 'react';
import type { useRunSession } from '../../core/hooks/useRunSession';
import BlueprintCanvas from './BlueprintCanvas';
import PolicyMatrixMini from './PolicyMatrixMini';

export interface TeamPanelProps {
  session: ReturnType<typeof useRunSession>;
}

const TeamPanel: React.FC<TeamPanelProps> = ({ session }) => {
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
      <BlueprintCanvas nodes={session.nodes} edges={session.edges} isComplete={session.isComplete} />
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
        <PolicyMatrixMini agents={session.nodes} isComplete={session.isComplete} />
      </div>
    </div>
  );
};

export default TeamPanel;
