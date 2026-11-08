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
// 时挂载，挂在 proxyFallback 之前）。默认（python / 未设）不挂 → 仍转 Python，现状零变化。
import { groupsNodeRouter } from './routes/groups/groups-node';
// 2026-11-08 — DM resolve 归属感知（修「消息发不出来」）：每个登录身份只拿得到
// 自己的 DM，绝不递别人的会话（详见 routes/groups/dm-resolve.ts 文件头）。
import { handleDmResolveOwned } from './routes/groups/dm-resolve';
// 2026-05-30 — 后端目录浏览器(给 CLI cwd 选工作目录;浏览器拿不到真实磁盘路径)
import { fsBrowseRouter } from './routes/system/fs-browse';
// Story 15.14 — POST /api/artifacts/lint
import artifactsRouter from './routes/system/artifacts';
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
import memoryEntriesRouter from './routes/memory/memory-entries';
// 经验记忆 + 数据看板（2026-11-05，整合 OPC-OS PR#3 设计：memory.py + ledger/看板）
import memoryLessonsRouter from './routes/memory/memory-lessons';
import dashboardRouter from './routes/dashboard/dashboard';
// 功能线③ 另一半（2026-11-05）：agent 间记忆交接 + 长期画像写回。外接 Router，
// 主入口只挂一行，不新增服务/端口，也不改既有路由语义。
import memoryHandoffRouter from './routes/memory/memory-handoff';
// 功能线① 商家数据看板（2026-11-05）— 外接模块，自带幂等建表，不改既有逻辑
import merchantBoardRouter from './routes/dashboard/merchant-board';
// 产品盈利看板（2026-11-07）— 手工艺品代卖业务：盈利 = 售价 − 成本 − 快递
import craftProfitRouter from './routes/dashboard/craft-profit';
// 小红书博文/商品目录（2026-11-08）— craft 域扩展：博文状态机 + 商品目录 CRUD
import craftPostsRouter from './routes/dashboard/craft-posts';
import craftProductsRouter from './routes/dashboard/craft-products';
// 社交发布（2026-11-07）— 社交平台直连发布：账号/营销帖/发布回执 + 平台适配器
// （mock/real 双模）。外接模块，自带幂等建表，不改既有逻辑。
import socialPublishRouter from './routes/social/social-publish';
// 代运营全流程（2026-11-07）— 上架商品 → 生营销帖 → 多平台分发 → 快递寄出。
// 营销侧复用 social 域，履约侧自带运单/轨迹表与承运商适配器（mock/real 双模）。
import opsRouter from './routes/ops/ops';
import conversationsRouter, {
  projectScopedConversationsRouter,
} from './routes/projects/conversations';
import authRouter from './routes/system/auth';
// 登录信息隔离批 — 真实用户 + 资源归属 + 管理员 API。数据路由必须登录（401），
// 列表按 owner 过滤、详情按归属校验（非本人 404 不泄露存在性），admin 全量可见。
import adminRouter from './routes/system/admin';
import { attachUser, requireAuth, requireAdmin } from './middleware/auth-context';
import { groupAccessGuard } from './middleware/group-access';
import { apiGuard } from './middleware/api-guard';
// 公网稳定性/兼容性批（2026-11-08）：keepAlive 对齐反代阈值 + CORS_ORIGINS
// 补放行来源 + SF_WEB_DIST 单端口 SPA 托管。
import { applyHttpServerTuning, buildCorsOrigins } from './lib/http-compat';
import { resolveWebDist, webHosting } from './lib/web-hosting';
import { proxyFallback } from './proxy-fallback';
import { initSqlite } from './storage/sqlite';
// B2 中断恢复收尾 — 启动清扫上一进程遗留的孤儿 hop / NULL run_index（2026-11-05 迭代三）
import { sweepOrphanHops } from './storage/agent-hops';
import { sweepOrphanRunIndex } from './storage/run-index';
import { reloadSkills } from './loaders/skills';
import {
  reloadDesignSystems,
  seedBuiltinDesignSystems,
} from './loaders/design-systems';

const PORT = Number(process.env.PORT ?? 8002);
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? 'http://localhost:3007';

const app = express();

// ── Middleware ────────────────────────────────────────────────────────────────

// trust proxy（2026-11-08 公网兼容）：cloudflared/反代之后 req.ip 从 XFF 解析
// 真实客户端来源，而非恒为 127.0.0.1（与 api-guard 来源判定口径一致）。
app.set('trust proxy', true);

app.use(cors({
  // CORS_ORIGINS（逗号分隔）补放行来源：隧道域名 / 其他前端门面（2026-11-08）。
  origin: buildCorsOrigins(FRONTEND_ORIGIN),
  credentials: true,
}));

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

