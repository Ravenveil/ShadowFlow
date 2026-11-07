/**
 * run-sessions/registry.ts — 执行状态单一所有权：sessionStore + runBus + stepStore + 网关 run 注册。
 */
import { v4 as uuidv4 } from 'uuid';
import { createRunBus, type RunEventRecord, type RunStatus } from '../../../lib/run-event-bus';
import { createRunEventStore } from '../../../lib/run-event-store';
import { toolApprovals } from '../../../lib/tool-approval';
import { createSessionStore } from '../../../lib/session-store';
import { SESSION_SCHEMA_VERSION, type ConversationMessage } from '../../../lib/conversation-types';
import { createStepStore } from '../../../lib/step-store';
import { listRunIndexByConversation, setRunIndexStatus, upsertRunIndex } from '../../../storage/run-index';
import type { LayerToggles } from '../../../prompts/prompt-assembly';
import type { ProviderId } from '../../../transport/api-clients';
import type { UserAttachment } from '../../../lib/contracts';
import { recordRunLesson } from './lessons';

export interface SessionRecord {
  goal: string;
  skill_name: string;
  /** 2026-06-01 — 用户显式 @skill:<id> 或显式 skill_name 触发(非默认回退)。
   *  true → assembler 走"组装意图"路:Branch 2 兜底时用组装指令(禁 discovery),
   *  而非该 skill 的对话 prompt。见 .shadowflow/skills/agent-team-assembly。 */
  explicit_skill?: boolean;
  /** 2026-06-01 — 用户原始请求的 skill id(@skill:<id> 的 <id> / 显式 skill_name),
   *  未经 SKILLS 注册表回退。≠ skill_name 时说明请求的 skill 不在注册表里;assembler
   *  Branch 2 据此用 read_skill 去磁盘/网络拉真实蓝图,而非静默用默认 blueprint。 */
  skill_requested?: string;
  output_hint?: string;
  workspace_id?: string;
  mode?: string;
  anthropic_key?: string;
  /** Story 15.18 — selected LLM provider (default 'anthropic').
   *  2026-11-07：放宽为 string —— settings/byok 注册的自定义 provider（custom-*）
   *  同样可作为会话 provider（executor=byok:<id> 时以其为准）。 */
  provider?: ProviderId | string;
  /** Story 15.18 — BYOK key for the selected provider. */
  api_key?: string;
  /** Story 15.5 — Design System id chosen by user; defaults to 'none'. */
  design_system_id?: string;
  /** Story 15.9 — generation overrides forwarded from front-end localStorage. */
  model?: string;
  max_tokens?: number;
  temperature?: number;
  /**
   * Story 15.19 v2 — optional executor override. POST body / future UI hint.
   * Resolution order at the assembler boundary:
   *   session.executor > skill.executor (frontmatter) > 'anthropic-direct'.
   */
  executor?: string;
  /** 2026-05-30 — CLI 工作目录(绝对路径)。空 → assembler 回退到产物目录。
   *  仅 cli:/acp:/mcp: 有意义。 */
  cwd?: string;
  /** Story 15.13 — multi-layer prompt assembly inputs (all optional). */
  project_meta?: Record<string, unknown> | null;
  /** Story 15.12 interface — pre-rendered side-files block; loader to be wired by 15.12. */
  side_files?: string;
  layer_toggles?: LayerToggles;
  /**
   * 2026-11-06 — 对话框知识库接线：多模态记忆库 pack id 列表（用户在 composer
   * KNOWLEDGE chip 勾选）。stream 组装提示词时按 goal 检索命中注入「知识库参考」
   * 块（fail-soft）；多轮接力每轮以当轮 goal 重新检索。
   */
  knowledge_pack_ids?: string[];
  /**
   * 2026-11-07 对话框拖拽传图 — 用户消息随行附件（composer 上传后随 POST 落库）。
   * timeline user_turn 据此渲染缩略图；assembler goal 注入路径引用块让 agent 可读。
   * 每轮独立（不跨轮继承）：follow-up 未传 = 本轮无附件。
   */
  attachments?: UserAttachment[];
  /**
   * 2026-11-07 OpenBot 对齐批 — 本轮连接器作用域（composer 加号菜单「连接器」
   * 勾选）。语义同 knowledge_pack_ids：随会话落库，使用侧按 id 取连接器策略
   * （auto/prompt/block）做执行前裁定；作用域决策本身记 action-journal。
   */
  connector_ids?: string[];
  /**
   * Story 15.29 — conversation this run belongs to. Always set: when the
   * client omits `conversation_id` we auto-create an anonymous one under
   * the 'default' project so every run lives somewhere.
   */
  conversation_id?: string;
  /**
   * Story 15.14 follow-up 2026-05-11 — per-request auto_critique override
   * from the UI toggle. When `false` the finally{} block skips the critique
   * pass. When `undefined` the server falls back to settings.json (default
   * true to preserve current behavior).
   */
  auto_critique?: boolean;
  /**
   * S1 (skill-team-conversion-design-v1.md §5 / D8) — session schema version.
   * 0 / missing  → pre-S1, no `messages` field on disk.
   * 1            → current; SessionRecord guarantees `messages: ConversationMessage[]`.
   * Migrator in createSessionStore() below normalizes 0 → 1 on load.
   */
  version?: number;
  /**
   * S1 — multi-turn conversation history. ContentBlock-shaped, mirrors
   * Anthropic Messages API. Populated by ConversationRuntime (S5) once it
   * lands; for now writers may leave it empty.
   */
  messages?: ConversationMessage[];
  created_at: number;
  /**
   * 2026-06-01 — last-activity timestamp for the activity-based TTL sweep.
   * Bumped on every persist (touchSession) AND on each /stream attach, so a
   * session a user keeps coming back to never expires out from under them.
   * Old records (pre-2026-06-01) lack it; migrator defaults it to created_at.
   * Replaces the old "created_at < now-1h" sweep that nuked sessions an hour
   * after creation regardless of activity (root cause of the spurious
   * "Session 不存在或已过期 404" the user hit on revisit).
   */
  updated_at?: number;
}

