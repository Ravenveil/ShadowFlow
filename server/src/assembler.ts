/**
 * assembler.ts — RunSession SSE event generator
 *
 * If ANTHROPIC_API_KEY is set: calls Claude to dynamically build agent structures.
 * Otherwise: uses keyword-based fallback simulation with realistic delays.
 *
 * Story 15.2 — added `runSkillAssembler` async generator that drives Claude
 * streaming + parser.ts to emit SSE events from skill system_prompt + goal.
 * The legacy `runAssembler` is preserved unchanged for backward compatibility.
 */

import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import { SKILLS } from './skills';
import { parseAndExtract, type SseEvent as ParserSseEvent } from './parser';
// Story 15.19 v2 — executor dispatcher. Default 'anthropic-direct' route
// preserves the existing in-line Claude SDK path; cli:* / cli:auto / acp:*
// routes are delegated to the dispatcher.
import { dispatchSkillRunner } from './skill-runners';
// S6 (skill-team-conversion-design-v1.md §5 line 806-815) — team-backed
// skills now drive a multi-turn ConversationRuntime instead of the legacy
// single-call dispatcher. We gate on `skill.team` presence so non-team
// skills (web-prototype, report, agent-team-blueprint legacy) keep working.
import { ConversationRuntime } from './lib/conversation-runtime';
import { AnthropicApiClient } from './lib/api-clients/anthropic-api-client';
import { SkillAnchorToolExecutor } from './lib/tools/skill-anchor-executor';
import { PermissionPolicy } from './lib/permission-policy';
import type { ConversationMessage } from './lib/conversation-types';

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
   * sessionStore → here). Resolution priority at the Anthropic SDK boundary:
   *   model:       opts.model ?? env(SHADOWFLOW_DEFAULT_MODEL) ?? 'claude-sonnet-4-6'
   *   max_tokens:  opts.max_tokens ?? 8192
   *   temperature: opts.temperature ?? (Anthropic SDK default — field omitted)
   *
   * Note: env-locked model still wins by design — when SHADOWFLOW_DEFAULT_MODEL
   * is set the SettingsPage shows a "locked by env" hint so users know the
   * front-end value is informational only.
   */
  model?: string;
  max_tokens?: number;
  temperature?: number;
  /**
   * Story 15.19 v2 — executor selector. Resolution priority:
   *   opts.executor > skill.executor > 'anthropic-direct'
   * The dispatcher validates the value (cli:auto / cli:<id> / acp:* / etc.)
   * and emits structured error events for unknown / missing CLIs without
   * silently downgrading.
   */
  executor?: string;
  /**
   * Story 15.18 — provider selector for the default executor. Forwarded to
   * `skill-runners/anthropic.ts` which dispatches into `llm-providers/`.
   * Resolution: opts.provider > 'anthropic' (only consulted by the default
   * executor; cli:* / acp:* runners ignore it).
   */
  provider?: string;
  /**
   * Story 15.18 — generic BYOK API key (already keyed by provider at the
   * route handler boundary). Supersedes `anthropic_key` when set.
   */
  api_key?: string;
}

