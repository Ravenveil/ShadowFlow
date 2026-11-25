/**
 * index.ts — ShadowFlow API server
 * Port: 8002
 */

// MUST be the first import: loads repo-root .env into process.env before any
// router module (which may read env at module scope) is evaluated.
import './env';

import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import runSessionsRouter, { shutdownActiveRuns } from './routes/runs/run-sessions';
import runsRouter from './routes/runs/runs';
import runSuggestionsRouter from './routes/runs/run-suggestions';
import agentsRouter from './routes/agents/agents';
import teamsRouter from './routes/agents/teams';
import skillsRouter from './routes/skills/skills';
import designSystemsRouter from './routes/system/design-systems';
import exportRouter from './routes/system/export';
import settingsRouter from './routes/system/settings';
import cliRouter from './routes/system/cli';
// ClawHub（2026-06）— 安装会话 REST + SSE
import clawhubRouter from './routes/skills/clawhub';
import acpRouter from './routes/system/acp';
import { groupsChatRouter } from './routes/groups/groups-chat';
// 后端合一·阶段1b（2026-06-12）— Node 自服务 /api/groups（仅 SF_GROUPS_BACKEND==='node'
// 时挂载，挂载顺序无关（ADR-0001 后无 fallback））。默认（python / 未设）不挂 → 仍转 Python，现状零变化。
import { groupsNodeRouter, handleDmResolve } from './routes/groups/groups-node';
// 2026-05-30 — 后端目录浏览器(给 CLI cwd 选工作目录;浏览器拿不到真实磁盘路径)
import { fsBrowseRouter } from './routes/system/fs-browse';
// Story 15.14 — POST /api/artifacts/lint（+ 单后端迁移：/:id/pin）
import artifactsRouter from './routes/system/artifacts';
// 单后端迁移第一批 — 三个纯 JSON 端点（移植自 Python，读仓库根 .shadowflow）
import walletRouter from './routes/system/wallet';
import messageFeedbackRouter from './routes/groups/message-feedback';
// 单后端迁移第二批 — workspaces（纯 JSON）/ templates（共享 yaml）/ inbox（sqlite）
import workspacesRouter from './routes/projects/workspaces';
import templatesRouter from './routes/system/templates';
import inboxRouter from './routes/groups/inbox';
// 单后端迁移收尾 — catalog（/catalog + /api/catalog 双前缀，对齐 Python server.py:262-265）
import catalogRouter from './routes/projects/catalog';
// 多模态记忆库 — createMemoryBankRouter()，router 内部自带 10mb parser，
// 必须挂在全局 1mb parser（:106）之前，否则 >1mb 文本入库请求被 413 挡掉。
import { createMemoryBankRouter } from './application/memory-bank/routes';
// 单后端迁移第三批（2026-11-18）— settings 缺口端点 + sessions
import settingsExtRouter from './routes/system/settings-ext';
import remoteExecRouter from './routes/system/remote-exec';
import sessionsRouter from './routes/runs/sessions';
// 单后端迁移第三批 — schedules 5 端点 + 调度引擎（sched-impl 4ae8bdca）
import schedulesRouter from './routes/runs/schedules';
import { startSchedulerEngine } from './scheduler/engine';
// 单后端迁移第三批 — opc 全域 31 端点（opc-impl 77841b05）
import opcRouter from './application/opc/routes/opc';
// 单后端迁移第三批 — impl-c agents 邻接域（bc1cfaf4）
import registryRouter from './routes/agents/registry';
import approvalsRouter from './routes/runs/approvals';
import { a2aRouter } from './routes/system/acp';
// 单后端迁移第三批 — memory state stub + agent state（裸 /state 前缀）
import memoryStateRouter from './application/memory/http-state';
import agentStateRouter from './routes/agents/agent-state';
import memoryProfilesRouter from './application/memory/http-profiles';
// Part D — LLM protocol entrypoints (Anthropic + OpenAI compatible)
import llmRouter from './routes/system/llm';
import asrRouter from './routes/system/asr';
// OpenBot 对齐批（2026-11-07）：连接器注册表（策略 = 执行前裁定）+
// 行动留痕查询（执行后留痕）。
import connectorsRouter from './routes/system/connectors';
import actionsRouter from './routes/system/actions';
import { detectAll } from './detectors/cli-detector';
import { detectAcpAgents } from './detectors/acp-detector';
import projectsRouter from './routes/projects/projects';
import memoryEntriesRouter from './application/memory/http-entries';
import memosRouter from './application/memos/http';
import newsRouter from './application/news/http';
// ARC（AutoResearchClaw）管线观测面：run 列表 / 阶段视图 / 终稿与核验产物
import arcRouter from './domains/research/adapters/arc-http';
// 经验记忆 + 数据看板（2026-11-05，整合 OPC-OS PR#3 设计：memory.py + ledger/看板）
import memoryLessonsRouter from './application/memory/http-lessons';
import dashboardRouter from './routes/dashboard/dashboard';
// 功能线③ 另一半（2026-11-05）：agent 间记忆交接 + 长期画像写回。外接 Router，
// 主入口只挂一行，不新增服务/端口，也不改既有路由语义。
import memoryHandoffRouter from './application/memory/http-handoff';
// 功能线① 商家数据看板（2026-11-05）— 外接模块，自带幂等建表，不改既有逻辑
import merchantBoardRouter from './application/merchant/http';
// 产品盈利看板（2026-11-07）— 手工艺品代卖业务：盈利 = 售价 − 成本 − 快递
import craftProfitRouter from './application/craft/http-profit';
// 社交发布（2026-11-07）— 社交平台直连发布：账号/营销帖/发布回执 + 平台适配器
// （mock/real 双模）。外接模块，自带幂等建表，不改既有逻辑。
import socialPublishRouter from './application/social/http';
// 代运营全流程（2026-11-07）— 上架商品 → 生营销帖 → 多平台分发 → 快递寄出。
// 营销侧复用 social 域，履约侧自带运单/轨迹表与承运商适配器（mock/real 双模）。
import opsRouter from './application/shipping/http';
import conversationsRouter, {
  projectScopedConversationsRouter,
} from './routes/projects/conversations';
import authRouter from './routes/system/auth';
// 2026-11-24 ADR-0001 — Python 后端退役：proxyFallback / python-backend 已删，
// 单后端恒 single；未迁移端点由 gap handler 显式 404（见 config/backend-gap.ts）。
// backend-mode 的 mode 函数保留为常量真源（恒 single / 恒 node），调用方无痛过渡。
import { installSingleBackendGapHandler, installRootGapHandler } from './config/backend-gap';
import { initSqlite } from './storage/sqlite';
// B2 中断恢复收尾 — 启动清扫上一进程遗留的孤儿 hop / NULL run_index（2026-11-05 迭代三）
import { sweepOrphanHops } from './storage/agent-hops';
import { sweepOrphanRunIndex } from './storage/run-index';
import { reloadSkills } from './loaders/skills';
import {
  reloadDesignSystems,
  seedBuiltinDesignSystems,
} from './loaders/design-systems';
import { ensureBuiltinCatalogTemplates } from './lib/catalog-builtin';
import { ensureLeadAgent } from './storage/lead-agent';

