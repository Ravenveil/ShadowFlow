/**
 * AppLayout — Story 12.4
 *
 * Global layout wrapper for application pages (Agent, Team, Chat, etc.).
 * Renders a top workspace bar containing WorkspaceSwitcher.
 * Marketing/landing pages are NOT wrapped by this layout.
 */

import { Link } from 'react-router-dom';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';

function IconSettings() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ width: 14, height: 14 }}
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col bg-shadowflow-bg">
      {/* ── Workspace top bar ─────────────────────────────────────── */}
      <header
        className="flex items-center gap-4 border-b border-shadowflow-border bg-shadowflow-surface/80 px-4 py-2 backdrop-blur-sm"
        data-testid="app-layout-header"
      >
        <WorkspaceSwitcher />
        <div className="ml-auto flex items-center gap-2">
          <Link
            to="/workspace"
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium text-white/50 hover:bg-white/5 hover:text-white/85 transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
              <rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" />
              <rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" />
            </svg>
            工作台
          </Link>
          <Link
            to="/settings"
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-white/50 hover:bg-white/5 hover:text-white/85 transition-colors"
            aria-label="设置"
          >
            <IconSettings />
          </Link>
        </div>
      </header>

      {/* ── Page content ──────────────────────────────────────────── */}
      <div className="flex-1">{children}</div>
    </div>
  );
}
