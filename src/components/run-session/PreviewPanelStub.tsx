/**
 * PreviewPanelStub — placeholder panel rendered inside the "Preview" tab
 * of RightPaneTabs. Will eventually be replaced by an artifact preview
 * (iframe / pre block / markdown render) when the run produces output.
 *
 * Contract for the replacement:
 *   - default export must be a React.FC (no required props)
 *   - root element should fill its container (height: 100%)
 *
 * DO NOT mock data here. Keep this file as a simple placeholder until
 * the real panel lands.
 */
import React from 'react';

const PreviewPanelStub: React.FC = () => {
  return (
    <div
      data-stub="preview-panel"
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
      [PreviewPanel — to be filled]
    </div>
  );
};

export default PreviewPanelStub;