const PORT = Number(process.env.PORT ?? 8002);
// 公网部署可配多来源（逗号分隔）：FRONTEND_ORIGIN=https://a.example.com,https://b.example.com
const FRONTEND_ORIGINS = (process.env.FRONTEND_ORIGIN ?? 'http://localhost:3007')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const app = express();

// ── Middleware ────────────────────────────────────────────────────────────────

app.use(cors({
  origin: [...FRONTEND_ORIGINS, 'http://localhost:3000', 'http://localhost:5173'],
  credentials: true,
}));

// 多模态记忆库（2026-11-09 挂载）— /api/memory-bank/*。必须在全局 express.json
// 之前挂载：router 内部自挂 10mb parser，若全局 1mb parser 先命中会直接 413。
// 路由文件同时被 legacy 与 single 使用（功能已全量迁移），无条件挂载。
app.use('/api/memory-bank', createMemoryBankRouter());

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Request logger (minimal)
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ── Routes ────────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    server: 'shadowflow-api',
    version: '1.0.0',
    port: PORT,
    anthropic_key_configured: !!process.env.ANTHROPIC_API_KEY,
    timestamp: new Date().toISOString(),
  });
});

// Story 15.16 — sqlite must be initialized before any storage-backed route
// runs. initSqlite() is idempotent (cached singleton) so calling it here +
// later from inside route handlers via getDb() is fine.
initSqlite();

