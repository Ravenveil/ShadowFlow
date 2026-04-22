import type { ReactNode } from 'react';

interface EditorLayoutProps {
  toolbar: ReactNode;
  sidebar: ReactNode;
  canvas: ReactNode;
  inspector: ReactNode;
  sidebarWidth?: number;
  inspectorWidth?: number;
}

export function EditorLayout({
  toolbar,
  sidebar,
  canvas,
  inspector,
  sidebarWidth = 220,
  inspectorWidth = 280,
}: EditorLayoutProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100%', background: 'var(--bg)', overflow: 'hidden' }}>
      {/* Toolbar row */}
      <div style={{ height: 48, flexShrink: 0, borderBottom: '1px solid var(--border)', background: 'var(--bg-elev-1)' }}>
        {toolbar}
      </div>

      {/* Main content area: sidebar + canvas + inspector */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left sidebar — P10: data-testid for E2E assertions */}
        <div data-testid="editor-sidebar" style={{ width: sidebarWidth, flexShrink: 0, borderRight: '1px solid var(--border)', background: 'var(--bg-elev-1)', overflowY: 'auto' }}>
          {sidebar}
        </div>

        {/* Center canvas — P10: data-testid for E2E assertions */}
        <div data-testid="editor-canvas" style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          {canvas}
        </div>

        {/* Right inspector — P10: data-testid for E2E assertions */}
        <div data-testid="editor-inspector" style={{ width: inspectorWidth, flexShrink: 0, borderLeft: '1px solid var(--border)', background: 'var(--bg-elev-1)', overflowY: 'auto' }}>
          {inspector}
        </div>
      </div>
    </div>
  );
}
