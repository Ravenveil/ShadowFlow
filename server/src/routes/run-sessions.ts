/**
 * run-sessions.ts — POST /api/run-sessions + GET /api/run-sessions/:id/stream
 *
 * Story 15.2 — switched stream handler to runSkillAssembler (skill-driven Claude
 * streaming with <sf:*> + <artifact> tag extraction). Adds AbortController so
 * client disconnect cancels the upstream Claude call. POST accepts skill_name.
 *
 * Story 15.8 — added run history persistence. After the assembler generator
 * finishes (success, error, or aborted-by-client), we capture artifact info
 * from any blueprint events and persist a RunRecord via storage/runs.ts so
 * RunsPage + StartPage can show the history. Aborts (client disconnect) do
 * NOT persist — only fully-terminated runs do.
 */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { runSkillAssembler } from '../assembler';
import { classifyErrorCode } from '../lib/classify-error';
import { createRunBus, type RunEventSink } from '../lib/run-event-bus';
import { createRunEventStore } from '../lib/run-event-store';
// Round 4 PR-E — canonical `@skill` token parser shared byte-equal with the
// frontend (`src/lib/skillToken.ts`). Replaces an inline regex that drifted
// in shape from the SkillDropdown UI; both call sites now agree on which
// goal text patterns are recognised as inline-skill tokens.
import { parseSkillToken } from '../lib/skill-token';
import { saveRun, type ArtifactType } from '../storage/runs';
import { getSetting } from '../storage/settings';
import { SKILLS } from '../skills';
import { DESIGN_SYSTEMS } from '../design-systems';
import { composeSystemPrompt, type LayerToggles } from '../prompt-assembly';
import { composeMultiTurnPrompt } from '../prompts';
import { loadSkillSideFiles } from '../loaders/skill-side-files';
import {
  PROVIDER_IDS,
  isProviderId,
  type ProviderId,
} from '../transport/api-clients';
import { resolveProviderKey } from '../transport/byokKey';
// Story 15.14 — auto-critique pass after artifact-saved.
import { runCritique } from '../critic';
// Story 15.29 — multi-turn conversation glue: validate / auto-create
// conversation, write user + assistant messages tied to this session.
import {
  appendMessage,
  createConversation,
  getConversation,
  getRecentMessages,
} from '../storage/conversations';
import { getOrCreateProject } from '../storage/projects';
// 2026-05-19 — Cherry Studio parity: replace in-memory Map with a JSON-file
// backed store so backend restarts no longer wipe live sessions. Survives
// hot reload + crash; sensitive fields persisted under .shadowflow/ (gitignored,
// same trust boundary as settings.json).
import { createSessionStore } from '../lib/session-store';
// S1 (skill-team-conversion-design-v1.md §5) — ContentBlock + ConversationMessage
// data model; SessionRecord now carries `messages` so the future
// ConversationRuntime (S5) can replay multi-turn history across SSE reconnects.
import {
  SESSION_SCHEMA_VERSION,
  type ConversationMessage,
} from '../lib/conversation-types';
// S1.2 (intent-workflow-design-v1 §4.1) — TS-side intent classifier. Runs in
// the SSE handler before the assembler kicks off so the front-end gets a
// `classify` frame within ~1ms of stream open (LLM's own <sf:classify .../>
// arrives many seconds later, after parser extraction). Two frames coexist;
// front-end may diff them for consistency (S5.2 future story).
import { classifyTS, detectExplicitSingleAgent, SINGLE_AGENT_DIRECTIVE } from '../lib/intent-router';
import { loadTeam as loadGlobalTeam } from '../lib/team-yaml';
// S2.3 (intent-workflow-design-v1 §4.4) — step artifact persistence + per-step
// SSE frame. Parser fires node/edge/blueprint between `assemble:running` and
// `assemble:done`; we collect them per open step, then on `done` package a
// StepArtifact → stepStore.put() + emit `step-artifact` for the front-end.
import { createStepStore } from '../lib/step-store';
import type { OutputKind, StepArtifact } from '../lib/contracts';
// S6.10-A — Trae/Codex-style timeline projection. Runs in parallel with the
// legacy fine-grained event stream; emits `message` + `message-patch` SSE
// frames that the front-end can subscribe to incrementally. Legacy events are
// preserved unchanged so existing consumers keep working.
import { createTimelineProjector } from '../lib/timeline-projector';
// S6.3 — skill-team synthesizer. When the active skill ships a structured
// team.skill.yaml we bypass the LLM entirely and stream the design straight
// from disk. Deterministic, free, and perfectly matches the v3 stacked
// AgentDetail because every byte already lives in the skill files.
import type { TeamDef, SkillSlot } from '../lib/skill-types';

const router = Router();

interface SessionRecord {
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
  /** Story 15.18 — selected LLM provider (default 'anthropic'). */
  provider?: ProviderId;
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

// ── Story 15.13 — layer_toggles + project_meta validators ────────────────────

// 2026-05-11 review M1 (15.29): 加 'conversation_history' — 否则 client 通过
// POST layer_toggles.conversation_history=false 想关闭历史会被 coerceLayerToggles
// 静默丢弃 → 服务端永远 always-on，违反 spec AC3 toggle 契约。
const LAYER_KEYS: ReadonlyArray<keyof LayerToggles> = [
  'discovery',
  'identity',
  'ds',
  'skill',
  'project',
  'conversation_history',
  'sides',
  'framework',
];

function coerceLayerToggles(raw: unknown): LayerToggles | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out: LayerToggles = {};
  for (const k of LAYER_KEYS) {
    const v = (raw as Record<string, unknown>)[k];
    if (typeof v === 'boolean') out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function coerceProjectMeta(raw: unknown): Record<string, unknown> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  // Shallow copy — composer handles per-value JSON.stringify.
  return { ...(raw as Record<string, unknown>) };
}

// ── Story 15.9 — generation override validators ──────────────────────────────
//
// 2026-05-16 — Removed the claude-only MODEL_ALLOWLIST. Previously this Set
// of 3 ids silently dropped every non-Claude model the user picked, so a
// BYOK selection like `glm-5.1` / `gpt-4o` / `deepseek-chat` was coerced to
// undefined and the server fell back to the default Claude model — the
// classic "frontend done, backend not wired up" failure mode. We now accept
// any non-empty string and let the per-provider streamCompletion surface
// MODEL_NOT_FOUND if the id is bogus.

const MODEL_MAX_LEN = 200;
const MAX_TOKENS_MIN = 1024;
const MAX_TOKENS_MAX = 32768;

function coerceModel(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > MODEL_MAX_LEN) return undefined;
  // Reject suspicious patterns (whitespace mid-id, control chars) — anything
  // that wouldn't be a legal LLM model identifier — to avoid downstream
  // weirdness without enforcing a per-provider allowlist.
  if (/[\s\x00-\x1f]/.test(trimmed)) return undefined;
  return trimmed;
}

function coerceMaxTokens(raw: unknown): number | undefined {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return undefined;
  const n = Math.floor(raw);
  return n >= MAX_TOKENS_MIN && n <= MAX_TOKENS_MAX ? n : undefined;
}

function coerceTemperature(raw: unknown): number | undefined {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return undefined;
  return raw >= 0 && raw <= 1 ? raw : undefined;
}

// ── Story 15.29 — conversation history rendering ─────────────────────────
//
// Reads up to 20 recent messages from sqlite (ascending order — getRecentMessages
// already does this). Excludes the trailing user message we just appended in
// this turn (so it isn't duplicated inside the history layer AND inside the
// goal slot). Renders a markdown block with `### User` / `### Assistant`
// headings. Token-bloat guards:
//   - per-message content > 1024 char → truncate + "…(truncated)" suffix
//   - total block > 4096 char → drop oldest until under cap, preserve order
//
// Returns `undefined` when there is no conversation_id, no prior messages,
// or only the single just-written user message — composeSystemPrompt then
// drops the conversation_history layer entirely.
const HISTORY_LIMIT = 20;
const HISTORY_PER_MSG_MAX = 1024;
const HISTORY_BLOCK_MAX = 4096;