// B2 中断恢复收尾（2026-11-05 迭代三）— 单进程启动时刻不存在活 DAG 回合，
// sqlite 里所有未结算 hop / NULL 状态 run_index 都是上一进程崩溃残留，补结算
// （与 run-event-bus 启动 hydration 的「中断 run 补 canceled 帧」配套，审计链
// 两侧都不悬空）。失败仅告警，不阻塞启动。
try {
  const sweptHops = sweepOrphanHops();
  const sweptRuns = sweepOrphanRunIndex();
  if (sweptHops > 0 || sweptRuns > 0) {
    console.log(`[boot] crash-recovery sweep: ${sweptHops} orphan hop(s), ${sweptRuns} stale run_index row(s)`);
  }
} catch (e) {
  console.warn('[boot] crash-recovery sweep failed (non-fatal):', e);
}
initSqlite();

app.use('/api/run-sessions', runSessionsRouter);
app.use('/api/runs', runsRouter);
// 2026-08-23 — 完成态「后续建议」：GET /api/runs/:runId/suggestions。
// 独立 router 同挂 /api/runs（路径不与 runs.ts 冲突），挂载顺序无关（ADR-0001 后无 fallback）。
app.use('/api/runs', runSuggestionsRouter);
app.use('/api/agents', agentsRouter);
// impl-c 第三批（bc1cfaf4）— runtime registry + agent packs（/registry* 路径面，
// 与 agentsRouter 的 /{agent_id} 不重叠；registry 内部静态路由已先于
// /registry/:agent_id 注册，packs 不被吞）。挂载顺序无关（ADR-0001 后无 fallback）。
app.use('/api/agents', registryRouter);
// S0.7 — Team DAG endpoints (yaml-backed). Mounted unconditionally (no fallback since ADR-0001)
// /:id/dag and /:id/dag/validate hit Node; non-matching /api/teams paths
// (root list, create, etc.) now return a structured BACKEND_GAP 404.
app.use('/api/teams', teamsRouter);
app.use('/api/skills', skillsRouter);
app.use('/api/design-systems', designSystemsRouter);
app.use('/api/export', exportRouter);
// Story 15.9 — generation overrides discovery (env-locked model surface).
app.use('/api/settings', settingsRouter);
// 单后端迁移第三批 — settings 缺口端点（agents/detect·selection、composio、
// pets、byok/media DELETE 老协议）。必须挂在 settingsRouter **之后**：
// /appearance /byok /byok/models /media /preferences 已覆盖路径先被旧 router
// 吃掉，ext 只接新形状端点，避免路由冲突。
app.use('/api/settings', settingsExtRouter);
// 远程执行（SSH）：配置 + 连通性自检 + 远端跑命令（2026-11-19）
app.use('/api/remote-exec', remoteExecRouter);
// sessions（context/report/checkpoint，存储为进程内 TTL Map，与 Python 同构）
app.use('/api/sessions', sessionsRouter);
// schedules（sched-impl 4ae8bdca）— 条件挂载：仅 single 模式由 Node 接管并
// 启动轮询引擎（30s 磁盘轮询 .shadowflow/schedules/，与 Python APScheduler
// 同一数据目录）。legacy 下不挂路由不启引擎，/api/schedules 继续转 Python，
// 避免双后端同时轮询同一目录双触发。
// schedules（sched-impl 4ae8bdca）— Node 接管并启动轮询引擎（30s 磁盘轮询
// .shadowflow/schedules/，与原 Python APScheduler 同一数据目录）。
// 2026-11-24 ADR-0001：Python 已退役，无双跑风险，无条件挂载。
{
  app.use('/api/schedules', schedulesRouter);
  startSchedulerEngine();
}
// opc（opc-impl 77841b05）— 单路由覆盖全部 31 条端点（router 内部路径不含
// /api/opc 前缀）。独立 opc.sqlite 与原 Python 同一物理文件，数据兼容。
{
  app.use('/api/opc', opcRouter);
}
// impl-c 第三批（bc1cfaf4）— approvals 根挂载：覆盖 /api/approvals/*、
// /api/groups/*/approvals/pending、裸 /approvals/pending 三种形状（桥接
// toolApprovals 审批门；与 Python svc=None 降级行为等价）。
app.use('/', approvalsRouter);
// A2A bridge — 仅 A2A_BRIDGE_ENABLED=true 时挂（对齐 Python server.py:281-283）。
if (['1', 'true', 'yes'].includes((process.env.A2A_BRIDGE_ENABLED ?? '').toLowerCase())) {
  app.use(a2aRouter); // GET /.well-known/agent.json + POST /a2a/
}
// Story 15.19 v2 — Local CLI auto-discovery + spawn bridge.
app.use('/api/cli', cliRouter);
// ClawHub（2026-06）— Claw 安装会话（POST 建会话 + GET SSE 日志流 + cancel）。
app.use('/api/clawhub', clawhubRouter);
// Story 15.23 — ACP / MCP remote agent discovery.
app.use('/api/acp', acpRouter);
// Story 15.14 — POST /api/artifacts/lint
app.use('/api/artifacts', artifactsRouter);
// SIWE + guest authentication
app.use('/api/auth', authRouter);
// Story 15.16 — Project + Conversation persistence layer.
app.use('/api/projects', projectsRouter);
app.use('/api/projects', projectScopedConversationsRouter);
// Story 16.1 — River Memory CRUD
app.use('/api/memory-entries', memoryEntriesRouter);
// 个人工作备忘 / 日程（2026-11-21）：前端「备忘」页的 /api/memos CRUD
app.use('/api/memos', memosRouter);
// 新闻看板（2026-11-21）：订阅源 + RSS 聚合，前端「新闻」页使用
app.use('/api/news', newsRouter);
// ARC 管线观测（2026-11-24）：论文专家团 run 的阶段视图 / 终稿 / 引用核验
app.use('/api/arc', arcRouter);
// 经验记忆（自动沉淀 + 分域召回）与数据看板聚合。必须挂载顺序无关（ADR-0001 后无 fallback）。
app.use('/api/memory/lessons', memoryLessonsRouter);
app.use('/api/memory/handoff', memoryHandoffRouter);
// 单后端迁移第三批（d7ad88ec）— memory state stub（与 memory/handoff 同前缀
// 串联，路径不相交）。
// batch2 遗留补挂（impl-b ebf29d3e 交付、此前漏接线）：memory profiles CRUD。
// 挂在 memoryStateRouter 之前——profiles 是完整实现，state 是 stub，
// 两者路径不相交（/profiles* vs /state/*），顺序仅作语义声明。
app.use('/api/memory', memoryProfilesRouter);
app.use('/api/memory', memoryStateRouter);
// agent state（impl-b d7ad88ec）— 裸 /state 前缀：Python state.py APIRouter 无
// prefix、server.py:271 裸挂载，SDK/前端调的就是 /state/...，挂 /api/state 会全 404。
app.use('/state', agentStateRouter);
app.use('/api/dashboard', dashboardRouter);
// 功能线① 商家商业化数据（订单分时 / 客流 / 第一单链路），挂 proxyFallback 之前
app.use('/api/merchant', merchantBoardRouter);
// 产品盈利看板（2026-11-07）：/api/craft-profit/*，挂 proxyFallback 之前
app.use('/api/craft-profit', craftProfitRouter);
// 社交发布（营销帖直发六大平台），挂 proxyFallback 之前
app.use('/api/social-publish', socialPublishRouter);
// 代运营全流程（分发编排 + 快递履约），挂 proxyFallback 之前
app.use('/api/ops', opsRouter);
app.use('/api/conversations', conversationsRouter);
// Chat/DM/群聊 发消息网关 — 拦下 POST /api/groups/:id/messages 用 Node dispatcher
// 生成回复（CLI + API 都真生效）。其余 /api/groups/* 不在此定义 → next() →
// proxyFallback 转 Python。必须挂载顺序无关（ADR-0001 后无 fallback）。
// 2026-05-30 修：此前只 import 未 app.use，发消息漏过网关落到 Python chat-bridge，
// 导致 CLI executor 永远走不通（Python spawn 不了 CLI）。
app.use('/api/groups', groupsChatRouter);
// 1b — Node 自服务 /api/groups（建群/list/get/patch/messages 读+兜底持久化/reactions/
// pin/user-settings/SSE）。挂在 groupsChatRouter **之后**（POST /:id/messages +
// groups Node 自服务（ADR-0001 后无条件挂载）：/api/groups + DM resolve。
{
  app.use('/api/groups', groupsNodeRouter);
  app.post('/api/chat/dm/:agent_id/resolve', handleDmResolve);
  console.log('[groups] groups backend=node — /api/groups served by Node SQLite store');
}
// 后端目录浏览器(GET /api/fs/list|home|validate)。Node 读本机磁盘列目录,前端逐层
// 点选 → 回传真实绝对路径当 CLI cwd。挂载顺序无关（ADR-0001 后无 fallback）,否则会被转去 Python。
app.use('/api/fs', fsBrowseRouter);
// 2026-11-07 知识库统一批：本地仓库 vaults（/api/knowledge-vaults）下线，
// 本地文件夹语义并入多模态记忆库目录摄入（/api/memory-bank/packs/{id}/folders）。
// Part D — LLM protocol entrypoints. MUST be mounted BEFORE proxyFallback
// otherwise /api/llm/* would be forwarded to Python instead of handled here.
app.use('/api/llm', llmRouter);
// 语音输入转写（2026-11-07）：POST /api/asr/transcribe，Node 直调 OpenAI 兼容
// /audio/transcriptions（whisper-1 等）。同挂载顺序无关（ADR-0001 后无 fallback）。
app.use('/api/asr', asrRouter);
// OpenBot 对齐批（2026-11-07）— 连接器注册表（/api/connectors）与行动留痕
// （/api/actions）。语义：每个工具动作执行前按连接器策略裁定（auto/prompt/
// block）、执行后记 action-journal；同挂 proxyFallback 之前。
app.use('/api/connectors', connectorsRouter);
app.use('/api/actions', actionsRouter);
// 单后端迁移第一批 — 纯 JSON 端点接管（挂载顺序无关（ADR-0001 后无 fallback））：
//   /api/wallet/{status,activity,skin-pack}  ← Python system/wallet.py
//   /api/messages/:mid/feedback (GET+POST)   ← Python groups.py L1 feedback 段
//   /api/artifacts/:id/pin                   ← Python runs/artifacts.py（已并入 artifactsRouter）
// 三者与 Python 共享 <repo>/.shadowflow 下同一份 JSON，legacy↔single 数据兼容。
app.use('/api/wallet', walletRouter);
app.use('/api/messages', messageFeedbackRouter);
// 单后端迁移第二批（挂载裁决）：
//   /api/workspaces — 仓库根 .shadowflow/workspaces/*.json 与 Python 同源 → 无条件挂
//   /api/templates{,/:id/inbox} — 共享 templates/*.yaml → 无条件挂
//   /api/inbox — 聚合 sqlite 群/agent 数据 → 仅 node 后端时挂（single 强制 node）
// briefboard 并入 groups-node.ts（随 /api/groups 条件挂载，本文件无需改动）。
app.use('/api/workspaces', workspacesRouter);
app.use('/api', templatesRouter);
app.use('/api', inboxRouter);
// impl-c teams 域补挂（2026-11-09）：teams-store.ts 的完整 CRUD（GET / + /:id +
// PATCH/DELETE + workflow/policy/validation-hooks/versions/branch/restore/chat）
// 交付时未接线。挂载顺序在 teamsRouter（DAG/plan 子集）之后即可——两者路径不
// 冲突（teams.ts 只有 /:id/dag* 与 /:id/plan*）。
import teamsStoreRouter from './routes/agents/teams-store';
app.use('/api/teams', teamsStoreRouter);
// 单后端迁移收尾 — catalog 双前缀挂载（对齐 Python server.py:262-265）：
// Python 端 APIRouter(prefix="/catalog") 挂了两份，裸 /catalog 保持原路径，
// /api/catalog 是给前端 Node 网关的别名。Node 版 router 内部路径为 /apps，
// 这里同样双挂保证 legacy 前端直连 /catalog/* 与 single 前端走 /api/catalog/*
// 两种路径都通。共享仓库根 JSON，legacy↔single 数据兼容，无条件挂载。
app.use('/catalog', catalogRouter);
app.use('/api/catalog', catalogRouter);

