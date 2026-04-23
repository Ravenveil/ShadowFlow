import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import App from './App';
import { ErrorBoundary } from './core/components/common/ErrorBoundary';
import { installLeakGuards } from './core/security/leakGuard';
import './index.css';

installLeakGuards();

// Lazy-loaded routes for code splitting (Vite chunks per route)
const EditorPage = lazy(() => import('./pages/EditorPage'));
const TemplatesPage = lazy(() => import('./pages/TemplatesPage'));
const ImportPage = lazy(() => import('./pages/ImportPage'));

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      {/* P23: ErrorBoundary wraps Suspense so chunk-load failures show error UI, not white screen */}
      <ErrorBoundary>
        <Suspense fallback={<div style={{ background: 'var(--bg)', height: '100vh' }} />}>
          <Routes>
            <Route path="/" element={<App />} />
            <Route path="/templates" element={<TemplatesPage />} />
            <Route path="/import" element={<ImportPage />} />
            <Route path="/editor" element={<EditorPage />} />
            <Route path="/editor/:templateId" element={<EditorPage />} />
            {/* P2: Redirect unknown paths to landing instead of re-rendering App at wrong URL */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </BrowserRouter>
  </React.StrictMode>,
);
