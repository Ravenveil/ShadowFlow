import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from './core/components/common/ErrorBoundary';

// ===== Neo (clawsgo-style chat-first 重构, 2026-08-15) =====
// 旧页面体系（Landing/Start/ChatHome/Agents/Teams/Runs/...）全部下架，
// 主体验 = NeoApp 三栏（左导航 · 中聊天+任务执行 · 右 Agent 的主机）。
// /settings 保留（BYOK/外观等真实配置，NeoRail 齿轮进入）。
// /loop-engine 保留（循环引擎看板，PDCA 迭代/收敛可视化，NeoRail 图标进入）。
// 旧路由一律 redirect 到 /，源文件删除见 .workbuddy/overview-neo.md。
const NeoApp = lazy(() => import('./neo/NeoApp'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const LoopEnginePage = lazy(() => import('./pages/LoopEnginePage'));

export function AppRoutes() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<div style={{ background: 'var(--t-bg, #FFFFFF)', height: '100vh' }} />}>
        <Routes>
          <Route path="/" element={<NeoApp />} />
          <Route path="/neo" element={<NeoApp />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/loop-engine" element={<LoopEnginePage />} />
          <Route path="/loop-engine/:runId" element={<LoopEnginePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}

export default AppRoutes;