// /api/groups — formerly a placeholder stub that returned synthetic IDs and
// empty arrays. Removed 2026-05-19 so groups requests fall through to the
// Python FastAPI backend (shadowflow/api/groups/groups.py), which persists groups
// + messages under .shadowflow/groups/*.json. The stub was masking real
// data: `createGroup` succeeded with a fake id, but the group never existed
// in any storage so `/chat` always rendered "暂无群组". See Step 4 of the
// data-vertical plan.

// ── Fallback to Python FastAPI (default :8000) ────────────────────────────────
// Single-port UX: any /api/* not matched by the 12 Node routers above is
// 2026-11-24 ADR-0001 — proxyFallback 已随 Python 退役删除；
// 未迁移端点由 gap handler 显式 404 并计数，暴露 /health/backend-gaps。
{
  const installed = installSingleBackendGapHandler(app);
  console.log(`[backend] mode=single — gap handler installed=${installed}`);
}

// ── Static artifacts (Story 15.2) ─────────────────────────────────────────────
// Serves files written by runSkillAssembler under .shadowflow/projects/<id>/
// e.g. /projects/<session_id>/prototype.html for the 15.3 iframe preview.
const projectsRoot = path.join(process.cwd(), '.shadowflow', 'projects');
try {
  fs.mkdirSync(projectsRoot, { recursive: true });
} catch (err) {
  console.warn(`[index] could not create projects dir ${projectsRoot}:`, (err as Error).message);
}
// SECURITY (review B1, OpenDesign architecture.md): even though the iframe sets
// sandbox="allow-scripts" client-side, we add a CSP `sandbox` response header as
// defense-in-depth so direct nav (新标签打开 / 截图工具) also gets the same
// isolation. `sandbox` with no token = strictest opaque origin — scripts run but
// cannot reach top.localStorage even if the user opens the artifact directly.
app.use('/projects', express.static(projectsRoot, {
  maxAge: 0,
  etag: false,
  setHeaders: (res) => {
    res.setHeader('Content-Security-Policy', "sandbox allow-scripts; default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: https:");
    res.setHeader('X-Content-Type-Options', 'nosniff');
  },
}));
console.log(`[index] static /projects → ${projectsRoot}`);

