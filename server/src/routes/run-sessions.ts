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

const MODEL_ALLOWLIST = new Set<string>([
  'claude-sonnet-4-6',
  'claude-opus-4',
  'claude-haiku-4-5',
]);

const MAX_TOKENS_MIN = 1024;
const MAX_TOKENS_MAX = 32768;

function coerceModel(raw: unknown): string | undefined {
  return typeof raw === 'string' && MODEL_ALLOWLIST.has(raw) ? raw : undefined;
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

// In-memory session store (session_id → options)
const sessionStore = new Map<string, SessionRecord>();

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
  };

  if (!goal || typeof goal !== 'string' || goal.trim().length === 0) {
    res.status(400).json({ error: 'goal is required and must be a non-empty string' });
    return;
  }

  // Story 15.18 — multi-provider BYOK header dispatch. Each provider has its
  // own header (X-Anthropic-Key / X-OpenAI-Key / X-DeepSeek-Key / X-Zhipu-Key);
  // express lower-cases keys. We coerce + validate `provider` first, then read
  // the matching header, falling back to the per-provider env var. The
  // `anthropic_key` field stays for back-compat (15.7 / 15.19 test paths).
  const HEADER_BY_PROVIDER: Record<ProviderId, string> = {
    anthropic: 'x-anthropic-key',
    openai: 'x-openai-key',
    deepseek: 'x-deepseek-key',
    zhipu: 'x-zhipu-key',
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

  // Pick the API key for the chosen provider only — we do NOT eagerly read
  // all four headers (that would log all keys when DEBUG=1). Header wins
  // over env so a hosted server with env-defaulted keys stays overridable.
  const headerName = HEADER_BY_PROVIDER[validated_provider];
  const provider_api_key =
    (req.headers[headerName] as string | undefined) ||
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
  const validated_skill =
    typeof skill_name === 'string' && SKILLS[skill_name]
      ? skill_name
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
    goal: goal.trim(),
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

  // Helper to write a named SSE event
  const sendEvent = (event: string, data: unknown) => {
    if (res.writableEnded) return;
    const line = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    res.write(line);
    if (typeof (res as unknown as { flush?: () => void }).flush === 'function') {
      (res as unknown as { flush: () => void }).flush();
    }
  };

  // Wire client disconnect → AbortController → Claude stream cancellation.
  const abortController = new AbortController();
  req.on('close', () => {
    if (!abortController.signal.aborted) {
      console.log(`[run-sessions] client disconnected, aborting session ${id}`);
      abortController.abort();
    }
  });

  // Send a heartbeat comment to confirm connection
  res.write(': connected\n\n');

  console.log(`[run-sessions] Starting SSE stream for session ${id} skill=${session.skill_name}`);

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
    const generator = runSkillAssembler({
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

    for await (const { event, data } of generator) {
      if (res.writableEnded || abortController.signal.aborted) break;
      sendEvent(event, data);
      console.log(`[run-sessions] → event:${event}`, JSON.stringify(data).slice(0, 80));

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
        sendEvent('error', { message: 'Internal server error during assembly', session_id: id });
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
    // false 跳过 critic 调用，节省 BYOK token。UI toggle 留 follow-up Story。
    const autoCritique = getSetting('sf.auto_critique');
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

    if (!res.writableEnded) {
      res.end();
    }
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

export default router;
