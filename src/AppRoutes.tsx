import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { ErrorBoundary } from './core/components/common/ErrorBoundary';

// ===== Neo (clawsgo-style chat-first 重构, 2026-08-15) =====
// 旧页面体系（Landing/Start/ChatHome/Agents/Teams/Runs/...）全部下架，
// 主体验 = NeoApp 三栏（左导航 · 中聊天+任务执行 · 右 Agent 的主机）。
// /settings 保留（BYOK/外观等真实配置，NeoRail 齿轮进入）。
// /knowledge /knowledge/graph /memory 保留全页模式（可深链；Neo 侧栏点入走
// 中栏内嵌变体，rail 常驻——2026-08-19 导航架构统一批）。
// /loop-engine 已下线（迭代环是 DAG 执行图的一部分，并入右栏「过程」tab，
// 见 NeoHost processContent）：旧链接 redirect 进 Neo 壳。
// 旧路由一律 redirect 到 /，源文件删除见 .workbuddy/overview-neo.md。
const NeoApp = lazy(() => import('./neo/NeoApp'));
const NeoGroupChat = lazy(() => import('./neo/NeoGroupChat'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const KnowledgePage = lazy(() => import('./pages/KnowledgePage'));
// 2026-08-19 河流记忆 / 知识图谱：记忆 = 条目式沉淀（/api/memory-entries）；
// 图谱 = KnowledgePack 的 LightRAG 实体关系可视化（从 Shadow 搬迁，去 Tauri 化）。
const MemoryPage = lazy(() => import('./pages/MemoryPage'));
const KnowledgeGraphPage = lazy(() => import('./pages/KnowledgeGraphPage'));
// ClawHub（2026-06）— Claw 集合平台目录页（浏览/安装/详情）。
const ClawHubPage = lazy(() => import('./pages/clawhub/ClawHubPage'));

/** /loop-engine/:runId → /?run=<runId>（循环引擎并入过程 tab 后的旧链回收）。 */
function LoopEngineRedirect() {
  const { runId } = useParams<{ runId: string }>();
  return <Navigate to={runId ? `/?run=${encodeURIComponent(runId)}` : '/'} replace />;
}

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
          {/* 循环引擎旧链：迭代环已并入右栏「过程」tab（2026-08-19） */}
          <Route path="/loop-engine" element={<LoopEngineRedirect />} />
          <Route path="/loop-engine/:runId" element={<LoopEngineRedirect />} />
          <Route path="/knowledge" element={<KnowledgePage />} />
          {/* 知识图谱（从 Shadow 搬迁）：?pack=<id> 选 pack，数据 LightRAG GraphML */}
          <Route path="/knowledge/graph" element={<KnowledgeGraphPage />} />
          {/* 河流记忆（River Memory，Story 16.1 前端补齐） */}
          <Route path="/memory" element={<MemoryPage />} />
          {/* ClawHub（2026-06）— Claw 集合平台（浏览/安装/详情抽屉） */}
          <Route path="/clawhub" element={<ClawHubPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}

export default AppRoutes;