// 裸路径 gap handler（gap-ext-worker d02cab8d）— 挂在 static /projects 之后、
// 404 catch-all 之前：single 默认下任何未迁移的裸路径端点（/workflow/*、
// /builder/* 等）返回结构化 BACKEND_GAP 而非静默 404；/health、/projects/*、
// /api/*、SPA 页面路由、静态资源一律放行。ADR-0001 后恒安装，
// legacy 下不安装（行为零变化）。
installRootGapHandler(app);

// 404 catch-all
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ── Story 15.10: hot-load FS skills at boot ───────────────────────────────────
// Scans .shadowflow/skills/<id>/SKILL.md and merges into the in-memory
// registry. Errors are non-fatal (logged + skipped per file).
{
  const { reloaded, errors } = reloadSkills();
  if (reloaded > 0 || errors.length > 0) {
    console.log(`[index] skill-loader: ${reloaded} loaded, ${errors.length} error(s)`);
  }
}

// ── 内置 Catalog 团队模板种子（2026-11-19）────────────────────────────────────
// 单后端不启 Python 时，内置团队（ARC 论文专家团 / T04 氢能团）没有种子就会
// 404，前端「一键即用」直接失效。这里从仓库内 JSON 数据文件幂等补种。
{
  const seeded = ensureBuiltinCatalogTemplates();
  if (seeded.length > 0) {
    console.log(`[index] catalog: seeded builtin team templates ${seeded.join(', ')}`);
  }
}

