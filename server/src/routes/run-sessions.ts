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
import { saveRun, type ArtifactType } from '../storage/runs';
import { getSetting } from '../storage/settings';
import { SKILLS } from '../skills';
import { DESIGN_SYSTEMS } from '../design-systems';
import { composeSystemPrompt, type LayerToggles } from '../prompt-assembly';
import { loadSkillSideFiles } from '../loaders/skill-side-files';
import {
  PROVIDER_ENV_VAR,
  PROVIDER_IDS,
  isProviderId,
  type ProviderId,
} from '../llm-providers';
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
// S1.2 (intent-workflow-design-v1 §4.1) — TS-side intent classifier. Runs in
// the SSE handler before the assembler kicks off so the front-end gets a
// `classify` frame within ~1ms of stream open (LLM's own <sf:classify .../>
// arrives many seconds later, after parser extraction). Two frames coexist;
// front-end may diff them for consistency (S5.2 future story).
import { classifyTS } from '../lib/intent-router';
// S2.3 (intent-workflow-design-v1 §4.4) — step artifact persistence + per-step
// SSE frame. Parser fires node/edge/blueprint between `assemble:running` and
// `assemble:done`; we collect them per open step, then on `done` package a
// StepArtifact → stepStore.put() + emit `step-artifact` for the front-end.
import { createStepStore } from '../lib/step-store';
import type { OutputKind, StepArtifact } from '../lib/contracts';
// S6.3 — skill-team synthesizer. When the active skill ships a structured
// team.skill.yaml we bypass the LLM entirely and stream the design straight
// from disk. Deterministic, free, and perfectly matches the v3 stacked
// AgentDetail because every byte already lives in the skill files.
import type { TeamDef, SkillSlot } from '../lib/skill-types';

const router = Router();

interface SessionRecord {
  goal: string;
  skill_name: string;
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
  created_at: number;
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
    let body = m.content;
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
const sessionStore = createSessionStore<SessionRecord>();
void sessionStore.loadAll();

// S2.3 — module-level singleton. One bucket per session; cleanup happens
// alongside sessionStore's 1h TTL sweep (clear() on session delete is
// effectively handled by the step-store's idempotent disk-removal).
const stepStoreSingleton = createStepStore();

// 2026-05-16 — Active stream registry. Lets POST /api/run-sessions/:id/abort
// reach into the currently-open SSE handler and trigger its AbortController
// (cancels the upstream LLM call) + end the response. Entries are added on
// stream open and removed in the finally{} block.
interface ActiveStream {
  abort: AbortController;
  res: Response;
}
const activeStreams = new Map<string, ActiveStream>();

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
  const skillTokenRe = /@skill[:\s]+([a-z0-9][a-z0-9_-]{0,63})/i;
  const m = goal_text.match(skillTokenRe);
  if (m) {
    inline_skill_token = m[1].toLowerCase();
    goal_text = goal_text.replace(skillTokenRe, '').replace(/\s{2,}/g, ' ').trim();
    if (!goal_text) {
      // user typed only "@skill:foo" without a goal — fall back to a generic prompt
      goal_text = '用这个 skill 帮我开始一项任务。';
    }
  }

