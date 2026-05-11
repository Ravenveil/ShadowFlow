import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from './core/components/common/ErrorBoundary';
import { HfLayout } from './components/hifi/HfLayout';
// AppLayout is intentionally NOT imported here — application routes are
// wrapped by HfLayout (Hi-Fi v2). The file `components/layout/AppLayout.tsx`
// is kept on disk for fallback / unused.

const LandingPage = lazy(() => import('./pages/LandingPage'));
const InboxPage = lazy(() => import('./pages/InboxPage'));
const EditorPage = lazy(() => import('./pages/EditorPage'));
const TemplatesPage = lazy(() => import('./pages/TemplatesPage'));
const ImportPage = lazy(() => import('./pages/ImportPage'));
const AboutPage = lazy(() => import('./pages/AboutPage'));
const ChatPage = lazy(() => import('./pages/ChatPage'));
const AgentDMPage = lazy(() => import('./pages/AgentDMPage'));
const BuilderPage = lazy(() => import('./pages/BuilderPage'));
const CatalogPage = lazy(() => import('./pages/CatalogPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const KnowledgePage = lazy(() => import('./pages/KnowledgePage'));
const EvalsPage = lazy(() => import('./pages/EvalsPage'));
const AgentPage = lazy(() => import('./pages/AgentPage'));
const TeamListPage = lazy(() =>
  import('./pages/TeamPage').then((m) => ({ default: m.TeamListPage }))
);
const TeamDetailPage = lazy(() =>
  import('./pages/TeamPage').then((m) => ({ default: m.TeamDetailPage }))
);
const StartPage = lazy(() => import('./pages/StartPage'));
const WorkspacePage = lazy(() => import('./pages/WorkspacePage'));
const RunSessionPage = lazy(() => import('./pages/RunSessionPage'));
const ProjectsPage = lazy(() => import('./pages/ProjectsPage'));
const RunsListPage = lazy(() =>
  import('./pages/RunsPage').then((m) => ({ default: m.RunsListPage }))
);
const RunDetailPage = lazy(() =>
  import('./pages/RunsPage').then((m) => ({ default: m.RunDetailPage }))
);

// Kept for future use — other routes may still need placeholder slots
export function RoutePlaceholder({ title }: { title: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-shadowflow-bg px-6 text-white/90">
      <div className="w-full max-w-xl rounded-sf border border-shadowflow-border bg-shadowflow-surface p-8 text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-white/45">
          Placeholder Route
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em]">{title}</h1>
        <p className="mt-3 text-sm text-white/60">
          这个入口会在后续 Story 中接入真实内容，当前先保留稳定路由槽位。
        </p>
      </div>
    </div>
  );
}

export function AppRoutes() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<div style={{ background: 'var(--t-bg, #0D1117)', height: '100vh' }} />}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          {/* ── Marketing / standalone pages (no workspace bar) ── */}
          <Route path="/about" element={<AboutPage />} />

          {/* ── Application pages (Hi-Fi v2 chrome: HfLayout sidebar shell) ── */}
          <Route element={<HfLayout />}>
            <Route path="/inbox" element={<InboxPage />} />
            <Route path="/templates" element={<TemplatesPage />} />
            <Route path="/import" element={<ImportPage />} />
            <Route path="/editor" element={<EditorPage />} />
            <Route path="/editor/:templateId" element={<EditorPage />} />
            <Route path="/runs" element={<RunsListPage />} />
            <Route path="/runs/:runId" element={<RunDetailPage />} />
            <Route path="/chat/:groupId" element={<ChatPage />} />
            <Route path="/agent-dm/:agentId" element={<AgentDMPage />} />
            <Route path="/builder" element={<BuilderPage />} />
            <Route path="/catalog" element={<CatalogPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/knowledge" element={<KnowledgePage />} />
            <Route path="/evals" element={<EvalsPage />} />
            <Route path="/agents" element={<AgentPage />} />
            <Route path="/teams" element={<TeamListPage />} />
            <Route path="/teams/:teamId" element={<TeamDetailPage />} />
            <Route path="/start" element={<StartPage />} />
            <Route path="/projects" element={<ProjectsPage />} />
          </Route>
          {/* ── FB-HiFi Workspace (standalone chrome, no AppLayout) ── */}
          <Route path="/workspace" element={<WorkspacePage />} />
          {/* ── Run Session — full-screen split-view, no HfLayout ── */}
          <Route path="/run-session/:sessionId" element={<RunSessionPage />} />
          <Route path="/run-session" element={<RunSessionPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}

export default AppRoutes;
