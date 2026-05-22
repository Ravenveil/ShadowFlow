/**
 * assembler.ts — RunSession SSE event generator
 *
 * If ANTHROPIC_API_KEY is set: calls Claude to dynamically build agent structures.
 * Otherwise: uses keyword-based fallback simulation with realistic delays.
 *
 * Story 15.2 — added `runSkillAssembler` async generator that drives Claude
 * streaming + parser.ts to emit SSE events from skill system_prompt + goal.
 * The legacy `runAssembler` is preserved unchanged for backward compatibility.
 *
 * Phase 2 (2026-05-22) — Orchestration ⊥ Transport refactor:
 *   - team-backed skills go through `workflow/scheduler.runDag()` + artifact
 *     handoff (decision A3 daemon-led DAG, A2 artifact handoff).
 *   - non-team skills go through `LlmCallable.turn()` once (decision A6 O1).
 *   - All execution flows through a single `resolveCallable()` factory in
 *     `transport/dispatcher.ts`; assembler.ts no longer knows about provider
 *     routing tables or LLM tool_use loops.
 *   - Removes `buildApiClient()` (now inside `transport/ApiClientCallable.ts`)
 *     and `runTeamBackedSkill()` (replaced by `workflow/scheduler.runDag()`).
 *
 * See `docs/architecture/orchestration-transport.md` §"Phase 2 Eng Review · 决策记录".
 */

import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import { SKILLS } from './skills';
import { parseAndExtract, type SseEvent as ParserSseEvent } from './parser';
// Phase 2 A6 — single transport entry point. Replaces dispatchSkillRunner +
// buildApiClient. The factory returns a LlmCallable, and Orchestration drives
// it through `turn()` (non-team) or `workflow/scheduler.runDag()` (team).
import { resolveCallable } from './transport/dispatcher';
import { runDag } from './workflow/scheduler';
import type { TurnChunk } from './workflow/types';
import type { TeamDef } from './lib/skill-types';
import type { TeamDefV1 } from './lib/team-yaml';

export type OutputType = 'answer' | 'report' | 'review' | 'workflow';
export type SessionMode = 'single' | 'team';
export type NodeStatus = 'building' | 'ready' | 'pending';

export interface SseEvent {
  event: string;
  data: unknown;
}

