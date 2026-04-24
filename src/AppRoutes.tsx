import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from './core/components/common/ErrorBoundary';

const LandingPage = lazy(() => import('./pages/LandingPage'));
const InboxPage = lazy(() => import('./pages/InboxPage'));
const EditorPage = lazy(() => import('./pages/EditorPage'));
const TemplatesPage = lazy(() => import('./pages/TemplatesPage'));
const ImportPage = lazy(() => import('./pages/ImportPage'));
const AboutPage = lazy(() => import('./pages/AboutPage'));

function RoutePlaceholder({ title }: { title: string }) {
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
      <Suspense fallback={<div style={{ background: 'var(--bg)', height: '100vh' }} />}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/inbox" element={<InboxPage />} />
          <Route path="/templates" element={<TemplatesPage />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/editor" element={<EditorPage />} />
          <Route path="/editor/:templateId" element={<EditorPage />} />
          <Route path="/runs/:runId" element={<RoutePlaceholder title="Run Preview" />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}

export default AppRoutes;