/**
 * runSkillAssembler — drives Claude streaming with a skill's system_prompt,
 * extracts <sf:*> + <artifact> tags via parser.ts, persists artifacts to disk
 * under .shadowflow/projects/<session_id>/, and yields SSE events.
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

  // S6 — team-backed skills go through ConversationRuntime so the LLM gets
  // tool_use access to the skill-anchor tools (list_team_agents / get_skill_anchor /
  // register_agent / register_edge). Non-team skills (web-prototype / report /
  // legacy agent-team-blueprint) keep using the legacy dispatcher path that
  // calls the provider once and pipes text-delta through parser.ts.
  //
  // Provider scope: today only the Anthropic provider supports the multi-turn
  // tool_use shape we need; GLM / OpenAI variants ship in later Stories. So
  // we route ONLY when the resolved provider is 'anthropic'. Any other
  // provider falls back to the legacy path with a console warning.
  if (skill.team) {
    const provider = opts.provider ?? 'anthropic';
    if (provider === 'anthropic') {
      yield* runTeamBackedSkill(opts, skill, effectiveSystemPrompt, projectDir);
      return;
    }
    console.warn(
      `[skill-assembler] team-backed skill "${skill_name}" with provider=${provider} ` +
        `is not yet supported by ConversationRuntime; falling back to legacy single-call path.`,
    );
  }

  // Story 15.19 v2 — executor resolution priority: opts > skill > default.
  // 2026-05-11 Story 15.30: default 'cli:auto' (OpenDesign 模式) — dispatcher
  // 内部找不到 CLI 时优雅 fallback 到 anthropic-direct，仍兼容 BYOK 流程。
  const executor = opts.executor ?? skill.executor ?? 'cli:auto';

  console.log(
    `[skill-assembler] session=${session_id} executor=${executor}` +
      ` skill=${skill_name}`,
  );

  // Delegate to the dispatcher for ALL executors. The dispatcher routes
  // 'anthropic-direct' back to a runner that mirrors the historical inline
  // Claude SDK path (skill-runners/anthropic.ts), so behavior is unchanged.
  yield* dispatchSkillRunner(
    executor,
    {
      system_prompt: effectiveSystemPrompt,
      prompt: goal,
      session_id,
      cwd: projectDir,
      signal,
      anthropic_key,
      // Story 15.18 — provider + api_key forwarded to the default executor
      // runner which dispatches to llm-providers/. cli:* / acp:* runners
      // ignore these fields.
      provider: opts.provider,
      api_key: opts.api_key,
      model: opts.model,
      max_tokens: opts.max_tokens,
      temperature: opts.temperature,
    },
    { name: skill_name, executor: skill.executor },
  );
}

// ─── S6: team-backed skill multi-turn driver ──────────────────────────────────

/**
 * Drive a team-backed skill via ConversationRuntime. Sets up:
 *
 *   - AnthropicApiClient (BYOK key + model + max_tokens from opts)
 *   - SkillAnchorToolExecutor (wraps the 4 S4 tools)
 *   - PermissionPolicy from SKILL.md frontmatter `allowed-tools: [...]`
 *   - Fresh RuntimeSession (ephemeral; messages live for one runTurn() only)
 *
 * Then pumps the runtime's SSE generator downstream. Text events get piped
 * through parseAndExtract so the LLM's <sf:thinking> / <sf:step> /
 * <sf:agent-substep> / <sf:complete> / <artifact> tags still produce the
 * same downstream SSE shape the front-end expects. Tool-side-effect SSE
 * frames (event: 'node' / 'edge') yielded by the runtime pass through
 * directly.
 *
 * Artifacts: persisted under `projectDir` via the same callback the legacy
 * path uses, so artifact-saved events fire identically.
 */