// ── 登录信息隔离（2026-11 批）— 数据路由鉴权 ─────────────────────────────────
// 数据面（群/项目/会话/运行记录及子路径）必须登录：attachUser 解析
// `Authorization: Bearer <token>`（SSE 兼容 ?access_token=）→ 挂 req.user；
// requireAuth 拦截无/无效 token（401 UNAUTHORIZED）与被禁用账号（403）。
// 公共面（/health、/api/auth/*、/api/settings、/api/skills、/api/connectors
// 等）不挂，保持匿名可用。归属过滤/校验在各路由内部按 req.user 生效（无
// req.user 的旧直挂用法行为不变——测试零改动）。
const PROTECTED_DATA_PATHS = [
  '/api/groups',
  '/api/projects',
  '/api/conversations',
  '/api/run-sessions',
  '/api/runs',
  '/api/chat',
];
app.use(PROTECTED_DATA_PATHS, attachUser, requireAuth);
// /api/groups 归属守卫（列表过滤 / 建群归属捕获 / :id 归属校验）——必须挂在
// groupsChatRouter **之前**，Node/Python 双群后端统一生效（见 middleware/group-access.ts）。
app.use('/api/groups', groupAccessGuard());
// 管理员 API（未登录 401；非 admin → 403 FORBIDDEN——requireAdmin 必须挂上，
// 只挂 requireAuth 挡不住普通用户；引导策略见 storage/users.ts）。
app.use('/api/admin', attachUser, requireAdmin, adminRouter);

app.use('/api/run-sessions', runSessionsRouter);
app.use('/api/runs', runsRouter);
// 2026-08-23 — 完成态「后续建议」：GET /api/runs/:runId/suggestions。
// 独立 router 同挂 /api/runs（路径不与 runs.ts 冲突），必须在 proxyFallback 之前。
app.use('/api/runs', runSuggestionsRouter);
app.use('/api/agents', agentsRouter);
// S0.7 — Team DAG endpoints (yaml-backed). Mounted before proxyFallback so
// /:id/dag and /:id/dag/validate hit Node; non-matching /api/teams paths
// (root list, create, etc.) fall through to Python via proxyFallback.
app.use('/api/teams', teamsRouter);
app.use('/api/skills', skillsRouter);
app.use('/api/design-systems', designSystemsRouter);
app.use('/api/export', exportRouter);
// Story 15.9 — generation overrides discovery (env-locked model surface).
// 密钥材料守卫（2026-11-08 隧道加固）：这两条是 proxyFallback 落到 Python 的
// 连接器 / 媒体密钥路由（读写 Composio / 媒体平台 API Key），与 settings.ts 内
// 的 keyGuard 同策略——本机恒放行，公网（cloudflared 隧道）403，防密钥被偷改。
app.use('/api/settings/connectors/composio', apiGuard({ loopbackAlways: true }));
app.use('/api/settings/media', apiGuard({ loopbackAlways: true }));
app.use('/api/settings', settingsRouter);
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
// 经验记忆（自动沉淀 + 分域召回）与数据看板聚合。必须挂在 proxyFallback 之前。
app.use('/api/memory/lessons', memoryLessonsRouter);
app.use('/api/memory/handoff', memoryHandoffRouter);
app.use('/api/dashboard', dashboardRouter);
// 功能线① 商家商业化数据（订单分时 / 客流 / 第一单链路），挂 proxyFallback 之前
app.use('/api/merchant', merchantBoardRouter);
// 产品盈利看板（2026-11-07）：/api/craft-profit/*，挂 proxyFallback 之前
app.use('/api/craft-profit', craftProfitRouter);
// 小红书博文/商品目录（2026-11-08）：/api/craft-posts/*、/api/craft-products/*，
// 数据层复用 cp_products 扩展列 + craft_posts，挂 proxyFallback 之前
app.use('/api/craft-posts', craftPostsRouter);
app.use('/api/craft-products', craftProductsRouter);
// 社交发布（营销帖直发六大平台），挂 proxyFallback 之前
app.use('/api/social-publish', socialPublishRouter);
// 代运营全流程（分发编排 + 快递履约），挂 proxyFallback 之前
app.use('/api/ops', opsRouter);
app.use('/api/conversations', conversationsRouter);
// Chat/DM/群聊 发消息网关 — 拦下 POST /api/groups/:id/messages 用 Node dispatcher
// 生成回复（CLI + API 都真生效）。其余 /api/groups/* 不在此定义 → next() →
// proxyFallback 转 Python。必须挂在 proxyFallback 之前。
// 2026-05-30 修：此前只 import 未 app.use，发消息漏过网关落到 Python chat-bridge，
// 导致 CLI executor 永远走不通（Python spawn 不了 CLI）。
app.use('/api/groups', groupsChatRouter);
// 1b — Node 自服务 /api/groups（建群/list/get/patch/messages 读+兜底持久化/reactions/
// pin/user-settings/SSE）。挂在 groupsChatRouter **之后**（POST /:id/messages +
// GET /:id/timeline 仍先被网关拦截跑回复/聚合），proxyFallback **之前**。仅
// SF_GROUPS_BACKEND==='node' 时挂载；默认（python/未设）不挂 → /api/groups/* 仍
// 经 proxyFallback 转 Python，行为零变化。DM resolve 在 /api/chat/* 下单独挂。
if (process.env.SF_GROUPS_BACKEND === 'node') {
  app.use('/api/groups', groupsNodeRouter);
  console.log('[groups] SF_GROUPS_BACKEND=node — /api/groups served by Node SQLite store');
}
// DM resolve 归属感知（2026-11-08 修「消息发不出来」）：双后端统一挂载——每个
// 登录身份只拿得到自己的 DM（本人已有 → 无主认领 → 新建），绝不递别人的会话
// （否则归属守卫 404，时间线/发消息全线挂掉）。python 模式内部转 Python
// find-or-create（保留秘书问候播种）；无 req.user 的旧用法 next() 落给
// proxyFallback。必须挂在 proxyFallback 之前、attachUser 之后。
app.post('/api/chat/dm/:agent_id/resolve', handleDmResolveOwned);
// 后端目录浏览器(GET /api/fs/list|home|validate)。Node 读本机磁盘列目录,前端逐层
// 点选 → 回传真实绝对路径当 CLI cwd。挂在 proxyFallback 之前,否则会被转去 Python。
app.use('/api/fs', fsBrowseRouter);
// 2026-11-07 知识库统一批：本地仓库 vaults（/api/knowledge-vaults）下线，
// 本地文件夹语义并入多模态记忆库目录摄入（/api/memory-bank/packs/{id}/folders）。
// Part D — LLM protocol entrypoints. MUST be mounted BEFORE proxyFallback
// otherwise /api/llm/* would be forwarded to Python instead of handled here.
app.use('/api/llm', llmRouter);
// 语音输入转写（2026-11-07）：POST /api/asr/transcribe，Node 直调 OpenAI 兼容
// /audio/transcriptions（whisper-1 等）。同须挂 proxyFallback 之前。
app.use('/api/asr', asrRouter);
// OpenBot 对齐批（2026-11-07）— 连接器注册表（/api/connectors）与行动留痕
// （/api/actions）。语义：每个工具动作执行前按连接器策略裁定（auto/prompt/
// block）、执行后记 action-journal；同挂 proxyFallback 之前。
app.use('/api/connectors', connectorsRouter);
app.use('/api/actions', actionsRouter);