// Persistent session store — drop-in replacement for `new Map<>()` with
// JSON-file persistence. Hydrated at module load (fire-and-forget; reads
// before hydration completes simply miss until the file lands, which is
// fine because in normal flows POST creates the session before any GET).
// S1 (D8) — migrator runs on every record read from disk in loadAll(). Old
// records (pre-S1) lack `messages` + `version`; we inject `messages: []` and
// bump version to the current schema. We're defensive about the raw shape:
// anything not a plain object is dropped (warning logged by the caller).
export const sessionStore = createSessionStore<SessionRecord>({
  migrate: (raw): SessionRecord | undefined => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
    const rec = raw as Partial<SessionRecord> & Record<string, unknown>;
    // Only the new fields are touched; everything else round-trips as-is.
    if (!Array.isArray(rec.messages)) rec.messages = [];
    if (typeof rec.version !== 'number' || rec.version < SESSION_SCHEMA_VERSION) {
      rec.version = SESSION_SCHEMA_VERSION;
    }
    // 2026-06-01 — pre-existing records have no `updated_at`; seed it from
    // created_at so the activity-based TTL has a sensible starting point.
    if (typeof rec.updated_at !== 'number') {
      rec.updated_at = typeof rec.created_at === 'number' ? rec.created_at : Date.now();
    }
    return rec as SessionRecord;
  },
});
// 后端合一·阶段0 — 启动回填：把内存 store 里已有的 session↔conversation 映射
// 补进持久 run_index（幂等 upsert），老 run 的历史从此也不怕 TTL 回收。
void sessionStore.loadAll().then(() => {
  try {
    for (const [id, s] of sessionStore.entries()) {
      if (!s.conversation_id) continue;
      upsertRunIndex({
        session_id: id,
        conversation_id: s.conversation_id,
        goal: s.goal ?? '',
        created_at: s.created_at,
      });
    }
  } catch (err) {
    console.warn('[run-sessions] run_index backfill failed:', err);
  }
});

// 2026-06-01 — activity-based session TTL. Old code swept any session
// `created_at < now-1h`, i.e. killed it one hour after CREATION no matter how
// recently it was viewed — so coming back to a run after lunch surfaced a
// spurious "Session 不存在或已过期 (404)". Sessions persist to disk (session-store),
// so the only thing TTL guards is unbounded cardinality; an idle window is the
// right axis, not absolute age. 24h of inactivity is generous for a desktop
// tool and still bounds the on-disk session count.
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

/** Effective last-activity instant for the TTL sweep. */
export function sessionLastActivity(s: SessionRecord): number {
  return Math.max(s.created_at ?? 0, s.updated_at ?? 0);
}

/**
 * Re-persist a session with a refreshed `updated_at`. Cheap (session-store
 * double-writes async) and keeps an actively-viewed session from expiring.
 * No-op if the session is already gone.
 */
export function touchSession(id: string): void {
  const s = sessionStore.get(id);
  if (!s) return;
  s.updated_at = Date.now();
  sessionStore.set(id, s);
}

// S2.3 — module-level singleton. One bucket per session; cleanup happens
// alongside sessionStore's activity-based TTL sweep (clear() on session delete
// is effectively handled by the step-store's idempotent disk-removal).
export const stepStoreSingleton = createStepStore();

// T3-1 (2026-05-27): the legacy per-connection `activeStreams` registry +
// ActiveStream interface were removed. Abort / retry-pending / resume-pending
// now go through `runBus` (emit + cancel), which buffers and fans out to every
// attached view instead of poking one connection's `res`.

