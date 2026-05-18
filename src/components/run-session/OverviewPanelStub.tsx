/**
 * OverviewPanelStub — placeholder panel rendered inside the "Overview" tab
 * of RightPaneTabs. agent-3 will replace this file's default export with
 * the real Run Session overview / status / policy summary implementation.
 *
 * Contract for the replacement:
 *   - default export must be a React.FC (no required props)
 *   - root element should fill its container (height: 100%)
 *   - read live session state via useRunSession() inside the component
 *
 * DO NOT mock data here. Keep this file as a simple placeholder until
 * the real panel lands.
 */
import React from 'react';

const OverviewPanelStub: React.FC = () => {
  return (
    <div
      data-stub="overview-panel"
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--t-fg-4)',
        fontFamily: 'var(--font-mono, monospace)',
        fontSize: 12,
        padding: 24,
      }}
    >
      [OverviewPanel — agent-3 will fill]
    </div>
  );
};

export default OverviewPanelStub;