export interface AssemblerOptions {
  goal: string;
  output_hint?: OutputType;
  workspace_id?: string;
  mode?: SessionMode;  // explicit user selection — takes priority over goal-length heuristic
  session_id: string;
  anthropic_key?: string;  // BYOK: user-supplied key from X-Anthropic-Key header
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function jitter(base: number, variance: number): number {
  return base + Math.floor((Math.random() * 2 - 1) * variance);
}

// ─── YAML Blueprint builder ───────────────────────────────────────────────────

interface AgentDef {
  node_id: string;
  type: 'coordinator' | 'agent';
  title: string;
  sub: string;
  chips: string[];
  role: string;
  avatar_char?: string;
}

function buildBlueprintYaml(
  sessionId: string,
  goal: string,
  outputType: OutputType,
  mode: SessionMode,
  agents: AgentDef[],
): string {
  const agentsYaml = agents
    .map(a => [
      `  - id: ${a.node_id}`,
      `    type: ${a.type}`,
      `    title: "${a.title}"`,
      `    role: "${a.role}"`,
      `    chips: [${a.chips.map(c => `"${c}"`).join(', ')}]`,
    ].join('\n'))
    .join('\n');

  const edges = agents.length > 1
    ? agents.slice(1).map(a => `  - {from: ${agents[0].node_id}, to: ${a.node_id}}`).join('\n')
    : '  []';

  return [
    `# ShadowFlow Blueprint`,
    `# Generated session: ${sessionId}`,
    `version: "1.0"`,
    `session_id: "${sessionId}"`,
    `output_type: "${outputType}"`,
    `mode: "${mode}"`,
    `goal: "${goal.replace(/"/g, '\\"')}"`,
    ``,
    `agents:`,
    agentsYaml,
    ``,
    `edges:`,
    edges,
  ].join('\n');
}

// ─── Step sequence emitter ─────────────────────────────────────────────────────

// 2026-05-20 — Step labels 对齐 v3 设计稿。原 6 个 step 合并到 5 个，与
// routes/run-sessions.ts:synthesizeTeamRun 一致：
//   分析目标需求 / 挑选 Team 蓝图 / 配置 Agent 角色 / 设置工具集 / Policy 协作规则
// 「完成」step 改为隐式（complete 事件本身就是终态信号，不再当 step 显示）。
const STEP_NAMES = [
  '分析目标需求',
  '挑选 Team 蓝图',
  '配置 Agent 角色',
  '设置工具集',
  'Policy 协作规则',
];

const STEP_DELAYS: [number, number][] = [
  [600, 200],   // 分析目标需求
  [800, 300],   // 挑选 Team 蓝图
  [700, 200],   // 配置 Agent 角色 (subseps 流式覆盖 base 延时)
  [500, 150],   // 设置工具集
  [600, 200],   // Policy 协作规则
];

// ─── Main async generator ──────────────────────────────────────────────────────

export async function* runAssembler(opts: AssemblerOptions): AsyncGenerator<SseEvent> {
  const { goal, output_hint, mode: modeHint, session_id, anthropic_key } = opts;
  const startMs = Date.now();

  // ── Step 1: 分析目标需求 ──
  yield { event: 'assemble', data: { step: STEP_NAMES[0], status: 'running' } };
  await sleep(jitter(STEP_DELAYS[0][0], STEP_DELAYS[0][1]));

  let outputType: OutputType;
  let mode: SessionMode;
  let agents: AgentDef[];
  let confidence: number;
  let complexity: number;

  const resolvedKey = anthropic_key || process.env.ANTHROPIC_API_KEY;

  if (!resolvedKey) {
    yield { event: 'error', data: { message: '未配置 Anthropic API Key。请在设置 → API 密钥 (BYOK) 中填入您的 sk-ant-... 密钥。', code: 'NO_API_KEY' } };
    return;
  }

  // ── Claude-powered path ──────────────────────────────────────────────────
  const client = new Anthropic({ apiKey: resolvedKey });

  const prompt = `You are an AI agent architect. Given a user goal, design an optimal agent team configuration.

User goal: "${goal}"
${output_hint ? `Preferred output type: ${output_hint}` : ''}

Respond with ONLY a valid JSON object (no markdown, no explanation):
{
  "output_type": "answer|report|review|workflow",
  "mode": "single|team",
  "confidence": 0.0-1.0,
  "complexity": 0.0-1.0,
  "agents": [
    {
      "node_id": "snake_case_id",
      "type": "coordinator|agent",
      "title": "中文标题 (2-6 chars)",
      "sub": "简短说明 (8-15 chars)",
      "chips": ["功能标签1", "功能标签2", "功能标签3"],
      "role": "role_name",
      "avatar_char": "单字"
    }
  ]
}

Rules:
- First agent MUST be type "coordinator" with node_id "coordinator"
- mode "single": 1 coordinator + 1 agent max
- mode "team": 1 coordinator + 2-4 agents
- Choose mode based on task complexity
- All text fields in Chinese
- chips array: exactly 2-3 items
`;

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = message.content[0].type === 'text' ? message.content[0].text : '';
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON in Claude response');

  const parsed = JSON.parse(jsonMatch[0]) as {
    output_type: OutputType;
    mode: SessionMode;
    confidence: number;
    complexity: number;
    agents: AgentDef[];
  };

  outputType = parsed.output_type ?? 'answer';
  mode = modeHint ?? parsed.mode ?? 'single';
  confidence = Math.min(1, Math.max(0, parsed.confidence ?? 0.85));
  complexity = Math.min(1, Math.max(0, parsed.complexity ?? 0.5));
  agents = parsed.agents ?? [];

  yield { event: 'assemble', data: { step: STEP_NAMES[0], status: 'done', elapsed_ms: Date.now() - startMs } };

  // ── Classify event ──
  yield {
    event: 'classify',
    data: { output_type: outputType, mode, confidence, complexity },
  };

  // 2026-05-20 — reorder + relabel 对齐 v3 设计稿 5-step 流程。
  // ── Step 2: 挑选 Team 蓝图 ──
  yield { event: 'assemble', data: { step: STEP_NAMES[1], status: 'running' } };
  await sleep(jitter(STEP_DELAYS[1][0], STEP_DELAYS[1][1]));
  yield { event: 'assemble', data: { step: STEP_NAMES[1], status: 'done', elapsed_ms: Date.now() - startMs } };

  // ── Step 3: 配置 Agent 角色 (emit nodes — substeps 由 LLM 流式产生时叠加) ──
  yield { event: 'assemble', data: { step: STEP_NAMES[2], status: 'running' } };
  // Emit nodes with staggered delays
  for (const agent of agents) {
    await sleep(jitter(350, 100));
    yield {
      event: 'node',
      data: {
        node_id: agent.node_id,
        type: agent.type,
        title: agent.title,
        sub: agent.sub,
        chips: agent.chips,
        status: 'building' as NodeStatus,
        avatar_char: agent.avatar_char,
      },
    };
  }
  // Mark nodes as ready
  await sleep(jitter(400, 150));
  for (const agent of agents) {
    yield {
      event: 'node',
      data: {
        node_id: agent.node_id,
        type: agent.type,
        title: agent.title,
        sub: agent.sub,
        chips: agent.chips,
        status: 'ready' as NodeStatus,
        avatar_char: agent.avatar_char,
      },
    };
  }
  yield { event: 'assemble', data: { step: STEP_NAMES[2], status: 'done', elapsed_ms: Date.now() - startMs } };

  // ── Step 4: 设置工具集 (emit YAML blueprint — YAML 自带 tools 列) ──
  yield { event: 'assemble', data: { step: STEP_NAMES[3], status: 'running' } };
  await sleep(jitter(STEP_DELAYS[3][0], STEP_DELAYS[3][1]));
  const blueprintYaml = buildBlueprintYaml(session_id, goal, outputType, mode, agents);
  const blueprintFilename = `blueprint-${session_id.slice(0, 8)}.yaml`;
  yield { event: 'blueprint', data: { yaml: blueprintYaml, filename: blueprintFilename } };
  yield { event: 'assemble', data: { step: STEP_NAMES[3], status: 'done', elapsed_ms: Date.now() - startMs } };

  // ── Step 5: Policy 协作规则 (emit edges + policy summary) ──
  yield { event: 'assemble', data: { step: STEP_NAMES[4], status: 'running' } };
  await sleep(jitter(STEP_DELAYS[4][0], STEP_DELAYS[4][1]));
  // Emit edges from coordinator to each agent
  if (agents.length > 1) {
    const coordinator = agents[0];
    for (const agent of agents.slice(1)) {
      await sleep(jitter(200, 80));
      yield {
        event: 'edge',
        data: { from: coordinator.node_id, to: agent.node_id, status: 'active' },
      };
    }
  }
  yield { event: 'assemble', data: { step: STEP_NAMES[4], status: 'done', elapsed_ms: Date.now() - startMs } };

  // ── Complete event ──
  yield {
    event: 'complete',
    data: {
      session_id,
      run_id: `run-${session_id.slice(0, 8)}`,
      redirect: `/editor?session=${session_id}`,
    },
  };
}

// ─── Skill-driven streaming generator (Story 15.2) ─────────────────────────────

export interface SkillAssemblerOptions {
  goal: string;
  skill_name: string;
  session_id: string;
  anthropic_key?: string;
  signal?: AbortSignal;
  /**
   * Story 15.5 — optional override for skill.system_prompt. When supplied, the
   * caller (route handler) has already composed any Design System injection
   * suffix; this generator stays agnostic of DS specifics.
   */
  system_prompt?: string;
  /**
   * Story 15.9 — generation overrides (UI → POST /api/run-sessions →
   * sessionStore → here). Resolution priority at the LlmCallable boundary:
   *   model:       opts.model ?? env(SHADOWFLOW_DEFAULT_MODEL) ?? 'claude-sonnet-4-6'
   *   max_tokens:  opts.max_tokens ?? 8192
   *   temperature: opts.temperature ?? (SDK default — field omitted)
   *
   * Note: env-locked model still wins by design — when SHADOWFLOW_DEFAULT_MODEL
   * is set the SettingsPage shows a "locked by env" hint so users know the
   * front-end value is informational only.
   */
  model?: string;
  max_tokens?: number;
  temperature?: number;
  /**
   * Phase 2 (2026-05-22) — executor selector. Resolution priority:
   *   opts.executor > skill.executor > 'anthropic-direct'
   * The transport dispatcher (`resolveCallable`) validates the value
   * (cli:<id> / acp:<id> / mcp:<spec> / byok:<provider> / anthropic-direct)
   * and throws `LlmCallError` for unknown / missing executors — no silent
   * downgrading.
   */
  executor?: string;
  /**
   * Story 15.18 — provider selector. Forwarded into the `byok:<provider>` form
   * of the executor string when both `opts.executor` is absent and the user
   * picked a non-anthropic provider via the BYOK picker.
   */
  provider?: string;
  /**
   * Story 15.18 — generic BYOK API key (already keyed by provider at the
   * route handler boundary). Supersedes `anthropic_key` when set.
   */
  api_key?: string;
}

/**
 * runSkillAssembler — drives an LLM transport with a skill's system_prompt,
 * extracts <sf:*> + <artifact> tags via parser.ts, persists artifacts to disk
 * under .shadowflow/projects/<session_id>/, and yields SSE events.
 *
 * Phase 2 (2026-05-22): single LlmCallable entry point.
 *   - team-backed skills → `workflow/scheduler.runDag()` + artifact handoff
 *   - non-team skills    → `callable.turn()` once
 *
 * The caller is responsible for forwarding yielded events to the SSE response.
 */
export async function* runSkillAssembler(
  opts: SkillAssemblerOptions,
): AsyncGenerator<ParserSseEvent> {
  const { goal, skill_name, session_id, anthropic_key, signal, system_prompt } = opts;

  const skill = SKILLS[skill_name] ?? SKILLS['agent-team-blueprint'];
  // Story 15.5: caller may have composed a DS-augmented prompt; fall back to
  // the registered skill.system_prompt otherwise.
  const effectiveSystemPrompt = system_prompt ?? skill.system_prompt;
  if (!effectiveSystemPrompt) {
    yield {
      event: 'error',
      data: {
        message: `Skill "${skill_name}" 未配置 system_prompt。`,
        code: 'SKILL_NOT_CONFIGURED',
      },
    };
    return;
  }

  // Project directory for artifact persistence (under cwd, e.g. server/)
  const projectDir = path.join(process.cwd(), '.shadowflow', 'projects', session_id);
  try {
    fs.mkdirSync(projectDir, { recursive: true });
  } catch (err) {
    yield {
      event: 'error',
      data: {
        message: `无法创建产物目录: ${(err as Error).message}`,
        code: 'PROJECT_DIR_FAILED',
      },
    };
    return;
  }

  // Phase 2 A6 — executor resolution priority: opts > skill > default.
  //  - If opts.executor is set, use it verbatim (UI picker explicit choice).
  //  - Else if opts.provider is set and != 'anthropic', synthesise byok:<provider>.
  //  - Else fall back to skill.executor or 'anthropic-direct'.
  const executor =
    opts.executor ??
    (opts.provider && opts.provider !== 'anthropic'
      ? `byok:${opts.provider}`
      : skill.executor ?? 'anthropic-direct');

  const apiKey = opts.api_key ?? anthropic_key;
  const effectiveSignal = signal ?? new AbortController().signal;

  console.log(
    `[skill-assembler] session=${session_id} executor=${executor}` +
      ` skill=${skill_name} team=${skill.team ? 'yes' : 'no'}`,
  );

  // Resolve transport once. `resolveCallable` throws `LlmCallError` on unknown
  // executor strings — we surface that as an `error` SSE so the front-end can
  // show the structured failure without hard-breaking the stream.
  let callable;
  try {
    callable = resolveCallable(executor, {
      apiKey,
      model: opts.model,
      maxTokens: opts.max_tokens,
      temperature: opts.temperature,
      sessionId: session_id,
      workspace: projectDir,
    });
  } catch (err) {
    yield {
      event: 'error',
      data: {
        message: (err as Error).message,
        code: 'EXECUTOR_UNKNOWN',
        executor,
      },
    };
    return;
  }

  // Artifact callback — used by `parseAndExtract` when an `<artifact>` tag
  // closes. Mirrors the legacy single-call path so the front-end's artifact
  // saved events fire identically.
  const artifactCallback = (filename: string, content: string, _type: string): void => {
    const safeName = path.basename(filename);
    const filePath = path.join(projectDir, safeName);
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(
      `[skill-assembler] artifact written: ${filePath} (${content.length} bytes)`,
    );
  };

  // Branch 1 — team-backed skills go through the DAG scheduler with artifact
  // handoff between agents (Phase 2 decisions A3 / A2). Transport-agnostic.
  if (skill.team) {
    const teamV1 = toTeamDefV1(skill.team);
    const chunkStream = runDag(teamV1, callable, projectDir, effectiveSignal);
    yield* pipeChunksToSse(chunkStream, session_id, artifactCallback);
    return;
  }

  // Branch 2 — non-team skill: single LlmCallable.turn() (Phase 2 decision A6).
  const chunkStream = callable.turn({
    system: effectiveSystemPrompt,
    prompt: goal,
    history: [],
    workspace: projectDir,
    signal: effectiveSignal,
    model: opts.model,
    maxTokens: opts.max_tokens,
    temperature: opts.temperature,
  });
  yield* pipeChunksToSse(chunkStream, session_id, artifactCallback);
}

// ─── Helpers (Phase 2) ────────────────────────────────────────────────────────

/**
 * Convert a legacy `TeamDef` (the shape `SkillDefinition.team` carries) into a
 * `TeamDefV1` that `workflow/scheduler.runDag()` consumes. Synthesises the v1
 * fields (`members_ids`, `edges_v1`, `policy_obj`) from the legacy fields so
 * skills using the older `team.skill.yaml` schema can still run on the new DAG
 * engine. Skills loaded via the S0.5 `team_ref` path get the same V1 fields
 * via `team-yaml.ts:loadGlobalTeam`, but the v1 fields are dropped in
 * `skill-loader.ts:240` to fit the legacy `TeamDef` shape — we re-synthesise
 * them here from the same legacy fields, keeping behaviour identical.
 */
function toTeamDefV1(team: TeamDef): TeamDefV1 {
  return {
    ...team,
    team_id: team.name,
    version: 1,
    description: undefined,
    policy_obj: {
      retry: team.retry ?? 3,
    },
    members_ids: team.agents.map((a) => a.id),
    // Legacy edges have no `kind` — default to sequential so the scheduler's
    // Kahn-layered topology drives each agent after its parent completes.
    edges_v1: team.edges.map((e) => ({
      from: e.from,
      to: e.to,
      kind: 'sequential' as const,
    })),
  };
}

/**
 * Convert a `TurnChunk` stream from `LlmCallable.turn()` or `runDag()` into
 * the SSE event shape `parser.ts` already produces. Text-delta chunks are
 * piped through `parseAndExtract` so `<sf:*>` + `<artifact>` tags still
 * extract correctly (the parser is stateful per session_id and can interleave
 * text events with structured SSE frames).
 *
 * Non-text chunks (`error`, `done`, `usage`, `tool-use`) are translated:
 *   - error  → `event: 'error'` with kind/message
 *   - done   → flush parser buffer; do not emit a terminal event (the
 *              orchestration layer's natural end-of-stream is the signal)
 *   - usage  → `event: 'usage'` so the upstream SSE handler can accumulate
 *   - tool-use → dropped (O1 path: LLM does not host tool_use; daemon-led
 *                DAG already emits structured SSE frames via parser tags)
 */
async function* pipeChunksToSse(
  chunks: AsyncGenerator<TurnChunk> | AsyncIterable<TurnChunk>,
  session_id: string,
  artifactCallback: (filename: string, content: string, type: string) => void,
): AsyncGenerator<ParserSseEvent> {
  let textBuf = '';

  for await (const chunk of chunks) {
    if (chunk.type === 'text-delta') {
      textBuf += chunk.value;
      const { buffer: remaining, events } = parseAndExtract(
        textBuf,
        session_id,
        artifactCallback,
      );
      textBuf = remaining;
      for (const e of events) {
        // Phase 2 chunk shape carries node_id; stamp it on `text` events so
        // the front-end's per-node panel routing (parser.ts:286 contract)
        // can light up the right AgentDetail surface.
        if (chunk.node_id && e.event === 'text') {
          const d = e.data as { text: string; node_id?: string };
          yield { event: e.event, data: { ...d, node_id: chunk.node_id } };
        } else {
          yield e;
        }
      }
    } else if (chunk.type === 'error') {
      // Final flush of any pending text before yielding the error frame.
      if (textBuf.trim().length > 0) {
        const { events } = parseAndExtract(textBuf, session_id, artifactCallback);
        for (const e of events) yield e;
        textBuf = '';
      }
      yield {
        event: 'error',
        data: {
          message: chunk.error.message,
          code: chunk.error.kind,
          node_id: chunk.node_id,
        },
      };
    } else if (chunk.type === 'done') {
      // Per-node `done`. Flush any residual text buffered for this node.
      // We don't emit a terminal SSE here — the scheduler emits one `done`
      // per node and the natural end-of-stream is the orchestration signal.
      if (textBuf.trim().length > 0) {
        const { events } = parseAndExtract(textBuf, session_id, artifactCallback);
        for (const e of events) yield e;
        textBuf = '';
      }
    } else if (chunk.type === 'usage') {
      yield {
        event: 'usage',
        data: { ...chunk.usage, node_id: chunk.node_id },
      };
    }
    // chunk.type === 'tool-use' is intentionally dropped — Phase 2 decision A3
    // (daemon-led DAG) means orchestration emits structured SSE via `<sf:*>`
    // tags in the LLM's text, not via host tool_use loops.
  }

  // Final flush after the upstream stream ends naturally.
  if (textBuf.trim().length > 0) {
    const { events } = parseAndExtract(textBuf, session_id, artifactCallback);
    for (const e of events) yield e;
  }
}

// Re-export legacy direct-Anthropic helpers in case any internal code imported
// them — none currently do, but keeping the symbols available avoids surprise
// at refactor time.
void Anthropic;
void fs;
void path;
void parseAndExtract;