// T3-1 (docs/architecture/opendesign-streaming-architecture-study.md §5): the
// run-event bus makes each run a persistent entity with a buffered, monotonically
// numbered event log + a set of attached SSE views. The pipeline runs ONCE
// (guarded by runBus.claimStart) and emit()s into the log; every GET /stream
// connection is a detachable view that resumes from `?after`/Last-Event-ID.
// This is what decouples execution from the SSE connection — reconnects replay
// the buffered events instead of re-running the whole LLM pipeline.
// O2 / T3-5 — inject disk persistence so the run timeline survives a Node
// restart (hydrated at construction; debounced snapshots on emit/finish). Runs
// that were mid-flight at crash hydrate as `canceled` with their history intact
// + a synthetic "interrupted by restart" terminal frame, so a reconnect replays
// the timeline read-only instead of re-running the pipeline.
export const runBus = createRunBus({ persist: createRunEventStore() });

// 阶段 1 — tool-approval 帧直写 runBus：待审请求与最终决策都以命名事件
// `permission_check` 落进该 run 的单调编号事件日志（重连经 attach 重放，
// 重启经 run-event-store hydrate）——「决策为命名事件，可回放」的落点。
// 注册表本体在 lib（assembler / executor 构造 prompter 时引用同一单例）。
toolApprovals.setEmitter((sessionId, event, frame) => {
  runBus.emit(sessionId, event, frame);
});

/**
 * T3 A8 — graceful shutdown entry point for the daemon. Cancels every active
 * run (aborting its signal → the cli spawner SIGTERM→SIGKILLs its child) and
 * waits a short grace so child processes are reaped before the process exits.
 * Wired to SIGTERM/SIGINT in index.ts.
 */
export async function shutdownActiveRuns(graceMs?: number): Promise<void> {
  await runBus.shutdownActive(graceMs !== undefined ? { graceMs } : undefined);
}

/**
 * O4 — /stream disposition resolver (pure, unit-testable).
 *
 * When a client opens GET /:id/stream we must decide HOW to serve it. The
 * legacy behavior hard-404'd the moment the in-memory session was gone (e.g.
 * the 1h session TTL fired, or the user came back to an old run after a restart)
 * — even though the run's full timeline may still be replayable from the
 * run-event-bus (hydrated from disk). That looked like a broken/lost run.
 *
 * New disposition, in priority order:
 *   - `live`   : the session is present → normal path (may claimStart + run).
 *   - `replay` : the session is gone but the run exists in the bus (live OR
 *                hydrated-from-disk) → READ-ONLY replay of the buffered timeline,
 *                ending with whatever terminal/synthetic frame the bus holds.
 *                NEVER claimStart, NEVER re-execute, NEVER spend tokens.
 *   - `gone`   : neither a session nor any recoverable run → accurate 404.
 *
 * `run` is the result of looking the run up in the bus AFTER an attempted lazy
 * `hydrateOne` (so a disk-only snapshot has already been pulled back in). Keeping
 * this a pure function of {hasSession, run} makes the decision testable without
 * Express/fs (mirrors the swapDagRun unit-test pattern in groups-chat.ts).
 */
export type StreamDisposition =
  | { kind: 'live' }
  | { kind: 'replay'; status: RunStatus }
  | { kind: 'gone' };

export function resolveStreamDisposition(args: {
  hasSession: boolean;
  run: { status: RunStatus } | undefined;
}): StreamDisposition {
  if (args.hasSession) return { kind: 'live' };
  if (args.run) return { kind: 'replay', status: args.run.status };
  return { kind: 'gone' };
}

// ── B2 · 统一消息读路径 (unified-conversation-core-plan-2026-06-11 §B2) ──────
// groups-chat.ts 的 GET /api/groups/:id/timeline 需要「conversation → run 列表
// → 每个 run 的事件日志」，但 sessionStore / runBus 都是本文件私有（刻意：执行
// 状态单一所有权）。这里导出两个轻量只读查询，而不是把 store 本体漏出去。

/**
 * List run-session ids belonging to a conversation, most-recently-updated
 * first. Read-only; never touches runBus.
 */