// ── 内置「主控」agent 种子（2026-11-20）──────────────────────────────────────
// 主控原本只由 Python secretary_seed.py 播种；单后端不启 Python 时没有主控，
// 前端首访那场「跟主控对话」就指向空 id。这里在 Node 侧幂等补种一次。
{
  const lead = ensureLeadAgent();
  if (lead.created) {
    console.log(`[index] lead-agent: seeded builtin 主控 (${lead.agentId})`);
  }
}

// ── Story 15.11: seed + hot-load FS Design Systems at boot ────────────────────
// 1. Seed `.shadowflow/design-systems/{tailwind,material,shadcn,none}.md` if
//    they don't already exist (idempotent — never overwrites user edits).
// 2. Scan the dir and merge any FS DS into the registry (FS overrides
//    same-id built-ins). Errors are non-fatal.
{
  const seed = seedBuiltinDesignSystems();
  if (seed.written.length > 0) {
    console.log(`[index] design-system-loader: seeded ${seed.written.join(', ')}`);
  }
  const { reloaded, failed, overrides } = reloadDesignSystems();
  if (reloaded > 0 || failed > 0) {
    console.log(
      `[index] design-system-loader: ${reloaded} loaded, ${failed} error(s)` +
        (overrides.length > 0 ? `, override: ${overrides.join(', ')}` : ''),
    );
  }
}