async function* runTeamBackedSkill(
  opts: SkillAssemblerOptions,
  skill: import('./skills').SkillDefinition,
  systemPrompt: string,
  projectDir: string,
): AsyncGenerator<ParserSseEvent> {
  const { goal, skill_name, session_id, anthropic_key, signal } = opts;

  // Resolve API key: opts.api_key (BYOK header) > legacy anthropic_key > env.
  const apiKey =
    opts.api_key ??
    anthropic_key ??
    process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    yield {
      event: 'error',
      data: {
        message: '未配置 Anthropic API Key。请在设置 → API 密钥 (BYOK) 中填入 sk-ant-... 密钥。',
        code: 'NO_API_KEY',
      },
    };
    return;
  }

  // Ensure project dir exists for artifact callback.
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

  const artifactCallback = (filename: string, content: string, _type: string): void => {
    const safeName = path.basename(filename);
    const filePath = path.join(projectDir, safeName);
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(
      `[skill-assembler:team] artifact written: ${filePath} (${content.length} bytes)`,
    );
  };

  const apiClient = new AnthropicApiClient({
    apiKey,
    model: opts.model,
    max_tokens: opts.max_tokens,
    temperature: opts.temperature,
  });

  // Skill id == directory name == SKILLS registry key. We use skill_name
  // verbatim because the S4 tools read `skill_id` from LLM input — context
  // here is informational only.
  const toolExecutor = new SkillAnchorToolExecutor({
    skill_id: skill_name,
    sessionId: session_id,
  });

  // PermissionPolicy: skill.allowed_tools comes from SKILL.md frontmatter
  // `allowed-tools: [...]`. For team-backed skills this MUST be populated —
  // the assembler relies on 4 SkillAnchorTool calls (list_team_agents /
  // get_skill_anchor / register_agent / register_edge) and an empty
  // allowed-tools list deny-everything would let the LLM burn up to 50
  // iterations on tool calls that all get rejected.
  //
  // S6-review P1 #3 (2026-05-20): the prior code merely console.warn'd here
  // and let the run continue, which produced a confusing 50-iter timeout
  // with no actionable diagnostic. Now we fail fast with a structured
  // 'error' SSE so the frontend can surface "missing allowed-tools" to the
  // user directly.
  const allowed = skill.allowed_tools ?? [];
  if (allowed.length === 0) {
    yield {
      event: 'error',
      data: {
        code: 'NO_ALLOWED_TOOLS',
        message:
          `Team-backed skill "${skill_name}" is missing 'allowed-tools' in SKILL.md ` +
          `frontmatter — all tool_use calls would be denied and the assembler would ` +
          `fail with max_iter reached. Add 'allowed-tools: [list_team_agents, ` +
          `get_skill_anchor, register_agent, register_edge]' to the skill frontmatter ` +
          `and retry.`,
      },
    };
    return;
  }
  const permission = PermissionPolicy.fromAllowedTools(allowed);

  // Ephemeral session — ConversationRuntime mutates messages in place but
  // we never persist this back. (Future story: hand the SessionRecord from
  // session-store here so SSE reconnect can replay history. Out of S6 scope.)
  const session: { id: string; messages: ConversationMessage[] } = {
    id: session_id,
    messages: [],
  };

  const runtime = new ConversationRuntime(
    session,
    apiClient,
    toolExecutor,
    permission,
    systemPrompt,
  );

  // The runtime owns the abort signal. If the caller didn't pass one we
  // synthesize a never-aborting one to keep the type tight.
  const effectiveSignal = signal ?? new AbortController().signal;

  // Per-turn buffer for piping text-delta events through parseAndExtract.
  // The parser is stateful via session_id (step gating etc.) and expects to
  // see chunks accumulate into <sf:...> tags it can match.
  let textBuf = '';

  console.log(
    `[skill-assembler:team] session=${session_id} skill=${skill_name}` +
      ` allowed_tools=[${allowed.join(',')}]` +
      ` model=${opts.model ?? '(default)'}`,
  );

  for await (const sseEvent of runtime.runTurn(goal, effectiveSignal)) {
    if (sseEvent.event === 'text') {
      // Pipe text through parser so <sf:*> + <artifact> still extract.
      const data = sseEvent.data as { text: string };
      textBuf += data.text;
      const { buffer: remaining, events } = parseAndExtract(
        textBuf,
        session_id,
        artifactCallback,
      );
      textBuf = remaining;
      for (const e of events) yield e;
    } else if (
      sseEvent.event === 'complete' ||
      sseEvent.event === 'aborted' ||
      sseEvent.event === 'error'
    ) {
      // Final flush — pump any remaining text through parser one last time
      // before yielding the terminal event so trailing <sf:complete /> still
      // emits its 'complete' SSE.
      if (textBuf.trim().length > 0) {
        const { events } = parseAndExtract(textBuf, session_id, artifactCallback);
        for (const e of events) yield e;
        textBuf = '';
      }
      yield sseEvent;
    } else {
      // Tool side-effect (event: 'node' / 'edge') or any other custom event
      // from a future tool. Pass through verbatim — these are the SSE frames
      // the front-end's RunSessionPage listens for.
      yield sseEvent;
    }
  }
}

// Re-export the legacy direct-Anthropic helpers in case any internal code
// imported them — none currently do, but keeping the symbols available
// avoids surprise at refactor time. (Anthropic / fs / path / parseAndExtract
// are still used by some legacy code paths above.)
void Anthropic;
void fs;
void path;
void parseAndExtract;