export function listSessionsByConversation(conversationId: string): string[] {
  const hits = new Map<string, number>();
  // 阶段0 — 持久索引为主源（TTL 回收后历史仍在）…
  try {
    for (const r of listRunIndexByConversation(conversationId)) {
      hits.set(r.session_id, r.updated_at);
    }
  } catch {
    // sqlite 不可用时仅靠内存——保持旧行为
  }
  // …内存 store 兜底合并（覆盖索引未及写入的瞬时窗口）。
  for (const [id, s] of sessionStore.entries()) {
    if (s.conversation_id !== conversationId) continue;
    hits.set(id, Math.max(hits.get(id) ?? 0, s.updated_at ?? s.created_at ?? 0));
  }
  return [...hits.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

/**
 * Read-only snapshot of one run's status + buffered event log for timeline
 * replay. Uses `hydrateOne` so a run whose snapshot is on disk but not in
 * memory (post-restart / post-TTL) is recovered with the same read-only
 * semantics as the /stream replay path. Returns null when there is nothing
 * to replay (no in-memory run, no disk snapshot).
 */
export function getRunReplay(
  sessionId: string,
): { status: RunStatus; events: RunEventRecord[] } | null {
  const run = runBus.hydrateOne(sessionId) ?? runBus.get(sessionId);
  if (!run) return null;
  return { status: run.status, events: run.events };
}

/**
 * 2026-11-04 群聊「停止生成」— 按会话 id 取消一个在跑的 run（执行状态
 * 单一所有权仍在 runBus；groups-chat.ts 的 stop 路由经此入口取消 gateway
 * run，与 POST /:id/abort 的 runBus.cancel 同一通路）。幂等：unknown id /
 * 已终态都静默返回 false，调用方据此决定是否还走 AbortController 通道。
 */
export function cancelRunSession(sessionId: string): boolean {
  const run = runBus.get(sessionId) ?? runBus.hydrateOne(sessionId);
  if (!run || runBus.isTerminal(run.status)) return false;
  runBus.emit(sessionId, 'aborted', { session_id: sessionId, reason: 'user_requested' });
  runBus.cancel(sessionId);
  return true;
}

// ── B3 · 网关过程事件 (unified-conversation-core-plan-2026-06-11 §B3) ────────
// 聊天网关 (groups-chat.ts runFanout) 执行期的过程（thinking/原始流/状态行）
// 复用 run 体系管线：每轮 fanout 注册一条轻量 "gateway run"，过程投影成
// TimelineMessage 经 'message'/'message-patch' 事件 emit 进 runBus 事件日志。
// B2 的 GET /api/groups/:id/timeline 已按 conversation 归并所有 run —— 这些
// 过程卡因此零前端改动即可回放（实时推送是 F5 的活）。
//
// sessionStore / runBus 仍保持本文件私有（与 listSessionsByConversation /
// getRunReplay 同款边界）：这里只导出一个注册入口，emit/finish 以闭包形式
// 交还调用方，store 本体不外漏。

/** B3 — handle returned by registerGatewayRun; closures over the private runBus. */
export interface GatewayRunHandle {
  session_id: string;
  /** Append a 'message' / 'message-patch' event into this run's event log. */
  emit: (event: 'message' | 'message-patch', payload: unknown) => void;
  /** Mark the run terminal (idempotent — runBus.finish guards re-entry). */
  finish: (status: Exclude<RunStatus, 'running'>) => void;
}

/**
 * B3 — register a lightweight "gateway run" session for one chat fan-out round.
 * The session appears in GET /api/run-sessions (per conversation) and its event
 * log feeds the B2 timeline merge. `claimStart` is called here ON PURPOSE: if
 * the front-end later opens GET /:id/stream on this session, the 'live' path's
 * claimStart returns false → it only ATTACHES (replays the gateway's events)
 * and never boots the skill-assembler pipeline for a chat round.
 */
export function registerGatewayRun(meta: {
  goal: string;
  conversation_id: string;
}): GatewayRunHandle {
  const session_id = uuidv4();
  sessionStore.set(session_id, {
    goal: meta.goal,
    skill_name: 'chat-gateway',
    conversation_id: meta.conversation_id,
    created_at: Date.now(),
    updated_at: Date.now(),
  });
  // 阶段0 — 持久索引：TTL 回收后历史过程卡仍可经 conversation 找回
  try {
    upsertRunIndex({ session_id, conversation_id: meta.conversation_id, goal: meta.goal });
  } catch { /* sqlite 不可用不阻塞聊天 */ }
  runBus.claimStart(session_id); // ensure() + started=true（单一执行权归网关）
  return {
    session_id,
    emit: (event, payload) => {
      runBus.emit(session_id, event, payload);
    },
    finish: (status) => {
      runBus.finish(session_id, status);
      touchSession(session_id); // 结束时刷新活跃度，避免 TTL 早扫
      try { setRunIndexStatus(session_id, status ?? 'succeeded'); } catch { /* 同上 */ }
      // 经验记忆自动沉淀（best-effort）— 网关聊天轮失败同样记教训
      try {
        recordRunLesson(
          { skill_name: 'chat-gateway', goal: meta.goal },
          { aborted: status === 'canceled', failed: status === 'failed', errorMessage: status === 'failed' ? 'chat gateway round failed' : null },
        );
      } catch { /* 非致命 */ }
    },
  };
}