// ── Story 15.19 v2: warm CLI detection cache (fire-and-forget) ────────────────
// First scan happens in the background so server boot isn't blocked. The cache
// is populated by the time anyone calls GET /api/cli/detect (and that endpoint
// itself awaits the same promise via detectAll()).
detectAll(true)
  .then((snap) => {
    const installed = snap.items.filter((i) => i.installed);
    console.log(
      `[index] cli-detector: ${installed.length}/${snap.items.length} CLI(s) detected` +
        (installed.length > 0 ? ` — ${installed.map((i) => i.id).join(', ')}` : ''),
    );
  })
  .catch((err) => {
    console.warn(`[index] cli-detector boot scan failed: ${(err as Error).message}`);
  });

// ── Story 15.23: warm ACP / MCP detection cache (fire-and-forget) ──────────────
// Non-blocking PATH + TCP-ping scan. installed:false is normal on a clean dev
// machine and never aborts boot.
detectAcpAgents(true)
  .then((snap) => {
    const online = snap.items.filter((i) => i.installed);
    console.log(
      `[index] acp-detector: ${online.length}/${snap.items.length} agent(s) installed` +
        (online.length > 0 ? ` — ${online.map((i) => `${i.id}(${i.transport})`).join(', ')}` : ''),
    );
  })
  .catch((err) => {
    console.warn(`[index] acp-detector boot scan failed: ${(err as Error).message}`);
  });

// ── Start ─────────────────────────────────────────────────────────────────────

// ── Graceful shutdown (T3 A8) ───────────────────────────────────────────────
// On SIGTERM/SIGINT, cancel all active run-sessions so their spawned CLI/ACP
// child processes get SIGTERM→SIGKILL'd instead of orphaning + burning tokens.
let shuttingDown = false;
async function gracefulShutdown(sig: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[index] ${sig} received — cancelling active runs…`);
  try {
    await shutdownActiveRuns(3000);
  } catch (e) {
    console.warn(`[index] shutdownActiveRuns failed: ${(e as Error).message}`);
  } finally {
    process.exit(0);
  }
}
process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => void gracefulShutdown('SIGINT'));

// ── Start ───────────────────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  const mode = process.env.ANTHROPIC_API_KEY ? 'Claude-powered (server key)' : 'BYOK (user-supplied key)';
  console.log(`
╔══════════════════════════════════════════════════════╗
║          ShadowFlow API Server — Port ${PORT}          ║
╚══════════════════════════════════════════════════════╝
  Mode     : ${mode}
  CORS     : ${FRONTEND_ORIGINS.join(', ')}
  Health   : http://localhost:${PORT}/health
  Sessions : http://localhost:${PORT}/api/run-sessions
`);
});

// 公网/反代部署：Node 默认 keep-alive 5s < 反代空闲超时（通常 60s）会被服务器
// 提前关连接，浏览器端表现为间歇性请求失败（连接不稳）。显式拉长到 65s，
// headersTimeout 必须 > keepAliveTimeout。
server.keepAliveTimeout = 65_000;
server.headersTimeout = 70_000;
