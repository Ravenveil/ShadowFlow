/**
 * index.ts — ShadowFlow API server
 * Port: 8002
 */

import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import runSessionsRouter from './routes/run-sessions';
import runsRouter from './routes/runs';
import agentsRouter from './routes/agents';
import skillsRouter from './routes/skills';
import designSystemsRouter from './routes/design-systems';
import exportRouter from './routes/export';
import settingsRouter from './routes/settings';
import cliRouter from './routes/cli';
import acpRouter from './routes/acp';
// Story 15.14 — POST /api/artifacts/lint
import artifactsRouter from './routes/artifacts';
// Part D — LLM protocol entrypoints (Anthropic + OpenAI compatible)
import llmRouter from './routes/llm';
import { detectAll } from './cli-detector';
import { detectAcpAgents } from './acp-detector';
import projectsRouter from './routes/projects';
import memoryEntriesRouter from './routes/memory-entries';
import conversationsRouter, {
  projectScopedConversationsRouter,
} from './routes/conversations';
import authRouter from './routes/auth';
import { proxyFallback } from './proxy-fallback';
import { initSqlite } from './storage/sqlite';
import { reloadSkills } from './skills';
import {
  reloadDesignSystems,
  seedBuiltinDesignSystems,
} from './design-systems';

const PORT = Number(process.env.PORT ?? 8002);
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? 'http://localhost:3007';

const app = express();

// ── Middleware ────────────────────────────────────────────────────────────────

app.use(cors({
  origin: [FRONTEND_ORIGIN, 'http://localhost:3000', 'http://localhost:5173'],
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

app.use('/api/run-sessions', runSessionsRouter);
app.use('/api/runs', runsRouter);
app.use('/api/agents', agentsRouter);
app.use('/api/skills', skillsRouter);
app.use('/api/design-systems', designSystemsRouter);
app.use('/api/export', exportRouter);
// Story 15.9 — generation overrides discovery (env-locked model surface).
app.use('/api/settings', settingsRouter);
// Story 15.19 v2 — Local CLI auto-discovery + spawn bridge.
app.use('/api/cli', cliRouter);
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
app.use('/api/conversations', conversationsRouter);
// Part D — LLM protocol entrypoints. MUST be mounted BEFORE proxyFallback
// otherwise /api/llm/* would be forwarded to Python instead of handled here.
app.use('/api/llm', llmRouter);

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

app.listen(PORT, () => {
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