  // Story 15.18 — multi-provider BYOK header dispatch. Each provider has its
  // own header (X-Anthropic-Key / X-OpenAI-Key / X-DeepSeek-Key / X-Zhipu-Key
  // / …); express lower-cases keys. We coerce + validate `provider` first,
  // then read the matching header, falling back to the per-provider env var
  // and the byok-config.json store. The `anthropic_key` field stays for
  // back-compat (15.7 / 15.19 test paths).
  //
  // 2026-05-16: extended from 4 → 12 providers in lockstep with the BYOK UI.
  const HEADER_BY_PROVIDER: Record<ProviderId, string> = {
    anthropic:  'x-anthropic-key',
    openai:     'x-openai-key',
    deepseek:   'x-deepseek-key',
    zhipu:      'x-zhipu-key',
    google:     'x-google-key',
    qwen:       'x-qwen-key',
    moonshot:   'x-moonshot-key',
    mistral:    'x-mistral-key',
    groq:       'x-groq-key',
    openrouter: 'x-openrouter-key',
    ollama:     'x-ollama-key',
    lmstudio:   'x-lmstudio-key',
    azure:      'x-azure-key',
  };

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
  const headerName = HEADER_BY_PROVIDER[validated_provider];
  const byokStored = (() => {
    try {
      const cfg = getSetting('byok') as
        | { providers?: Record<string, { apiKey?: string }> }
        | undefined;
      const k = cfg?.providers?.[validated_provider]?.apiKey;
      return typeof k === 'string' && k.trim().length > 0 ? k.trim() : undefined;
    } catch {
      return undefined;
    }
  })();
  const provider_api_key =
    (req.headers[headerName] as string | undefined) ||
    byokStored ||
    process.env[PROVIDER_ENV_VAR[validated_provider]];

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
    conversation_id: validated_conversation_id,
    auto_critique: typeof auto_critique === 'boolean' ? auto_critique : undefined,
    created_at: Date.now(),
  });

  // Clean up old sessions (older than 1 hour)
  const oneHourAgo = Date.now() - 3_600_000;
  for (const [id, sess] of sessionStore.entries()) {
    if (sess.created_at < oneHourAgo) sessionStore.delete(id);
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

  // Set SSE headers — must be set before any write
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');  // Disable nginx buffering
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  // Helper to write a named SSE event. For `error` events we run the payload
  // through classifyErrorCode() so the front-end always sees the 6-bucket UI
  // code (auth / rate_limit / context_too_long / network / server / unknown)
  // on `data.code`. The original fine-grained server code is preserved under
  // `data.server_code` for logs/debugging without breaking existing readers
  // that key off `code` (e.g. the BYOK banner regex).
  const sendEvent = (event: string, data: unknown) => {
    if (res.writableEnded) return;
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
    const line = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
    res.write(line);
    if (typeof (res as unknown as { flush?: () => void }).flush === 'function') {
      (res as unknown as { flush: () => void }).flush();
    }
  };

  // Wire client disconnect → AbortController → Claude stream cancellation.
  const abortController = new AbortController();

  // S0.1 (intent-workflow-design-v1 §4.0) — periodic SSE heartbeat. Without
  // this, idle Vite/nginx proxies cut the connection after ~30s of silence
  // (Claude "thinking" + long YAML emit easily exceed this), the front-end
  // hits the "已达最大重试次数" alert and the run looks broken. We write a
  // comment frame (`: heartbeat\n\n`) every 15s — comment frames per SSE
  // spec are ignored by EventSource but reset proxy timers. cleared on
  // req close so we never write after res.end().
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

  req.on('close', () => {
    clearInterval(heartbeatTimer);
    if (!abortController.signal.aborted) {
      console.log(`[run-sessions] client disconnected, aborting session ${id}`);
      abortController.abort();
    }
  });

  // 2026-05-16 — Publish this stream so POST /:id/abort can find it.
  activeStreams.set(id, { abort: abortController, res });

  // Send a heartbeat comment to confirm connection
  res.write(': connected\n\n');

  console.log(`[run-sessions] Starting SSE stream for session ${id} skill=${session.skill_name}`);

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
    const teamSpec = skillForPrompt?.team;
    const wantSyntheticFallback = req.query.fallback === 'synthetic';
    const generator = teamSpec && wantSyntheticFallback
      ? synthesizeTeamRun(teamSpec, id, abortController.signal)
      : runSkillAssembler({
          goal: session.goal,
          skill_name: session.skill_name,
          session_id: id,
          anthropic_key: session.anthropic_key,
          signal: abortController.signal,
          system_prompt: compose.prompt,
          // Story 15.9 — forward sanitized generation overrides. assembler.ts
          // applies env/default fallbacks when each is undefined.
          model: session.model,
          max_tokens: session.max_tokens,
          temperature: session.temperature,
          // Story 15.19 v2 — forward executor; assembler defaults to skill.executor
          // → 'anthropic-direct' when undefined, preserving back-compat.
          executor: session.executor,
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

    for await (const { event, data } of generator) {
      if (res.writableEnded || abortController.signal.aborted) break;
      sendEvent(event, data);
      console.log(`[run-sessions] → event:${event}`, JSON.stringify(data).slice(0, 80));

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
      if (!res.writableEnded) {
        sendEvent('error', {
          // sendEvent() runs classifyErrorCode() against this message; the
          // regexes will sort 5xx / ECONNREFUSED / 401 surfacing in `err`.
          code: 'INTERNAL_ERROR',
          message: `Internal server error during assembly: ${(err as Error)?.message ?? String(err)}`,
          session_id: id,
        });
      }
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
      !res.writableEnded &&
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

    // S0.1 — ensure heartbeat stops whatever the exit path (success, error,
    // abort). req.on('close') already clears it on client disconnect but we
    // also exit via the for-await / catch paths.
    clearInterval(heartbeatTimer);
    if (!res.writableEnded) {
      res.end();
    }
    // 2026-05-16 — drop from active registry whatever the exit reason.
    activeStreams.delete(id);
    console.log(`[run-sessions] Stream ended for session ${id}`);

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
      } else if (collectedStreamText.trim().length > 0) {
        summary = collectedStreamText.slice(0, 1024);
        if (collectedStreamText.length > 1024) summary += '…(truncated)';
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

  const stream = activeStreams.get(id);
  if (stream && !stream.res.writableEnded) {
    try {
      const line = `event: retry-pending\ndata: ${JSON.stringify({
        session_id: id,
        from_step: stepN,
        cleared_steps: cleared,
        strategy: 'full_rerun',
      })}\n\n`;
      stream.res.write(line);
    } catch (e) {
      console.warn(`[run-sessions] retry-pending emit failed for ${id}:`, e);
    }
  }

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

  const stream = activeStreams.get(id);
  const allDone = all.length > 0 && all.every((s) => s.status === 'done');
  if (allDone && !stream) {
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

  if (stream && !stream.res.writableEnded) {
    try {
      const line = `event: resume-pending\ndata: ${JSON.stringify({
        session_id: id,
        from_step: resumeFrom,
        strategy: 'full_rerun',
      })}\n\n`;
      stream.res.write(line);
    } catch (e) {
      console.warn(`[run-sessions] resume-pending emit failed for ${id}:`, e);
    }
  }

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
  const stream = activeStreams.get(id);
  const session = sessionStore.get(id);

  if (!stream && !session) {
    res.status(404).json({
      error: { code: 'SESSION_NOT_FOUND', message: `Run session ${id} not found` },
    });
    return;
  }

  if (stream) {
    console.log(`[run-sessions] client requested abort for session ${id}`);
    if (!stream.abort.signal.aborted) stream.abort.abort();
    // Best-effort: write a final aborted event so any other listeners on the
    // same EventSource can react. The for-await loop in the stream handler
    // already breaks on `signal.aborted`, then the finally{} block runs
    // res.end() + activeStreams.delete().
    try {
      if (!stream.res.writableEnded) {
        const line = `event: aborted\ndata: ${JSON.stringify({ session_id: id, reason: 'user_requested' })}\n\n`;
        stream.res.write(line);
      }
    } catch (e) {
      // SSE write race with res.end() — non-fatal.
      console.warn(`[run-sessions] aborted-event write failed for ${id}:`, e);
    }
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

  // Step 3 — 生成 YAML Blueprint
  yield { event: 'assemble', data: { step: '生成 YAML Blueprint', step_index: 3, output_kind: 'yaml', status: 'running', elapsed_ms: null } };
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
  yield { event: 'assemble', data: { step: '生成 YAML Blueprint', step_index: 3, output_kind: 'yaml', status: 'done', elapsed_ms: DELAY_STEP + yamlLines.length * 20 } };

  // Step 4 — 配置 Team Workflow (edges)
  yield { event: 'assemble', data: { step: '配置 Team Workflow', step_index: 4, output_kind: 'edges', status: 'running', elapsed_ms: null } };
  await pace(DELAY_STEP, signal);
  for (const edge of team.edges) {
    if (signal.aborted) return;
    yield { event: 'edge', data: { from: edge.from, to: edge.to, status: 'active' } };
    await pace(DELAY_EVENT, signal);
  }
  yield { event: 'assemble', data: { step: '配置 Team Workflow', step_index: 4, output_kind: 'edges', status: 'done', elapsed_ms: DELAY_STEP + team.edges.length * DELAY_EVENT } };

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
