import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from './core/components/common/ErrorBoundary';

// ===== Neo (clawsgo-style chat-first 重构, 2026-08-15) =====
// 旧页面体系（Landing/Start/ChatHome/Agents/Teams/Runs/...）全部下架，
// 主体验 = NeoApp 三栏（左导航 · 中聊天+任务执行 · 右 Agent 的主机）。
// /settings 保留（BYOK/外观等真实配置，NeoRail 齿轮进入）。
// /loop-engine 保留（循环引擎看板，PDCA 迭代/收敛可视化，NeoRail 图标进入）。
// /knowledge 保留（知识包管理页，真实 GET /knowledge/packs，NeoRail「知识库」行进入）。
// 旧路由一律 redirect 到 /，源文件删除见 .workbuddy/overview-neo.md。
const NeoApp = lazy(() => import('./neo/NeoApp'));
const NeoGroupChat = lazy(() => import('./neo/NeoGroupChat'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const LoopEnginePage = lazy(() => import('./pages/LoopEnginePage'));
const KnowledgePage = lazy(() => import('./pages/KnowledgePage'));

export function AppRoutes() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<div style={{ background: 'var(--t-bg, #FFFFFF)', height: '100vh' }} />}>
        <Routes>
          <Route path="/" element={<NeoApp />} />
          <Route path="/neo" element={<NeoApp />} />
          {/* 群聊现场页（Polynoia 对标 2026-08-15）— 单聊编排派发后 agents
              在群里干活的可视现场：统一时间线 + 全部富内联卡。 */}
          <Route path="/group/:groupId" element={<NeoGroupChat />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/loop-engine" element={<LoopEnginePage />} />
          <Route path="/loop-engine/:runId" element={<LoopEnginePage />} />
          <Route path="/knowledge" element={<KnowledgePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}

export default AppRoutes;