// sse-frame-leak stop-bleed (2026-05-31). ShadowFlow serializes its own SSE as
// `event: <name>\ndata: <one-line json>\n\n`. When a prior turn's leaked frames
// got stored as assistant content, re-injecting them here as CONVERSATION
// HISTORY makes the LLM parrot the frame shape back — and the parser's
// sse-frame-leak guard then renders the WHOLE turn as `raw` blocks (no real
// <sf:node>/<sf:complete> ever produced → TEAM 0 + errored run). We strip the
// frame-shaped lines before they re-enter the prompt, closing the feedback loop
// at its source. Tight match (an `event:` line immediately followed by a `data:`
// line opening with `{`/`[`) so normal prose is untouched. Mirrors
// parser.ts:588's guard regex. The structural fix (typed event stream, control
// frames never sharing the text channel) is tracked in the root-cure plan doc.
const SSE_FRAME_LINE_RE =
  /^[ \t]*event:[ \t]*[\w.-]+[ \t]*\r?\n[ \t]*data:[ \t]*[{[][^\n]*\r?\n?/gm;

export function stripLeakedSseFrames(content: string): string {
  if (!content.includes('event:')) return content; // fast path — no candidates
  return content.replace(SSE_FRAME_LINE_RE, '');
}

function renderConversationHistoryBlock(
  conversation_id: string | undefined,
): string | undefined {
  if (!conversation_id) return undefined;
  let msgs;
  try {
    msgs = getRecentMessages(conversation_id, HISTORY_LIMIT);
  } catch (e) {
    console.error('[run-sessions] getRecentMessages failed:', e);
    return undefined;
  }
  // Drop the trailing user message (it IS this turn's goal — already shown
  // to the LLM as the user message; the layer is *prior* turns).
  if (msgs.length > 0 && msgs[msgs.length - 1].role === 'user') {
    msgs = msgs.slice(0, -1);
  }
  if (msgs.length === 0) return undefined;

  const renderOne = (m: { role: string; content: string }): string => {
    const role =
      m.role === 'user' ? 'User' : m.role === 'assistant' ? 'Assistant' : 'System';
    // sse-frame-leak stop-bleed: never re-feed frame-shaped text as context.
    let body = stripLeakedSseFrames(m.content);
    if (body.length > HISTORY_PER_MSG_MAX) {
      body = body.slice(0, HISTORY_PER_MSG_MAX) + '…(truncated)';
    }
    // 2026-05-11 review M2 (15.29, OpenDesign 模式 — 与 15.12 fence wrap 同款):
    // 用 markdown code fence 包裹 message body，防恶意 user message 含
    // `\n---\n## DISCOVERY\n…` 之类的 layer separator (`\n\n---\n\n`) 突破
    // composer 边界注入新 layer 段。strip 内含 ``` 防 fence escape。
    const safeBody = body.replace(/```/g, '` ` `');
    return `### ${role}\n\`\`\`\n${safeBody}\n\`\`\``;
  };

  // Drop oldest until total fits under cap.
  let rendered = msgs.map(renderOne);
  let block = rendered.join('\n\n');
  while (block.length > HISTORY_BLOCK_MAX && rendered.length > 1) {
    rendered = rendered.slice(1);
    block = rendered.join('\n\n');
  }
  // If even the most recent single message is over cap, hard-truncate it.
  if (block.length > HISTORY_BLOCK_MAX) {
    block = block.slice(0, HISTORY_BLOCK_MAX) + '…(truncated)';
  }

  return [
    '## CONVERSATION HISTORY',
    '',
    '(Earlier turns in this conversation, oldest first. Use them as context — do not restate.)',
    '',
    block,
  ].join('\n');
}

// Persistent session store — drop-in replacement for `new Map<>()` with
// JSON-file persistence. Hydrated at module load (fire-and-forget; reads
// before hydration completes simply miss until the file lands, which is
// fine because in normal flows POST creates the session before any GET).
// S1 (D8) — migrator runs on every record read from disk in loadAll(). Old
// records (pre-S1) lack `messages` + `version`; we inject `messages: []` and
// bump version to the current schema. We're defensive about the raw shape:
// anything not a plain object is dropped (warning logged by the caller).
const sessionStore = createSessionStore<SessionRecord>({
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
void sessionStore.loadAll();

// 2026-06-01 — activity-based session TTL. Old code swept any session
// `created_at < now-1h`, i.e. killed it one hour after CREATION no matter how
// recently it was viewed — so coming back to a run after lunch surfaced a
// spurious "Session 不存在或已过期 (404)". Sessions persist to disk (session-store),
// so the only thing TTL guards is unbounded cardinality; an idle window is the
// right axis, not absolute age. 24h of inactivity is generous for a desktop
// tool and still bounds the on-disk session count.
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

/** Effective last-activity instant for the TTL sweep. */
function sessionLastActivity(s: SessionRecord): number {
  return Math.max(s.created_at ?? 0, s.updated_at ?? 0);
}

/**
 * Re-persist a session with a refreshed `updated_at`. Cheap (session-store
 * double-writes async) and keeps an actively-viewed session from expiring.
 * No-op if the session is already gone.
 */
function touchSession(id: string): void {
  const s = sessionStore.get(id);
  if (!s) return;
  s.updated_at = Date.now();
  sessionStore.set(id, s);
}

// S2.3 — module-level singleton. One bucket per session; cleanup happens
// alongside sessionStore's activity-based TTL sweep (clear() on session delete
// is effectively handled by the step-store's idempotent disk-removal).
const stepStoreSingleton = createStepStore();

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
const runBus = createRunBus({ persist: createRunEventStore() });

/**
 * T3 A8 — graceful shutdown entry point for the daemon. Cancels every active
 * run (aborting its signal → the cli spawner SIGTERM→SIGKILLs its child) and
 * waits a short grace so child processes are reaped before the process exits.
 * Wired to SIGTERM/SIGINT in index.ts.
 */
export async function shutdownActiveRuns(graceMs?: number): Promise<void> {
  await runBus.shutdownActive(graceMs !== undefined ? { graceMs } : undefined);
}

const VALID_ARTIFACT_TYPES: ReadonlyArray<ArtifactType> = ['yaml', 'html', 'markdown'];

function coerceArtifactType(raw: unknown): ArtifactType | null {
  if (typeof raw !== 'string') return null;
  return (VALID_ARTIFACT_TYPES as ReadonlyArray<string>).includes(raw)
    ? (raw as ArtifactType)
    : null;
}

// ── POST /api/run-sessions ────────────────────────────────────────────────────

router.post('/', (req: Request, res: Response) => {
  const {
    goal,
    skill_name,
    output_hint,
    workspace_id,
    mode,
    design_system_id,
    // Story 15.9 — generation overrides; each is validated via coerce* below.
    model,
    max_tokens,
    temperature,
    // Story 15.13 — multi-layer prompt assembly inputs (all optional).
    project_meta,
    side_files,
    layer_toggles,
    // Story 15.19 v2 — optional executor selector.
    executor,
    // Story 15.18 — optional provider selector.
    provider,
    // 2026-05-30 — CLI 工作目录(绝对路径)。仅 cli:/acp:/mcp: 用得上。
    cwd,
    // Story 15.29 — optional conversation linkage. Server validates / auto-creates.
    conversation_id,
    // Story 15.14 follow-up — body-level auto_critique override (UI toggle).
    auto_critique,
  } = req.body as {
    goal?: string;
    skill_name?: string;
    output_hint?: string;
    workspace_id?: string;
    mode?: string;
    design_system_id?: string;
    model?: unknown;
    max_tokens?: unknown;
    temperature?: unknown;
    project_meta?: unknown;
    side_files?: unknown;
    layer_toggles?: unknown;
    executor?: unknown;
    provider?: unknown;
    cwd?: unknown;
    conversation_id?: unknown;
    auto_critique?: unknown;
  };

  if (!goal || typeof goal !== 'string' || goal.trim().length === 0) {
    res.status(400).json({ error: 'goal is required and must be a non-empty string' });
    return;
  }

  // Inline `@skill:<id>` token support (Story 16.x). Lets the user write
  //   `@skill:bmad-method 帮我做电商系统`
  // and have the server pull bmad-method out of the user library without the
  // client needing to manage state. The explicit `skill_name` body param wins
  // when both are present.
  let goal_text = goal.trim();
  let inline_skill_token: string | undefined;

  // W2 (Lane B) — Claude Code v2.1.88-style `/<id>:<cmd>` slash. Parsed BEFORE
  // `@skill:<id>` so that when both are present the slash wins (it's the more
  // specific target — a particular command inside a plugin). Skill-loader
  // registers commands/X.md as keys of the form `<id>:<X>` so SKILLS lookup
  // downstream just works.
  //
  // /review hardenings (2026-05-22):
  //   - Anchor at start-of-string or whitespace (NOT mid-URL) so a goal like
  //     "https://api.example.com/foo:bar" doesn't get parsed as a slash cmd.
  //     (finding A4)
  //   - Do NOT lowercase the captured token. canonical-id.ts preserves
  //     case, and SKILLS keys are case-sensitive (`BMAD-METHOD:prfaq` !=
  //     `bmad-method:prfaq`). (finding #1 / A3)
  const slashCmdRe = /(?:^|\s)\/([a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}):([a-zA-Z0-9][a-zA-Z0-9_-]{0,63})(?=\s|$)/;
  const sm = goal_text.match(slashCmdRe);
  if (sm) {
    inline_skill_token = `${sm[1]}:${sm[2]}`;
    goal_text = goal_text.replace(slashCmdRe, '').replace(/\s{2,}/g, ' ').trim();
    if (!goal_text) goal_text = '执行该 skill 命令。';
  } else {
    // @<id> / @skill:<id> / @skill <id> — canonical parser. Case-sensitive
    // capture (BMAD-METHOD ≠ bmad-method) per canonical-id.ts. Defends
    // against `user@gmail.com` accidentally matching as `@gmail`. The same
    // module backs the frontend SkillDropdown so UI and route agree on
    // exactly which tokens are recognised.
    const parsed = parseSkillToken(goal_text);
    if (parsed.skill_id) {
      inline_skill_token = parsed.skill_id;
      goal_text = parsed.remaining;
      if (!goal_text) {
        // user typed only "@bmad" / "@skill:foo" without a goal — fall back
        // to a generic prompt so the assembler always has something to act on
        goal_text = '用这个 skill 帮我开始一项任务。';
      }
    }
  }

  // Story 15.18 — multi-provider BYOK. Provider → key resolution (header →
  // settings/byok → env) lives in transport/byokKey.ts (shared with the Node
  // chat gateway groups-chat.ts). The `anthropic_key` field stays for
  // back-compat (15.7 / 15.19 test paths).

  // Story 15.18 — validate provider; reject unknown ids loudly with 400.
  let validated_provider: ProviderId = 'anthropic';
  if (typeof provider === 'string' && provider.trim().length > 0) {
    const candidate = provider.trim();
    if (!isProviderId(candidate)) {
      res.status(400).json({
        error: {
          code: 'INVALID_PROVIDER',
          message: `Unknown provider: "${candidate}". Allowed: ${PROVIDER_IDS.join(', ')}`,
        },
      });
      return;
    }
    validated_provider = candidate;
  }

  // Pick the API key for the chosen provider, in priority order:
  //   1. Per-request HTTP header (e.g. X-Zhipu-Key)        — overrides everything
  //   2. ByokSection's saved key in settings/byok          — the "UI-configured" path
  //   3. Per-provider env var (e.g. ZHIPU_API_KEY)         — last-resort default
  //
  // (2) is the critical fix for the "前端做了，后端没接上" class of bugs:
  // ByokSection writes apiKey to byok-config.json via PUT /api/settings/byok,
  // but until now run-sessions only read header + env, so configuring a
  // Zhipu/DeepSeek/OpenAI key in Settings did absolutely nothing at runtime.
  // 2026-05-29 — key 解析提炼到 transport/byokKey.ts（与 Node chat 网关
  // groups-chat.ts 共用同一策略：header → settings/byok → env）。
  const provider_api_key = resolveProviderKey(validated_provider, req.headers);

  // Back-compat field (still consumed by some legacy code paths). For the
  // anthropic provider it MUST mirror provider_api_key so the runner sees
  // the BYOK key whether it reads `anthropic_key` or `api_key`.
  const anthropic_key =
    validated_provider === 'anthropic'
      ? provider_api_key
      : (req.headers['x-anthropic-key'] as string | undefined) ||
        process.env.ANTHROPIC_API_KEY;

  // Story 15.5: validate design_system_id; unknown ids fall back to 'none' so
  // a stale client can never crash the run.
  const ds_id =
    typeof design_system_id === 'string' && DESIGN_SYSTEMS[design_system_id]
      ? design_system_id
      : 'none';

  // 2026-05-10 review M2 (15.5): explicit skill_name whitelist check. Unknown
  // skill_name 时显式回退到 'agent-team-blueprint'（默认）— 与 DS 注入链路保持
  // 一致，避免 SKILLS[skill_name] = undefined 时 DS injection 静默丢失。
  // OpenDesign 模式：skill resolve 时显式校验 + 默认 fallback。
  //
  // Story 16.x — explicit body param wins; inline @skill: token is the fallback.
  // Both must still resolve against the live SKILLS registry (populated by
  // hardcoded + FS + user-ingested skills via reloadSkills()).
  const skill_candidate =
    typeof skill_name === 'string' && skill_name
      ? skill_name
      : inline_skill_token;
  const validated_skill =
    skill_candidate && SKILLS[skill_candidate]
      ? skill_candidate
      : 'agent-team-blueprint';
  // 2026-06-01 — 用户是否显式指定了 skill(@skill:<id> 或显式 skill_name)。
  // 用于 assembler 的"组装意图"路由:显式时,Branch 2 兜底不走对话而走组装指令。
  const explicit_skill = !!skill_candidate;

  // Story 15.9 — validate and store generation overrides. Each helper returns
  // `undefined` for invalid input so the assembler falls back to env / default.
  // SHADOWFLOW_DEFAULT_MODEL env, when set, will still win at the assembler
  // boundary (see assembler.ts) — but we do NOT silently drop the env-locked
  // value here so the front-end can be honest about what it submitted.
  const validated_model = coerceModel(model);
  const validated_max_tokens = coerceMaxTokens(max_tokens);
  const validated_temperature = coerceTemperature(temperature);

  // Story 15.13 — sanitize multi-layer prompt assembly inputs.
  const validated_project_meta = coerceProjectMeta(project_meta);
  const validated_side_files =
    typeof side_files === 'string' && side_files.trim().length > 0 ? side_files : undefined;
  const validated_layer_toggles = coerceLayerToggles(layer_toggles);

  // Story 15.19 v2 — coerce executor. We accept any non-empty string and let
  // the dispatcher emit structured errors for unknown values; this keeps the
  // CLI registry data-driven and avoids hard-coding the list in two places.
  const validated_executor =
    typeof executor === 'string' && executor.trim().length > 0 ? executor.trim() : undefined;
  // CLI 工作目录:只接受非空绝对路径(Win 盘符 C:\… 或 POSIX /…)。相对路径丢弃。
  const validated_cwd =
    typeof cwd === 'string' && cwd.trim() && /^([a-zA-Z]:[\\/]|[\\/])/.test(cwd.trim())
      ? cwd.trim()
      : undefined;

  // ── Story 15.29 — conversation_id validate / auto-create ─────────────────
  // Three branches:
  //   (a) string + exists → use it
  //   (b) string + missing → 400 CONVERSATION_NOT_FOUND
  //   (c) wrong type → 400 INVALID_CONVERSATION_ID
  //   (d) undefined → auto-create anonymous conversation under 'default' project
  let validated_conversation_id: string;
  if (typeof conversation_id === 'string') {
    if (!getConversation(conversation_id)) {
      res.status(400).json({
        error: {
          code: 'CONVERSATION_NOT_FOUND',
          message: `conversation ${conversation_id} not found`,
        },
      });
      return;
    }
    validated_conversation_id = conversation_id;
  } else if (conversation_id !== undefined) {
    res.status(400).json({
      error: {
        code: 'INVALID_CONVERSATION_ID',
        message: 'conversation_id must be a string when provided',
      },
    });
    return;
  } else {
    const project = getOrCreateProject('default', 'Default Project');
    const conv = createConversation(project.project_id);
    validated_conversation_id = conv.conversation_id;
  }

  const session_id = uuidv4();
  sessionStore.set(session_id, {
    goal: goal_text,
    skill_name: validated_skill,
    explicit_skill,
    skill_requested: skill_candidate || undefined,
    output_hint,
    workspace_id,
    mode,
    anthropic_key,
    provider: validated_provider,
    api_key: provider_api_key,
    design_system_id: ds_id,
    model: validated_model,
    max_tokens: validated_max_tokens,
    temperature: validated_temperature,
    project_meta: validated_project_meta ?? null,
    side_files: validated_side_files,
    layer_toggles: validated_layer_toggles,
    executor: validated_executor,
    cwd: validated_cwd,
    conversation_id: validated_conversation_id,
    auto_critique: typeof auto_critique === 'boolean' ? auto_critique : undefined,
    created_at: Date.now(),
    updated_at: Date.now(),
  });

  // Clean up sessions idle longer than the TTL (last-activity based, not
  // created-at — see SESSION_TTL_MS). An actively-viewed session is touched on
  // every /stream attach, so revisits never trip this.
  const ttlCutoff = Date.now() - SESSION_TTL_MS;
  for (const [id, sess] of sessionStore.entries()) {
    if (sessionLastActivity(sess) < ttlCutoff) sessionStore.delete(id);
  }

  console.log(
    `[run-sessions] Created session ${session_id} skill=${sessionStore.get(session_id)?.skill_name} ds=${ds_id}` +
      ` provider=${validated_provider} hasKey=${provider_api_key ? 'yes' : 'no'}` +
      ` model=${validated_model ?? '(default)'} max_tokens=${validated_max_tokens ?? '(default)'}` +
      ` temperature=${validated_temperature ?? '(default)'} goal="${goal.slice(0, 60)}"`,
  );

  res.status(201).json({
    session_id,
    stream_url: `/api/run-sessions/${session_id}/stream`,
    // Story 15.29 — always echo back; client may have omitted (auto-created
    // anonymous conv). Front-end stores this so the next visit auto-selects it.
    conversation_id: validated_conversation_id,
  });
});

// ── POST /api/run-sessions/:id/messages ──────────────────────────────────────
//
// Follow-up turn within an existing run-session's conversation. Each follow-up
// becomes a NEW run session that **inherits all settings** from the source
// (skill_name / DS / provider / BYOK key / model overrides / conversation_id),
// only the `goal` is replaced with the new user message.
//
// Story 15.29 prompt-assembly auto-pulls conversation history via the
// `conversation_id` layer, so the LLM sees prior turns as context — no
// extra wiring needed here.
//
// Returns the SAME envelope shape as POST /api/run-sessions so the front-end
// can just open a new EventSource on the returned stream_url.
router.post('/:id/messages', (req: Request, res: Response) => {
  const sourceId = req.params.id;
  const source = sessionStore.get(sourceId);
  if (!source) {
    res.status(404).json({
      error: { code: 'SESSION_NOT_FOUND', message: `Run session ${sourceId} not found` },
    });
    return;
  }

  const body = (req.body ?? {}) as {
    content?: unknown;
    goal?: unknown;
    // 2026-05-16 — follow-ups (incl. resend) may override the picker selection
    // so users can fix a 401 by switching provider/model in the input bar.
    // Undefined values inherit from source; explicit values replace.
    model?: unknown;
    provider?: unknown;
    api_key?: unknown;
    anthropic_key?: unknown;
    executor?: unknown;
    cwd?: unknown;
  };
  // Accept either `content` (chat-style payload that the RunSessionPage send box
  // uses) or `goal` (mirrors POST /api/run-sessions). content wins when both
  // are present so the chat UX is unambiguous.
  const raw = typeof body.content === 'string' ? body.content : typeof body.goal === 'string' ? body.goal : '';
  const content = raw.trim();
  if (!content) {
    res.status(400).json({
      error: { code: 'EMPTY_CONTENT', message: 'content (or goal) must be a non-empty string' },
    });
    return;
  }

  const new_session_id = uuidv4();
  const overrides: Partial<typeof source> = {};
  if (typeof body.model === 'string' && body.model.length > 0) overrides.model = body.model;
  if (typeof body.provider === 'string' && body.provider.length > 0) overrides.provider = body.provider as typeof source.provider;
  if (typeof body.api_key === 'string') overrides.api_key = body.api_key;
  if (typeof body.anthropic_key === 'string') overrides.anthropic_key = body.anthropic_key;
  if (typeof body.executor === 'string') overrides.executor = body.executor;
  // CLI 工作目录:follow-up 可改;仅接受绝对路径(否则保留 source 继承值)。
  if (typeof body.cwd === 'string' && /^([a-zA-Z]:[\\/]|[\\/])/.test(body.cwd.trim())) {
    overrides.cwd = body.cwd.trim();
  }

  sessionStore.set(new_session_id, {
    ...source,
    ...overrides,
    goal: content,
    // Reset created_at so the 1h-cleanup window restarts for the follow-up turn.
    created_at: Date.now(),
  });

  console.log(
    `[run-sessions] Follow-up message: source=${sourceId} → new=${new_session_id} ` +
      `conversation=${source.conversation_id ?? '(none)'} content="${content.slice(0, 60)}"` +
      ` overrides=${Object.keys(overrides).join(',') || '(none)'}`,
  );

  res.status(201).json({
    session_id: new_session_id,
    stream_url: `/api/run-sessions/${new_session_id}/stream`,
    conversation_id: source.conversation_id,
  });
});

// ── GET /api/run-sessions/:id/stream ─────────────────────────────────────────

router.get('/:id/stream', async (req: Request, res: Response) => {
  const { id } = req.params;
  const session = sessionStore.get(id);

  if (!session) {
    res.status(404).json({ error: `Session ${id} not found` });
    return;
  }

  // Viewing a session counts as activity — refresh its TTL so a run the user
  // keeps open / comes back to never expires mid-use (2026-06-01).
  touchSession(id);

  // Set SSE headers — must be set before any write
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');  // Disable nginx buffering
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  // T3-1: this connection is a VIEW onto a persistent run. The run owns the
  // AbortController (so a cancel persists across reconnects) and the buffered
  // event log; we attach a sink that writes frames to THIS response.
  const run = runBus.ensure(id);
  const abortController = run.abort; // alias — existing signal refs keep working

  // S0.1 (intent-workflow-design-v1 §4.0) — periodic SSE heartbeat. Without
  // this, idle Vite/nginx proxies cut the connection after ~30s of silence
  // (Claude "thinking" + long YAML emit easily exceed this), the front-end
  // hits the "已达最大重试次数" alert and the run looks broken. We write a
  // comment frame (`: heartbeat\n\n`) every 15s — comment frames per SSE
  // spec are ignored by EventSource but reset proxy timers. Per-connection.
  const HEARTBEAT_MS = 15_000;
  const heartbeatTimer = setInterval(() => {
    if (res.writableEnded) {
      clearInterval(heartbeatTimer);
      return;
    }
    try {
      res.write(': heartbeat\n\n');
    } catch {
      clearInterval(heartbeatTimer);
    }
  }, HEARTBEAT_MS);

  // SSE sink: writes one buffered/live event frame to THIS response. The `id:`
  // field lets the browser resume via Last-Event-ID after a drop. Error-code
  // classification happens at emit time (see sendEvent), so replayed frames
  // already carry the normalized 6-bucket code.
  const sink: RunEventSink = {
    send: (rec) => {
      if (res.writableEnded) return;
      const line = `id: ${rec.id}\nevent: ${rec.event}\ndata: ${JSON.stringify(rec.data)}\n\n`;
      res.write(line);
      if (typeof (res as unknown as { flush?: () => void }).flush === 'function') {
        (res as unknown as { flush: () => void }).flush();
      }
    },
    end: () => {
      clearInterval(heartbeatTimer);
      if (!res.writableEnded) res.end();
    },
  };

  // Emit → run-event bus (buffer + fan out to all attached sinks). For `error`
  // events we normalize the code to the 6-bucket UI taxonomy (auth / rate_limit
  // / context_too_long / network / server / unknown) BEFORE buffering, so a
  // reconnect's replayed frames carry the normalized code. Original fine-grained
  // server code is preserved under `data.server_code`.
  const sendEvent = (event: string, data: unknown) => {
    let payload: unknown = data;
    if (event === 'error' && data && typeof data === 'object') {
      const d = data as Record<string, unknown>;
      const rawCode = typeof d.code === 'string' ? d.code : undefined;
      const message = typeof d.message === 'string' ? d.message : undefined;
      const stderrTail = typeof d.stderr_tail === 'string' ? d.stderr_tail : undefined;
      const status = typeof d.status === 'number' ? d.status : undefined;
      const uiCode = classifyErrorCode({
        code: rawCode,
        message,
        stderr_tail: stderrTail,
        status,
      });
      payload = {
        ...d,
        code: uiCode,
        ...(rawCode && rawCode !== uiCode ? { server_code: rawCode } : {}),
      };
    }
    runBus.emit(id, event, payload);
  };

  // Confirm connection (comment frame, ignored by EventSource). MUST be sent
  // BEFORE attach(): a reconnect to an already-terminal run makes attach()
  // replay the buffer then synchronously call sink.end() (res.end()). Any write
  // after that throws ERR_STREAM_WRITE_AFTER_END and crashes the process — so
  // the connected frame goes out first, while the response is still open.
  if (!res.writableEnded) res.write(': connected\n\n');

  // Resume cursor: ?after=N (our fetch client) or Last-Event-ID header (native
  // EventSource reconnect). attach() replays the buffered events with id > after,
  // then registers this sink for live events (or ends immediately if terminal).
  const afterRaw = req.query.after ?? req.headers['last-event-id'];
  const after = Number(Array.isArray(afterRaw) ? afterRaw[0] : afterRaw) || 0;
  const detach = runBus.attach(id, after, sink);

  // Client disconnect: detach this view ONLY. We deliberately do NOT abort the
  // run — it stays alive so the client can reconnect and resume from its cursor
  // (OpenDesign semantics; root-cause fix for "reconnect re-runs the LLM").
  // Explicit cancellation goes through POST /:id/abort → runBus.cancel.
  req.on('close', () => {
    clearInterval(heartbeatTimer);
    detach();
  });

  console.log(
    `[run-sessions] SSE view attached for session ${id} (after=${after}) skill=${session.skill_name}`,
  );

  // T3-1: run the pipeline EXACTLY ONCE. The first connection claims the start
  // and drives the LLM/assembler, emitting into the bus; reconnects get
  // claimStart()===false here and fall straight through to the end of the
  // handler — they are already attached above and stream the buffered + live
  // events via their sink. (Body kept at its original indentation to keep this
  // a surgical diff: it is the same code, now guarded + routed through the bus.)
  if (!runBus.claimStart(id)) {
    return;
  }

  // S1.2 — TS-side classify frame. Synchronous keyword classifier; runs in ~µs
  // so we can emit it right after the connection handshake, parallel to the
  // LLM warming up. LLM will later emit its own <sf:classify .../> via the
  // parser (which doesn't set a `source` attr — front-end treats unset as
  // 'llm'). Two frames coexist so the UI can surface a divergence warning.
  try {
    const tsClassify = classifyTS(session.goal);
    sendEvent('classify', {
      output_type: tsClassify.kind === 'task' ? 'workflow' : tsClassify.kind,
      mode: 'team',
      confidence: tsClassify.confidence,
      complexity: 2,
      source: 'ts',
      reasons: tsClassify.reasons,
    });
  } catch (e) {
    // Never let a classifier bug kill the run — log + skip.
    console.error(`[run-sessions] classifyTS failed for session ${id}:`, e);
  }

  // S2.3 — per-step accumulator. Parser brackets each step with `assemble`
  // running/done; node/edge/blueprint/classify events arriving between them
  // belong to the currently-open step. On `done` we package a StepArtifact
  // and persist via stepStoreSingleton.put() + emit `step-artifact`.
  interface OpenStep {
    step_index: number;
    step_name: string;
    output_kind: OutputKind;
    started_at: string;
    nodes: unknown[];
    edges: unknown[];
    yaml?: { filename: string; content: string };
    classify?: unknown;
  }
  const openSteps = new Map<number, OpenStep>();
  let currentStepIndex: number | null = null;

  // Story 15.8 — capture run outcome for persistence after generator drains.
  let artifactInfo: {
    type: ArtifactType | null;
    filename: string | null;
    url: string | null;
  } = { type: null, filename: null, url: null };
  let sawError = false;
  let sawComplete = false;
  // Story 15.29 — collect text deltas + the most recent error message so the
  // finally block can synthesize a useful assistant message. We don't store
  // a full transcript (cap at 4 KB, only used when no artifact / error fires).
  let collectedStreamText = '';
  let lastErrorMessage: string | null = null;
  // Story 15.29 — stable run_id used by both saveRun() and the assistant
  // message. Mirrors the legacy `run-${session_id.slice(0, 8)}` shape.
  const persistedRunId = `run-${id.slice(0, 8)}`;

  // Story 15.29 — write user message at stream start. We do this before
  // runSkillAssembler so chat history is consistent even if the LLM call
  // immediately fails (NO_API_KEY, etc.). Failure to write must NOT crash
  // the stream (try/catch + console.error per spec AC5).
  if (session.conversation_id) {
    try {
      appendMessage(session.conversation_id, {
        role: 'user',
        content: session.goal,
        run_id: null, // run_id is not yet known at user-message time
      });
    } catch (e) {
      console.error(
        `[run-sessions] failed to write user message for session ${id}:`,
        e,
      );
    }
  }

  // Story 15.13 — multi-layer prompt assembly. Replaces the 15.5 manual
  // `skill + ds.injection` concat. Order: discovery → identity → ds → skill
  // → project → sides → framework. Each layer is independently togglable;
  // empty / disabled layers drop without leaving separators behind.
  const skillForPrompt = SKILLS[session.skill_name];
  const ds = DESIGN_SYSTEMS[session.design_system_id ?? 'none'];
  // Story 15.12 integration — when POST body did not pass an explicit `side_files`
  // bypass, auto-load from `.shadowflow/skills/<skill_name>/{assets,references}/`.
  const sideFilesAuto = session.side_files
    ? { prompt: session.side_files, files: [], truncated: false }
    : loadSkillSideFiles(session.skill_name);
  // Story 15.29 — render conversation history block from sqlite. We exclude the
  // user message we just wrote above (created_at is monotonic ascending so the
  // very last row is "this turn's goal" — repeating it inside the history layer
  // is duplicative). Truncate single assistant content > 1024 char and cap the
  // total injected block at 4096 char (drop oldest first) to keep the prompt
  // sane regardless of conversation length.
  const conversationHistoryBlock = renderConversationHistoryBlock(
    session.conversation_id,
  );
  if (conversationHistoryBlock) {
    console.log(
      `[run-sessions] injecting conversation_history (chars=${conversationHistoryBlock.length})`,
    );
  }
  const compose = composeSystemPrompt({
    ds_injection: ds?.injection_prompt,
    skill_system_prompt: skillForPrompt?.system_prompt,
    skill_mode: skillForPrompt?.mode,
    project_meta: session.project_meta ?? null,
    conversation_history: conversationHistoryBlock,
    side_files: sideFilesAuto.prompt || undefined,
    layer_toggles: session.layer_toggles,
  });
  // Emit compose event BEFORE the assembler kicks off so the front-end /
  // inspector sees the layer manifest first. Payload is metadata-only —
  // never the prompt text itself (avoids SSE bloat + prompt leakage).
  sendEvent('compose', {
    layers: compose.layers_included,
    skipped: compose.layers_skipped,
    total_chars: compose.total_chars,
    ds_id: ds?.ds_id ?? null,
    skill_id: session.skill_name,
    framework: compose.framework,
  });

  try {
    // S0 (2026-05-20) — synthesizeTeamRun 不再默认触发。skill 即使带 team.skill.yaml
    // 也走 runSkillAssembler 真 LLM 路径。原写死回放路径降级为 opt-in fallback:
    //   GET /api/run-sessions/:id/stream?fallback=synthetic
    // 仅在 BYOK key 配置错 / 离线 demo / LLM 不可用兜底时使用。设计稿见
    // docs/design/skill-team-conversion-design-v1.md §G "ShadowFlow 路径选择"。
    let teamSpec = skillForPrompt?.team;
    const wantSyntheticFallback = req.query.fallback === 'synthetic';

    // S6.10-D demo aid — `?fallback=synthetic` + no teamSpec is the common
    // case for users who didn't pick a Team Skill (the default
    // `agent-team-blueprint` has no team_ref). Without a fallback team the
    // synthetic path is unreachable, the assembler runs for real, and a
    // missing API key returns 4 meta events then closes — the front-end then
    // burns retries reconnecting to the same dead session. To make the
    // demo URL trick `?fallback=synthetic` always work, load the BMAD team
    // yaml from the global library as the default rehearsal script.
    if (wantSyntheticFallback && !teamSpec) {
      try {
        const result = loadGlobalTeam('BMAD-METHOD');
        if (result.team) {
          teamSpec = {
            name: result.team.name,
            mode: result.team.mode,
            policy: result.team.policy,
            retry: result.team.retry,
            agents: result.resolvedAgents,
            edges: result.team.edges_v1.map(e => ({ from: e.from, to: e.to })),
            loaded_at: result.team.loaded_at,
            source_dir: result.team.source_dir,
          };
          console.log(`[run-sessions] fallback=synthetic + no teamSpec → loaded BMAD demo team`);
        }
      } catch (err) {
        console.warn(`[run-sessions] fallback=synthetic BMAD demo team load failed:`, err);
      }
    }

    // 2026-05-20 — Team-first vs Agent-first prompt 分流
    // teamSpec 存在（Skill Pack 有团队蓝图，如 BMAD/gSTACK）→ team-first，
    //   LLM 先 emit "挑选 Team 蓝图" 再 "配置 Agent 角色"。
    // teamSpec 不存在（裸 agent-team-blueprint，用户自由 chat）→ agent-first，
    //   LLM 跳过 "挑选 Team 蓝图"，直接从 goal 推导 agent 名单。
    // 注意：当前 system_prompt 已 layer-composed，含 team-first phase-1。
    // agent-first 时需要把 phase-1 重组，所以 reassemble。
    let effectiveSystemPrompt = compose.prompt;
    if (!teamSpec && skillForPrompt?.system_prompt === composeMultiTurnPrompt('team-first')) {
      // 通用 agent-team-blueprint skill + 无 team yaml → agent-first 流
      effectiveSystemPrompt = compose.prompt.replace(
        composeMultiTurnPrompt('team-first'),
        composeMultiTurnPrompt('agent-first'),
      );
      console.log(`[run-sessions] no teamSpec → agent-first prompt flow`);
    }

    // 2026-05-27 — respect literal "create one agent" intent. When the goal
    // explicitly asks for a single agent (and not a team), hard-cap the roster
    // at one node so "帮我创建一个开发工程师agent" no longer expands into a
    // 3-agent squad. Deterministic detector lives in lib/intent-router.ts.
    const singleAgentIntent = detectExplicitSingleAgent(session.goal);
    if (singleAgentIntent.single) {
      effectiveSystemPrompt += SINGLE_AGENT_DIRECTIVE;
      console.log(
        `[run-sessions] explicit single-agent intent ("${singleAgentIntent.matched}") → roster capped at 1`,
      );
    }

    const generator = teamSpec && wantSyntheticFallback
      ? synthesizeTeamRun(teamSpec, id, abortController.signal)
      : runSkillAssembler({
          goal: session.goal,
          skill_name: session.skill_name,
          explicit_skill: session.explicit_skill,
          skill_requested: session.skill_requested,
          session_id: id,
          anthropic_key: session.anthropic_key,
          signal: abortController.signal,
          system_prompt: effectiveSystemPrompt,
          // Story 15.9 — forward sanitized generation overrides. assembler.ts
          // applies env/default fallbacks when each is undefined.
          model: session.model,
          max_tokens: session.max_tokens,
          temperature: session.temperature,
          // Story 15.19 v2 — forward executor; assembler defaults to skill.executor
          // → 'anthropic-direct' when undefined, preserving back-compat.
          executor: session.executor,
          // 2026-05-30 — CLI 工作目录(用户选的);空 → assembler 回退到产物目录。
          cwd: session.cwd,
          // Story 15.18 — provider + api_key forwarded; default executor runner
          // dispatches into llm-providers/. CLI / ACP runners ignore them.
          provider: session.provider,
          api_key: session.api_key,
        });
    if (teamSpec && wantSyntheticFallback) {
      console.log(
        `[run-sessions] explicit synthetic fallback for skill=${session.skill_name} (${teamSpec.agents.length} agent(s), no LLM)`,
      );
    } else if (teamSpec) {
      console.log(
        `[run-sessions] skill=${session.skill_name} has team yaml (${teamSpec.agents.length} agent(s)) but routing to LLM assembler (S0 default).`,
      );
    }

    // ── S6.10-A — TimelineMessage projector ──────────────────────────────
    // Derive Trae/Codex-style ordered timeline (user_turn → assistant_meta →
    // step_panel/thinking/diff_panel/msg_foot) from the legacy fine-grained
    // event stream. Emits `message` + `message-patch` SSE frames in addition
    // to the legacy events. Legacy stream is untouched — front-end can
    // subscribe to either or both during migration. See lib/timeline-projector.ts.
    // P3 fix (audit 2026-05-27 §2.6): seed the projector with the session id so
    // message ids are deterministic across SSE reconnects (this handler re-runs
    // the whole pipeline per connection). Stable ids → the front-end overwrites
    // by id instead of appending a duplicate user_turn on every reconnect.
    const projector = createTimelineProjector({ idSeed: id });
    const flushProjector = (emit: {
      messages: import('../lib/contracts').TimelineMessage[];
      patches: import('../lib/contracts').MessagePatch[];
    }) => {
      for (const m of emit.messages) sendEvent('message', m);
      for (const p of emit.patches) sendEvent('message-patch', p);
    };
    // Open the turn — anchor it to the human-typed goal so user_turn appears
    // as the first timeline row.
    flushProjector(projector.onUserMessage(session.goal));

    for await (const { event, data } of generator) {
      if (abortController.signal.aborted) break;
      sendEvent(event, data);
      console.log(`[run-sessions] → event:${event}`, JSON.stringify(data).slice(0, 80));

      // ── S6.10-A — fan out into TimelineMessage / MessagePatch ─────────
      // Each legacy event drives the projector (lib/timeline-projector.ts),
      // which returns 0+ new messages and 0+ patches. Forward them as
      // dedicated SSE frames so the next-gen front-end can render a single
      // ordered list keyed by message id. Wrapped in try so a projector
      // bug never blocks legacy event forwarding.
      try {
        if (event === 'classify' && data && typeof data === 'object') {
          flushProjector(projector.onClassify(data as Record<string, unknown>));
        } else if (event === 'assemble' && data && typeof data === 'object') {
          const d = data as {
            status?: string;
            step?: string;
            step_index?: number;
            elapsed_ms?: number | null;
          };
          if (d.status === 'running' && typeof d.step_index === 'number') {
            flushProjector(projector.onAssembleStart(d.step_index, d.step ?? ''));
          } else if (d.status === 'done' && typeof d.step_index === 'number') {
            flushProjector(projector.onAssembleDone(d.step_index, d.elapsed_ms ?? 0));
          }
        } else if (event === 'agent-substep' && data && typeof data === 'object') {
          const d = data as {
            node_id?: string;
            substep?: string;
            status?: string;
            elapsed_ms?: number | null;
          };
          if (d.node_id && d.substep) {
            if (d.status === 'running') flushProjector(projector.onAgentSubstepStart(d.node_id, d.substep));
            else if (d.status === 'done') flushProjector(projector.onAgentSubstepDone(d.node_id, d.substep, d.elapsed_ms ?? 0));
          }
        } else if (event === 'thinking-chunk' && data && typeof data === 'object') {
          const d = data as { text?: string };
          if (typeof d.text === 'string') flushProjector(projector.onThinkingChunk(d.text));
        } else if (event === 'blueprint' && data && typeof data === 'object') {
          const d = data as { filename?: string; yaml?: string };
          flushProjector(projector.onBlueprint({ filename: d.filename, yaml: d.yaml }));
        } else if (event === 'yaml-line' && data && typeof data === 'object') {
          const d = data as { line?: string };
          if (typeof d.line === 'string') flushProjector(projector.onYamlLine(d.line));
        } else if (event === 'text' && data && typeof data === 'object') {
          const d = data as { text?: string };
          if (typeof d.text === 'string') flushProjector(projector.onText(d.text));
        } else if (event === 'raw' && data && typeof data === 'object') {
          // T3: unclassified content → collapsed raw block (never the answer).
          const d = data as { text?: string; source?: string };
          if (typeof d.text === 'string') flushProjector(projector.onRaw(d.text, d.source));
        } else if (event === 'tool-use' && data && typeof data === 'object') {
          // T3 tool chain: surface tool invocations as tool_call messages so
          // the timeline's tool-group card renders them (previously dropped).
          const d = data as { name?: string; input?: unknown };
          if (typeof d.name === 'string') flushProjector(projector.onToolUse(d.name, d.input));
        } else if (event === 'tool-result' && data && typeof data === 'object') {
          const d = data as { output?: unknown };
          const out = typeof d.output === 'string' ? d.output : d.output != null ? JSON.stringify(d.output) : '';
          if (out) flushProjector(projector.onToolResult(out));
        } else if (event === 'usage' && data && typeof data === 'object') {
          // T3 usage chain: token usage → msg_foot tokens (was previously
          // forwarded as a legacy event but never projected into the timeline).
          flushProjector(projector.onUsage(data as Record<string, number>));
        } else if (event === 'unknown-tag' && data && typeof data === 'object') {
          // T3: unrecognized <sf:foo>…</sf:foo> block content was previously
          // dropped. Surface its body as a raw block so nothing vanishes silently.
          const d = data as { name?: string; body?: string };
          if (typeof d.body === 'string' && d.body.trim()) {
            flushProjector(projector.onRaw(d.body, `unknown-tag:${d.name ?? '?'}`));
          }
        } else if (event === 'complete') {
          flushProjector(projector.onComplete());
        }
      } catch (projectorErr) {
        // Projector failures are non-fatal — legacy event already sent.
        console.error(`[run-sessions] timeline-projector error on event=${event}:`, projectorErr);
      }

      // ── S2.3 — per-step payload accumulation ────────────────────────────
      // `assemble:running` opens a step; `node`/`edge`/`blueprint`/`classify`
      // events inside the bracket attach to it; `assemble:done` closes it,
      // builds a StepArtifact, persists, and emits `step-artifact`.
      if (event === 'assemble' && data && typeof data === 'object') {
        const d = data as {
          status?: string;
          step?: string;
          step_index?: number;
          output_kind?: OutputKind;
        };
        const sIdx = typeof d.step_index === 'number' ? d.step_index : null;
        if (d.status === 'running' && sIdx !== null) {
          // Drop any silently-orphaned previous open step for this index.
          openSteps.set(sIdx, {
            step_index: sIdx,
            step_name: d.step ?? '',
            output_kind: (d.output_kind ?? 'none') as OutputKind,
            started_at: new Date().toISOString(),
            nodes: [],
            edges: [],
          });
          currentStepIndex = sIdx;
        } else if ((d.status === 'done' || d.status === 'failed') && sIdx !== null) {
          const open = openSteps.get(sIdx);
          if (open) {
            let payload: unknown = null;
            if (open.output_kind === 'nodes') payload = open.nodes;
            else if (open.output_kind === 'edges') payload = open.edges;
            else if (open.output_kind === 'yaml') payload = open.yaml ?? null;
            else if (open.output_kind === 'classify') payload = open.classify ?? null;

            // "No mock" — only emit step-artifact when there's real content
            // (or the step is intentionally 'none' with no observable output).
            // The disk record still lands so retry/resume sees the step ran.
            const hasContent =
              (Array.isArray(payload) && payload.length > 0) ||
              (payload !== null && !Array.isArray(payload));

            const artifact: StepArtifact = {
              session_id: id,
              step_index: open.step_index,
              step_name: open.step_name,
              output_kind: open.output_kind,
              payload,
              started_at: open.started_at,
              finished_at: new Date().toISOString(),
              status: d.status === 'failed' ? 'failed' : 'done',
            };
            try {
              stepStoreSingleton.put(id, open.step_index, artifact);
            } catch (e) {
              console.error(`[run-sessions] stepStore.put failed:`, e);
            }
            if (hasContent || open.output_kind === 'none') {
              sendEvent('step-artifact', {
                step_index: open.step_index,
                step_name: open.step_name,
                output_kind: open.output_kind,
                payload,
              });
            }
            openSteps.delete(sIdx);
          }
          if (currentStepIndex === sIdx) currentStepIndex = null;
        }
      } else if (event === 'node' && currentStepIndex !== null) {
        const open = openSteps.get(currentStepIndex);
        if (open) open.nodes.push(data);
      } else if (event === 'edge' && currentStepIndex !== null) {
        const open = openSteps.get(currentStepIndex);
        if (open) open.edges.push(data);
      } else if (event === 'blueprint' && currentStepIndex !== null && data && typeof data === 'object') {
        const open = openSteps.get(currentStepIndex);
        if (open) {
          const d = data as { yaml?: unknown; filename?: unknown };
          open.yaml = {
            filename: typeof d.filename === 'string' ? d.filename : 'output.yml',
            content: typeof d.yaml === 'string' ? d.yaml : '',
          };
        }
      } else if (event === 'classify' && currentStepIndex !== null) {
        // Only LLM-emitted classify lands here — the TS-side classify above
        // fires before any step is open (currentStepIndex === null) so it
        // never pollutes step payload.
        const open = openSteps.get(currentStepIndex);
        if (open) open.classify = data;
      }

      // Capture latest artifact info (last blueprint wins — usually only one).
      if (event === 'blueprint' && data && typeof data === 'object') {
        const d = data as {
          artifact_type?: unknown;
          filename?: unknown;
          artifact_url?: unknown;
        };
        const type = coerceArtifactType(d.artifact_type);
        const filename = typeof d.filename === 'string' ? d.filename : null;
        const url = typeof d.artifact_url === 'string' ? d.artifact_url : null;
        if (type || filename || url) {
          artifactInfo = { type, filename, url };
        }
      } else if (event === 'error') {
        sawError = true;
        // Story 15.29 — capture error message for the assistant message.
        if (data && typeof data === 'object') {
          const d = data as { message?: unknown };
          if (typeof d.message === 'string') lastErrorMessage = d.message;
        }
      } else if (event === 'complete') {
        sawComplete = true;
      } else if (event === 'token' || event === 'text-delta') {
        // Story 15.29 — collect a slim transcript so the finally block has
        // *something* to write back when no artifact fires (e.g. answer mode).
        // Hard-cap at 4 KB to bound memory.
        if (collectedStreamText.length < 4096 && data && typeof data === 'object') {
          const d = data as { text?: unknown };
          if (typeof d.text === 'string') {
            collectedStreamText = (collectedStreamText + d.text).slice(0, 4096);
          }
        }
      }
    }
  } catch (err) {
    if (abortController.signal.aborted) {
      // Expected — client disconnected.
      console.log(`[run-sessions] stream cancelled for session ${id}`);
    } else {
      console.error(`[run-sessions] Stream error for session ${id}:`, err);
      sawError = true;
      // Emit unconditionally — the bus buffers it so reconnecting clients still
      // see the error even if no view is currently attached.
      sendEvent('error', {
        // sendEvent() runs classifyErrorCode() against this message; the
        // regexes will sort 5xx / ECONNREFUSED / 401 surfacing in `err`.
        code: 'INTERNAL_ERROR',
        message: `Internal server error during assembly: ${(err as Error)?.message ?? String(err)}`,
        session_id: id,
      });
    }
  } finally {
    // Story 15.14 — Auto-critique pass. Only when we saw a complete event AND
    // the client did not disconnect AND we know which artifact to evaluate.
    // We run critique BEFORE res.end() so the front-end can subscribe to the
    // critique-progress / critique-result events on the same SSE stream.
    // Critique failure NEVER breaks the main flow (saveRun + res.end still run).
    // 2026-05-11 review F4 (15.14 AC6): server-side opt-out from settings.json.
    // sf.auto_critique 默认 true（保留原行为）；用户可 PUT /api/settings/sf.auto_critique
    // false 跳过 critic 调用，节省 BYOK token。
    // 2026-05-11 follow-up — also honor per-request `body.auto_critique` so the
    // front-end GenerationSettings toggle (writes localStorage, forwarded via
    // createRunSession body) takes effect WITHOUT needing a settings.json
    // PUT round-trip. Body wins over server settings when explicit.
    const sessionAutoCritique = (session as unknown as Record<string, unknown>).auto_critique;
    const autoCritique =
      typeof sessionAutoCritique === 'boolean'
        ? sessionAutoCritique
        : getSetting('sf.auto_critique');
    const critiqueEnabled = autoCritique === undefined || autoCritique === true;
    if (
      sawComplete &&
      !abortController.signal.aborted &&
      artifactInfo.filename &&
      critiqueEnabled
    ) {
      try {
        const userGoal = session.goal;
        const skillForCritique = SKILLS[session.skill_name];
        // SkillDefinition currently has no `steps` field (Story 15.10 may add it
        // via SKILL.md frontmatter); read it defensively as an optional bag.
        const expectedSteps =
          ((skillForCritique as unknown as { steps?: unknown })?.steps as string[] | undefined) ??
          [];
        const critOut = await runCritique(
          {
            session_id: id,
            filename: artifactInfo.filename,
            user_goal: userGoal,
            expected_steps: expectedSteps,
            // 2026-05-11 review F1: 真功能 bug 修复 — sessionStore 字段是 `api_key`
            // (15.18 multi-provider 改名后)，非 `anthropic_key`。原代码读 undefined →
            // BYOK 用户的 critique 永远走 env fallback，无 env 时立刻 NO_API_KEY 降级。
            anthropic_key: session.api_key,
          },
          (stage, message) => sendEvent('critique-progress', { stage, message }),
        );
        sendEvent('critique-result', {
          session_id: id,
          artifact: artifactInfo.filename,
          scores: critOut.scores,
          overall_summary: critOut.overall_summary,
          lint_summary: critOut.lint_summary,
          duration_ms: critOut.duration_ms,
          error_code: critOut.error_code ?? null,
          error_message: critOut.error_message ?? null,
        });
      } catch (critErr) {
        // Defensive — runCritique should never throw, but if it does we still
        // emit a degraded result so the front-end stops spinning.
        console.error(`[run-sessions] critique unexpected error for session ${id}:`, critErr);
        sendEvent('critique-result', {
          session_id: id,
          artifact: artifactInfo.filename,
          scores: null,
          overall_summary: `[critique threw: ${critErr instanceof Error ? critErr.message : String(critErr)}]`,
          lint_summary: { errors: 0, warnings: 0, infos: 0 },
          duration_ms: 0,
          error_code: 'CRITIQUE_FAILED',
          error_message: critErr instanceof Error ? critErr.message : String(critErr),
        });
      }
    }

    // T3-1: mark the run terminal. runBus.finish() flushes `end()` to EVERY
    // attached view (closing each res + clearing its heartbeat), so we no longer
    // res.end() this one connection directly — a reconnect that attaches after
    // we finish will replay the buffer then end immediately (attach() handles
    // the terminal case). Status: failed iff we saw an error and no complete.
    runBus.finish(id, sawError && !sawComplete ? 'failed' : 'succeeded');
    console.log(`[run-sessions] run ${id} finished (complete=${sawComplete} error=${sawError})`);

    // Persist run record — only when the stream actually terminated (not when
    // the client aborted mid-flight). A 'complete' OR an explicit 'error'
    // event both count as termination.
    if (!abortController.signal.aborted && (sawComplete || sawError)) {
      try {
        const skill = SKILLS[session.skill_name];
        saveRun({
          run_id: persistedRunId,
          session_id: id,
          goal: session.goal,
          skill_name: session.skill_name,
          skill_display_name: skill?.name ?? session.skill_name,
          artifact_type: artifactInfo.type,
          artifact_filename: artifactInfo.filename,
          artifact_url: artifactInfo.url,
          status: sawError && !sawComplete ? 'failed' : 'completed',
          created_at: new Date(session.created_at).toISOString(),
          completed_at: new Date().toISOString(),
          project_dir: `.shadowflow/projects/${id}`,
        });
      } catch (persistErr) {
        // Don't fail the response just because we couldn't persist the
        // run record — the SSE stream is already over. Log and move on.
        console.error(`[run-sessions] saveRun failed for session ${id}:`, persistErr);
      }
    }

    // ── Story 15.29 — write assistant message to conversation log ─────────
    // Always run (even on client abort) so the chat timeline is complete.
    // Content priority:
    //   1. artifact preview ("[Generated artifact: <filename>]")
    //   2. collected stream text (1st 1024 chars)
    //   3. abort marker
    //   4. error marker
    //   5. empty fallback
    // Writing failure NEVER reaches the client (try/catch + console.error).
    if (session.conversation_id) {
      let summary: string;
      if (artifactInfo.filename) {
        summary = `[Generated artifact: ${artifactInfo.filename}]`;
      } else if (stripLeakedSseFrames(collectedStreamText).trim().length > 0) {
        // P2 — control-frame channel isolation (root-cure plan §5). NEVER
        // persist frame-shaped text as assistant content: if it lands in the
        // conversation log it gets re-injected as CONVERSATION HISTORY next
        // turn, the LLM parrots the frame shape, and the whole turn collapses
        // into sse-frame-leak `raw` blocks. Sanitize at the WRITE side so a
        // frame can never enter storage in the first place; the read-side
        // strip in renderConversationHistoryBlock then only has to clean up
        // legacy rows written before this guard existed.
        const clean = stripLeakedSseFrames(collectedStreamText).trim();
        summary = clean.slice(0, 1024);
        if (clean.length > 1024) summary += '…(truncated)';
      } else if (abortController.signal.aborted) {
        summary = '[run aborted by user]';
      } else if (sawError) {
        summary = lastErrorMessage
          ? `[run failed: ${lastErrorMessage}]`
          : '[run failed]';
      } else {
        summary = '[run completed without artifact]';
      }
      try {
        appendMessage(session.conversation_id, {
          role: 'assistant',
          content: summary,
          // Only attach run_id when saveRun actually ran (terminated runs).
          run_id:
            !abortController.signal.aborted && (sawComplete || sawError)
              ? persistedRunId
              : null,
        });
      } catch (e) {
        console.error(
          `[run-sessions] failed to write assistant message for session ${id}:`,
          e,
        );
      }
    }
  }
});

// ── POST /api/run-sessions/:id/steps/:n/retry ────────────────────────────────
//
// S4.1 (intent-workflow-design-v1 §4.5) — step-level retry.
//
// Spec-compliant v2 would replay 0..n-1 produced artifacts into a fresh LLM
// call and restart from step n. MVP-fallback shipped here:
//   - drop step n..N from on-disk + in-memory state
//   - signal any active SSE stream via a `retry-pending` event
//   - return 202 with {strategy:'full_rerun', kept_steps, cleared_steps}
//
// The front-end is expected to open a new run (createRunSession) for the
// rerun; we do NOT auto-start it server-side so the endpoint stays
// idempotent and trivial to reason about. Future v2 will keep 0..n-1 and
// resume from n without dropping context.
router.post('/:id/steps/:n/retry', (req: Request, res: Response) => {
  const { id, n } = req.params;
  const session = sessionStore.get(id);
  if (!session) {
    res.status(404).json({
      error: { code: 'SESSION_NOT_FOUND', message: `Run session ${id} not found` },
    });
    return;
  }
  const stepN = Number.parseInt(n, 10);
  if (!Number.isInteger(stepN) || stepN < 0 || stepN > 99) {
    res.status(400).json({
      error: { code: 'INVALID_STEP_INDEX', message: `step index ${n} out of range 0..99` },
    });
    return;
  }

  const all = stepStoreSingleton.list(id);
  const cleared = all.filter((s) => s.step_index >= stepN).map((s) => s.step_index);
  const kept = all.filter((s) => s.step_index < stepN).map((s) => s.step_index);

  // Drop ALL on-disk state for this session — the in-memory list rebuilds on
  // the next run. step-store.clear() removes <session_id>/steps/.
  stepStoreSingleton.clear(id);

  // T3-1: surface retry-pending to currently-attached views, then reset the run
  // so the next GET /stream connection re-runs from scratch (full_rerun). Without
  // the reset, claimStart would return false on the existing (terminal) run and
  // the reconnect would only replay the old buffer instead of re-executing.
  runBus.emit(id, 'retry-pending', {
    session_id: id,
    from_step: stepN,
    cleared_steps: cleared,
    strategy: 'full_rerun',
  });
  runBus.reset(id);

  console.log(
    `[run-sessions] retry requested session=${id} from_step=${stepN} cleared=${cleared.join(',') || '(none)'}`,
  );

  res.status(202).json({
    session_id: id,
    strategy: 'full_rerun',
    from_step: stepN,
    cleared_steps: cleared,
    kept_steps: kept,
  });
});

// ── POST /api/run-sessions/:id/resume ────────────────────────────────────────
//
// S4.2 (intent-workflow-design-v1 §4.5) — resume from the last completed step.
// MVP-fallback shape mirrors S4.1: identify the next step we'd run, signal an
// active stream via `resume-pending`, return 202. If every persisted step is
// already `done` AND no active stream exists, return 410 Gone (session is
// already complete — there's nothing to resume).
router.post('/:id/resume', (req: Request, res: Response) => {
  const { id } = req.params;
  const session = sessionStore.get(id);
  if (!session) {
    res.status(404).json({
      error: { code: 'SESSION_NOT_FOUND', message: `Run session ${id} not found` },
    });
    return;
  }

  const all = stepStoreSingleton.list(id);
  const lastDone = [...all].reverse().find((s) => s.status === 'done');
  const resumeFrom = lastDone ? lastDone.step_index + 1 : 0;

  const run = runBus.get(id);
  const active = Boolean(run && !runBus.isTerminal(run.status));
  const allDone = all.length > 0 && all.every((s) => s.status === 'done');
  if (allDone && !active) {
    res.status(410).json({
      error: {
        code: 'SESSION_COMPLETE',
        message: `Run session ${id} has already completed (last done step ${lastDone?.step_index ?? '?'}).`,
      },
    });
    return;
  }

  console.log(
    `[run-sessions] resume requested session=${id} from_step=${resumeFrom} (last_done=${lastDone?.step_index ?? 'none'})`,
  );

  // T3-1: surface resume-pending to attached views, then reset so the next
  // connection re-runs (see retry endpoint for rationale).
  runBus.emit(id, 'resume-pending', {
    session_id: id,
    from_step: resumeFrom,
    strategy: 'full_rerun',
  });
  runBus.reset(id);

  res.status(202).json({
    session_id: id,
    strategy: 'full_rerun',
    from_step: resumeFrom,
    kept_steps: all.filter((s) => s.step_index < resumeFrom).map((s) => s.step_index),
  });
});

// ── POST /api/run-sessions/:id/abort ─────────────────────────────────────────
//
// 2026-05-16 — User pressed "Stop" in the run-session composer. Cancel the
// upstream LLM call via the per-stream AbortController, write a final SSE
// 'aborted' event so any still-connected client sees a reason, and drop the
// session from the in-memory store so subsequent GET /stream calls 404.
//
// Behavior:
//   - active stream exists      → abort + close + 204
//   - session exists, no stream → drop from store + 204
//   - nothing found             → 404 (lets the front-end know it was a no-op
//                                 BUT useRunSession.abort already updated UI
//                                 so this is purely informational)
//
// Always idempotent: a second POST after the first succeeds returns 404 and
// the UI shrugs it off.
router.post('/:id/abort', (req: Request, res: Response) => {
  const { id } = req.params;
  const run = runBus.get(id);
  const session = sessionStore.get(id);

  if (!run && !session) {
    res.status(404).json({
      error: { code: 'SESSION_NOT_FOUND', message: `Run session ${id} not found` },
    });
    return;
  }

  // T3-1: cancel through the bus. We first emit an `aborted` frame so every
  // attached view (and any reconnect that replays the buffer) sees the reason,
  // then runBus.cancel() aborts the run's AbortController — the pipeline's
  // for-await breaks on the signal and its finally{} calls runBus.finish()
  // (idempotent with cancel's own finish, which ends all views).
  if (run && !runBus.isTerminal(run.status)) {
    console.log(`[run-sessions] client requested abort for session ${id}`);
    runBus.emit(id, 'aborted', { session_id: id, reason: 'user_requested' });
    runBus.cancel(id);
  }

  // Drop the session record so a stale client cannot reconnect.
  sessionStore.delete(id);
  res.status(204).end();
});

// ────────────────────────────────────────────────────────────────────────────
// S6.3 — Skill team synthesizer
//
// When a skill ships a structured `team.skill.yaml`, we don't need the LLM.
// Persona, model params, tools, memory, IO contracts — everything lives in
// the skill files already. We replay them as an SSE event stream identical
// in shape to what `runSkillAssembler` would produce, so the existing
// step-artifact accumulation logic (S2.3) downstream works unchanged.
//
// Why a synthesizer instead of letting the LLM read team.skill.yaml? Three
// reasons: (1) determinism — same input always produces the same UI;
// (2) zero token cost — substantial for paying users; (3) provenance —
// the front-end can claim "from reader.skill.yaml#persona" and mean it,
// because the byte arrived from disk, not from a model that might have
// paraphrased.
//
// Goal is intentionally absent from the synthesized run; skill-backed teams
// are by definition pre-designed. The goal still appears in `compose` /
// session metadata for later inspection, and a future "validation"
// pre-pass could add an optional LLM thinking-step before this generator
// fires. Out of scope for S6.x.
// ────────────────────────────────────────────────────────────────────────────

async function pace(ms: number, signal: AbortSignal): Promise<void> {
  // Light per-event delay so the front-end sees a "streaming" feel instead
  // of one synchronous flush. Returns immediately on abort.
  await new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(t);
      resolve();
    }, { once: true });
  });
}

function synthesizeYaml(team: TeamDef): string {
  const lines: string[] = [];
  lines.push(`# auto-generated by ShadowFlow · team.skill.yaml`);
  lines.push(`team: ${team.name}`);
  lines.push(`mode: ${team.mode ?? 'serial'}`);
  if (team.policy) lines.push(`policy: ${team.policy}`);
  if (typeof team.retry === 'number') lines.push(`retry: ${team.retry}`);
  lines.push(`agents:`);
  for (const a of team.agents) {
    lines.push(`  - id: ${a.id}`);
    lines.push(`    title: ${a.title}`);
    lines.push(`    type: ${a.type ?? 'agent'}`);
    lines.push(`    model: ${a.model.id}`);
    lines.push(`    tools:`);
    for (const t of a.tools.picked) {
      lines.push(`      - ${t}`);
    }
    if (a.memory) lines.push(`    memory: ${a.memory}`);
  }
  if (team.edges.length > 0) {
    lines.push(`edges:`);
    for (const e of team.edges) {
      lines.push(`  - { from: ${e.from}, to: ${e.to} }`);
    }
  } else {
    lines.push(`edges: []`);
  }
  return lines.join('\n');
}

/** Build the per-substep source ref used by SSE + the front-end provenance label. */
function substepSource(agent: TeamDef['agents'][number], substep: string): { source: string; tokens: number } {
  // identity is a synthetic slot (no skill anchor) — borrow team.skill.yaml provenance.
  if (substep === 'identity') {
    return { source: `team.skill.yaml#agents.${agent.id}`, tokens: Math.ceil((agent.title.length + (agent.sub?.length ?? 0)) / 4) };
  }
  const key = substep as SkillSlot;
  const anchor = agent.anchors[key];
  if (!anchor) return { source: `${agent.source_file}#${substep}`, tokens: 0 };
  return { source: anchor.ref, tokens: anchor.tokens };
}

async function* synthesizeTeamRun(
  team: TeamDef,
  sessionId: string,
  signal: AbortSignal,
): AsyncGenerator<{ event: string; data: unknown }> {
  const SUBSTEPS = ['identity', 'persona', 'model', 'tools', 'memory'] as const;
  // Pacing — small per-event delay so SSE feels streamed rather than flushed
  // all at once. Total run ~3-5s for a 4-agent team, comparable to a fast LLM
  // call without burning a single token.
  const DELAY_EVENT = 30;
  const DELAY_SUBSTEP = 80;
  const DELAY_STEP = 200;

  yield {
    event: 'classify',
    data: {
      output_type: 'workflow',
      mode: 'team',
      confidence: 0.98,
      complexity: Math.min(5, Math.max(1, team.agents.length)),
      source: 'skill-team',
    },
  };
  await pace(DELAY_EVENT, signal);

  // Step 0 — 分析目标需求
  yield { event: 'assemble', data: { step: '分析目标需求', step_index: 0, output_kind: 'none', status: 'running', elapsed_ms: null } };
  await pace(DELAY_STEP, signal);
  yield {
    event: 'thinking-chunk',
    data: {
      step: '分析目标需求',
      text: `命中 skill team "${team.name}" — 从 team.skill.yaml 直接派生 ${team.agents.length} 个 agent，跳过 LLM 生成。`,
    },
  };
  await pace(DELAY_EVENT, signal);
  yield { event: 'assemble', data: { step: '分析目标需求', step_index: 0, output_kind: 'none', status: 'done', elapsed_ms: DELAY_STEP } };

  // Step 1 — 挑选 Team 蓝图
  yield { event: 'assemble', data: { step: '挑选 Team 蓝图', step_index: 1, output_kind: 'none', status: 'running', elapsed_ms: null } };
  await pace(DELAY_STEP, signal);
  yield {
    event: 'thinking-chunk',
    data: {
      step: '挑选 Team 蓝图',
      text: `mode=${team.mode ?? 'serial'} · policy=${team.policy ?? 'strict'} · retry=${team.retry ?? 3} · edges=${team.edges.length}`,
    },
  };
  await pace(DELAY_EVENT, signal);
  yield { event: 'assemble', data: { step: '挑选 Team 蓝图', step_index: 1, output_kind: 'none', status: 'done', elapsed_ms: DELAY_STEP } };

  // Step 2 — 配置 Agent 角色 (the big one — emits nodes + 5 substeps each + persona)
  yield { event: 'assemble', data: { step: '配置 Agent 角色', step_index: 2, output_kind: 'nodes', status: 'running', elapsed_ms: null } };
  let agentStepElapsed = 0;
  for (const agent of team.agents) {
    if (signal.aborted) return;
    // Emit node first so the front-end has a target for the substeps.
    yield {
      event: 'node',
      data: {
        node_id: agent.id,
        type: agent.type ?? 'agent',
        title: agent.title,
        sub: agent.sub ?? '',
        chips: [agent.model.id, ...agent.tools.picked.slice(0, 2)].filter(Boolean),
        status: 'building',
        avatar_char: agent.avatar_char ?? agent.title.charAt(0),
        model: agent.model.id,
        memory: agent.memory,
        tools_picked: agent.tools.picked,
        tools_candidate: agent.tools.candidate,
        persona: agent.persona.split('\n').find((l: string) => l.trim().length > 0)?.slice(0, 80),
        skill_ref: agent.source_file,
        temperature: agent.model.temperature,
        max_tokens: agent.model.max_tokens,
        context_window: agent.model.context_window,
        io_input: agent.io?.inputs?.expects ?? undefined,
        io_output: agent.io?.outputs?.produces ?? undefined,
      },
    };
    await pace(DELAY_EVENT, signal);

    // Persona body comes as a paired tag with provenance.
    yield {
      event: 'agent-persona',
      data: {
        node_id: agent.id,
        persona: agent.persona,
        source: agent.anchors.persona.ref,
        tokens: agent.anchors.persona.tokens,
        cached: true,
      },
    };
    await pace(DELAY_EVENT, signal);

    // 5 substeps per agent. Each fires running → done with paced delay so the
    // front-end's auto-follow has time to anchor-scroll.
    for (const substep of SUBSTEPS) {
      if (signal.aborted) return;
      const { source, tokens } = substepSource(agent, substep);
      yield {
        event: 'agent-substep',
        data: {
          node_id: agent.id,
          substep,
          status: 'running',
          elapsed_ms: null,
          source,
          tokens,
          cached: true,
        },
      };
      await pace(DELAY_SUBSTEP, signal);
      yield {
        event: 'agent-substep',
        data: {
          node_id: agent.id,
          substep,
          status: 'done',
          elapsed_ms: DELAY_SUBSTEP,
          source,
          tokens,
          cached: true,
        },
      };
      agentStepElapsed += DELAY_SUBSTEP * 2;
    }
  }
  yield { event: 'assemble', data: { step: '配置 Agent 角色', step_index: 2, output_kind: 'nodes', status: 'done', elapsed_ms: agentStepElapsed } };

  // 2026-05-20 — 对齐 v3 设计稿 step 4-5：「设置工具集」+「Policy 协作规则」。
  // Step 3 = 设置工具集（这里 emit YAML blueprint，因为 YAML 已经含 tools 列）。
  // Step 4 = Policy 协作规则（emit edges + team.policy/mode/retry 摘要）。
  // 旧 "生成 YAML Blueprint" / "配置 Team Workflow" 是实现细节，不再做可见 step label。

  // Step 3 — 设置工具集 (carries YAML blueprint emission)
  yield { event: 'assemble', data: { step: '设置工具集', step_index: 3, output_kind: 'yaml', status: 'running', elapsed_ms: null } };
  await pace(DELAY_STEP, signal);
  const yamlText = synthesizeYaml(team);
  const yamlFilename = `${team.name.replace(/\./g, '-')}.yml`;
  yield {
    event: 'blueprint',
    data: {
      yaml: yamlText,
      filename: yamlFilename,
      artifact_type: 'yaml',
      artifact_url: `/projects/${sessionId}/${yamlFilename}`,
    },
  };
  const yamlLines = yamlText.split('\n');
  for (const line of yamlLines) {
    if (signal.aborted) return;
    yield { event: 'yaml-line', data: { line, total_lines: yamlLines.length } };
    await pace(20, signal);
  }
  yield { event: 'assemble', data: { step: '设置工具集', step_index: 3, output_kind: 'yaml', status: 'done', elapsed_ms: DELAY_STEP + yamlLines.length * 20 } };

  // Step 4 — Policy 协作规则 (edges + policy summary)
  yield { event: 'assemble', data: { step: 'Policy 协作规则', step_index: 4, output_kind: 'edges', status: 'running', elapsed_ms: null } };
  await pace(DELAY_STEP, signal);
  // policy summary text event so the UI can show "mode=serial · policy=strict · retry=3" in left pane
  yield {
    event: 'policy',
    data: {
      mode: team.mode ?? 'serial',
      policy: team.policy ?? 'strict',
      retry: team.retry ?? 3,
      edge_count: team.edges.length,
    },
  };
  for (const edge of team.edges) {
    if (signal.aborted) return;
    yield { event: 'edge', data: { from: edge.from, to: edge.to, status: 'active' } };
    await pace(DELAY_EVENT, signal);
  }
  yield { event: 'assemble', data: { step: 'Policy 协作规则', step_index: 4, output_kind: 'edges', status: 'done', elapsed_ms: DELAY_STEP + team.edges.length * DELAY_EVENT } };

  yield {
    event: 'complete',
    data: {
      session_id: sessionId,
      run_id: `run-${sessionId.slice(0, 8)}`,
      redirect: `/editor?session=${sessionId}`,
    },
  };
}

export default router;