// /api/groups — formerly a placeholder stub that returned synthetic IDs and
// empty arrays. Removed 2026-05-19 so groups requests fall through to the
// Python FastAPI backend (shadowflow/api/groups/groups.py), which persists groups
// + messages under .shadowflow/groups/*.json. The stub was masking real
// data: `createGroup` succeeded with a fake id, but the group never existed
// in any storage so `/chat` always rendered "暂无群组". See Step 4 of the
// data-vertical plan.

// ── Fallback to Python FastAPI (default :8000) ────────────────────────────────
// Single-port UX: any /api/* not matched by the 12 Node routers above is
// transparently proxied to the Python backend. Mounted BEFORE the 404 catch-all
// so unmatched /api/* paths reach Python instead of returning a Node 404.
app.use('/api', proxyFallback);

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
// ── 单端口 SPA 托管（2026-11-08 公网兼容，SF_WEB_DIST 启用时）────────────────
// 未设 SF_WEB_DIST 时零行为变化。挂在所有 /api、/projects 路由之后，只接手
// 其余 GET/HEAD：静态文件直出，深链接/刷新回落 index.html（一端口出全部）。
const webDistDir = resolveWebDist(process.env.SF_WEB_DIST);
if (webDistDir) {
  app.use(webHosting(webDistDir));
  console.log(`[index] SF_WEB_DIST — SPA hosting ${webDistDir}`);
}

const server = app.listen(PORT, () => {
  const mode = process.env.ANTHROPIC_API_KEY ? 'Claude-powered (server key)' : 'BYOK (user-supplied key)';
  console.log(`
╔══════════════════════════════════════════════════════╗
║          ShadowFlow API Server — Port ${PORT}          ║
╚══════════════════════════════════════════════════════╝
  Mode     : ${mode}
  CORS     : ${FRONTEND_ORIGIN}
  Health   : http://localhost:${PORT}/health
  Sessions : http://localhost:${PORT}/api/run-sessions
`);
});

// 公网稳定性（2026-11-08）：keepAlive=65s / headers=70s 对齐反代阈值，
// 防隧道/反代空闲超时导致的间歇 502 / 连接重置。
applyHttpServerTuning(server);
