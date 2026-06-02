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
import type { SkillAgentDef } from './lib/skill-types';
import {
  toTeamDefV1,
  toTeamDefV1FromCompiled,
} from './lib/team-yaml';
// Round 4 PR-C: compile cache produces the canonical agent-vs-team config.
// The assembler now reads `getCompiledSkill(skill_id)` to decide the branch
// instead of inspecting `SkillDefinition.team` directly. `getCompiledSkill`
// is cache-only — compile() itself runs at ingest time + skill-loader boot.
import { getCompiledSkill, compile as compileSkill } from './lib/skill-compiler';
import { tryReadSkill } from './skill-reader';
// Round 4 PR-D: single-agent tool-use loop driver. When `compiled.agentConfig
// .tools[]` is non-empty AND the resolved callable wraps a direct ApiClient,
// we drive the conversation via `ConversationRuntime` so the LLM can iterate
// tool_use → tool_result without the orchestrator hosting the loop.
import { ConversationRuntime } from './lib/conversation-runtime';
import { ToolRunner, registerToolExecutor } from './lib/tool-runner';
import { PermissionPolicyV2 } from './lib/permission-policy-v2';
import { ToolRegistry, type ToolSpec } from './lib/tool-spec';
// 2026-06-01 — 组装期 read_skill 工具:@skill 触发但目标蓝图未随上下文给出时,
// 让组装 agent 按 ref(skill id / 本地路径 / https URL)拉真实蓝图,解析不到则如实
// 报"未找到",而非凭空编造。自包含执行器,直接注册(不依赖未接的 builtin ALS)。
import { readSkillTool, readSkillToolExecutor } from './lib/tools/builtin/read-skill';
import { ApiClientCallable } from './transport/ApiClientCallable';
// Task 4 — deterministic recipe → daemon-led assembly (Branch 0). Structure
// comes from the matched Skill recipe (not an LLM emit); Rules are the safety
// floor at the assembly exit.
import { selectRecipe } from './assembly/select';
import { deriveRules, enforceRules } from './assembly/rules/enforce';
// 待决1 — Path A 轻量闸门:只尊重"用户显式要 1 个 agent"的意图(其余 verbatim 不砍)。
import { detectExplicitSingleAgent } from './lib/intent-router';
import type { RosterNode } from './assembly/rules/types';
import type { AssemblyRecipe } from './assembly/skills/types';
import type { TeamDef } from './lib/skill-types';

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
  teamName?: string,
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

  // `name:` 行供前端 extractYamlTeamName 命中（LLM 起的团队名）。为空时省略，
  // 让前端走 goal 文本兜底。
  const safeName = (teamName ?? '').replace(/"/g, '\\"').trim();
  return [
    `# ShadowFlow Blueprint`,
    `# Generated session: ${sessionId}`,
    `version: "1.0"`,
    ...(safeName ? [`name: "${safeName}"`] : []),
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
  let teamName: string;

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
  "team_name": "中文团队名 (4-12 字)",
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
- team_name: 概括这个团队的职责的简洁中文名 (4-12 字)，例如 "全栈开发小队"、"市场调研团队"。
  不要直接照抄用户的原始 goal 文本，也不要用某个成员的名字当团队名。
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
    team_name?: string;
    agents: AgentDef[];
  };

  outputType = parsed.output_type ?? 'answer';
  mode = modeHint ?? parsed.mode ?? 'single';
  confidence = Math.min(1, Math.max(0, parsed.confidence ?? 0.85));
  complexity = Math.min(1, Math.max(0, parsed.complexity ?? 0.5));
  agents = parsed.agents ?? [];
  // LLM 起的团队名 —— 写进 blueprint YAML 的 `name:` 行，前端 RunSessionPage
  // extractYamlTeamName 据此命名 team（而非照抄 goal 文本）。
  teamName = typeof parsed.team_name === 'string' ? parsed.team_name.trim() : '';

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
  const blueprintYaml = buildBlueprintYaml(session_id, goal, outputType, mode, agents, teamName);
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
  /** 2026-06-01 — 用户显式 @skill:<id> / skill_name 触发(组装意图)。Branch 2
   *  兜底时:true → 用组装指令(读 agent-team-assembly 的 SKILL.md+yaml,禁 discovery、
   *  强制 emit <sf:node>),而非该 skill 的对话 prompt。 */
  explicit_skill?: boolean;
  /** 2026-06-01 — 用户原始请求的 skill id(@skill:<id> 的 <id> 或显式 skill_name),
   *  未经 SKILLS 注册表回退。当它 ≠ `skill_name`(已回退到默认)时,说明请求的 skill
   *  没在注册表里;Branch 2 会提示组装 agent 用 read_skill(skill_requested) 去磁盘/网络
   *  拉真实蓝图,而不是静默用默认。 */
  skill_requested?: string;
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
  /**
   * 2026-05-30 — CLI 工作目录(绝对路径,用户在对话框选)。空 → workspace
   * 回退到 .shadowflow/projects/<session_id>。仅 cli:/acp:/mcp: 用得上
   * (workspace = opts.cwd || projectDir)。
   */
  cwd?: string;
}

// 2026-06-01 — 组装意图指令。读 `.shadowflow/skills/agent-team-assembly` 的
// SKILL.md + assembly_workflow.yaml,作为「显式 @skill / 组装」落到 Branch 2 时的
// 系统提示前缀:强制 LLM 立即组装(emit <sf:*>)、禁止 discovery 反问、按两条路
// (Path A 读蓝图 / Path B 设计)走。这样那两份文件被真正"用"起来。缓存一次。
let _assemblyDirectiveCache: string | null = null;
function loadAssemblyDirective(): string {
  if (_assemblyDirectiveCache !== null) return _assemblyDirectiveCache;
  const dirs = [
    path.join(process.cwd(), '..', '.shadowflow', 'skills', 'agent-team-assembly'),
    path.join(process.cwd(), '.shadowflow', 'skills', 'agent-team-assembly'),
  ];
  let out = '';
  for (const d of dirs) {
    try {
      const mdPath = path.join(d, 'SKILL.md');
      if (!fs.existsSync(mdPath)) continue;
      const md = fs.readFileSync(mdPath, 'utf-8');
      const ypPath = path.join(d, 'assembly_workflow.yaml');
      const yaml = fs.existsSync(ypPath) ? fs.readFileSync(ypPath, 'utf-8') : '';
      out = yaml
        ? `${md}\n\n--- 组装工作流定义 (assembly_workflow.yaml) ---\n${yaml}`
        : md;
      break;
    } catch {
      /* best-effort; fall through to empty */
    }
  }
  _assemblyDirectiveCache = out;
  return out;
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
// 2026-06-01 — 组装 ⊥ 执行。@skill(explicit_skill)命中编译好的 team 时,组装阶段
// 只应"搭出团队蓝图 + 落库",**不应**用 runDag 把 agent 跑起来(否则 BMAD 的
// bmad-agent-ux-designer 会激活 persona、自我介绍"嗨我是 Sally…",把"组好后才该
// 发生的对话"漏进组装 run)。这里 emit node/agent-persona/edge/complete 蓝图事件
// (对齐 synthesizeTeamRun 的事件形状),Team 画布据此画出真实 DAG;跟 agent 对话
// 是组好之后单独进 chat/run 的动作,不在此发生。
async function* emitCompiledTeamBlueprint(
  teamConfig: { members_ids: string[]; members_personas: Record<string, string>; edges_v1: Array<{ from: string; to: string; kind?: string }>; name?: string },
  synthAgents: SkillAgentDef[],
  session_id: string,
  singleAgent = false,
): AsyncGenerator<ParserSseEvent> {
  const byId = new Map(synthAgents.map((a) => [a.id, a]));
  // 待决1 — 轻量闸门:用户显式"要 1 个 agent"时,只取 1 个(优先 coordinator,否则第一个),
  // 不发 edges。这是唯一对 Path A 的"卡线"——绝不引入 roster 上限(忠实复现不该砍)。
  const memberIds =
    singleAgent && teamConfig.members_ids.length > 1
      ? [teamConfig.members_ids.find((id) => /coord/i.test(id)) ?? teamConfig.members_ids[0]]
      : teamConfig.members_ids;
  const emitEdges = !singleAgent;
  yield {
    event: 'classify',
    data: { output_type: 'workflow', mode: singleAgent ? 'single' : 'team', confidence: 0.98, complexity: Math.min(5, Math.max(1, memberIds.length)), source: 'compiled-skill-team' },
  };
  for (const id of memberIds) {
    const a = byId.get(id);
    const persona = a?.persona ?? teamConfig.members_personas[id] ?? `Agent ${id}`;
    const shortPersona = persona.split('\n').find((l) => l.trim().length > 0)?.slice(0, 80) ?? id;
    const toolsPicked = a?.tools?.picked ?? [];
    yield {
      event: 'node',
      data: {
        node_id: id,
        type: /coord/i.test(id) ? 'coordinator' : 'agent',
        title: a?.title ?? id,
        sub: '',
        chips: toolsPicked.slice(0, 3),
        status: 'ready',
        avatar_char: (a?.title ?? id).charAt(0),
        model: a?.model?.id,
        tools_picked: toolsPicked,
        persona: shortPersona,
        skill_ref: a?.source_file,
      },
    };
    yield {
      event: 'agent-persona',
      data: { node_id: id, persona, source: a?.anchors?.persona?.ref ?? `<compiled>#${id}/persona`, cached: true },
    };
  }
  if (emitEdges) {
    for (const e of teamConfig.edges_v1) {
      yield { event: 'edge', data: { from: e.from, to: e.to, status: 'active' } };
    }
  }
  yield {
    event: 'complete',
    data: { session_id, run_id: `run-${session_id.slice(0, 8)}` },
  };
}

export async function* runSkillAssembler(
  opts: SkillAssemblerOptions,
): AsyncGenerator<ParserSseEvent> {
  const { goal, skill_name, explicit_skill, skill_requested, session_id, anthropic_key, signal, system_prompt } = opts;

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
  // CLI/ACP/MCP 工作目录:用户在对话框选的绝对路径优先,否则回退到 session 产物目录。
  // 2026-05-30 — 两处 resolveCallable(单 + team) 都用这个 workspace。
  const workspace = opts.cwd || projectDir;
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

  // C(2026-06-02)— @skill 走 LLM 编排器:LLM 读组装 skill 工作流 + 读目标 skill 真实声明
  // + verbatim emit 蓝图(忠实"从组装 skill 出发")。LLM 是否可用:cli:/acp:/mcp: 外部 runner
  // 自带认证(无需 key);anthropic-direct/byok: 需 apiKey。无 LLM 时退回确定性结构化 emit(离线兜底)。
  const llmAvailable = /^(cli:|acp:|mcp:)/.test(executor) || !!apiKey;
  const orchestrate = !!explicit_skill && llmAvailable;

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
      // CLI/ACP/MCP cwd:用户在对话框选的目录优先,否则回退到 session 产物目录。
      workspace,
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

  // Round 4 PR-C — compile-driven branch selection.
  //
  // Pre-PR-C the assembler inspected `skill.team` (a static field set at load
  // time). The new architecture lets the LLM-side SkillCompiler decide
  // agent-vs-team based on skill content, with the verdict cached under
  // `.shadowflow/cache/skill-compile/<hash>.json`. We look that up first.
  //
  // Lookup priority:
  //   1. `getCompiledSkill(skill_name)` — cache hit on ingest-side compile
  //   2. On-the-fly `compile()` if the skill has reference files on disk
  //      (handles skills that were registered before PR-C landed)
  //   3. Legacy `skill.team` (TeamDef) — back-compat for built-in skills
  //      whose system_prompt + static team field still live in code
  let compiled = await getCompiledSkill(skill_name);

  if (!compiled) {
    // Try to compile on the fly. The references dir lives under the
    // installed skill bundle; built-in skills don't have one, so this
    // simply no-ops for them and we fall through to legacy team handling.
    const refDir = path.join(
      process.cwd(),
      '.shadowflow',
      'skills',
      skill_name,
      'references',
    );
    if (fs.existsSync(refDir)) {
      try {
        const skillRead = await tryReadSkill(refDir, { skill_id: skill_name });
        if (skillRead) {
          compiled = await compileSkill(skillRead);
        }
      } catch (err) {
        console.warn(
          `[skill-assembler] on-demand compile failed for ${skill_name}: ${(err as Error).message ?? err}`,
        );
      }
    }
  }

  // Branch 1 — compiled team config → DAG scheduler.
  // (Phase 2 decisions A3 / A2 preserved: daemon-led DAG + artifact handoff.)
  // `orchestrate`(C):explicit_skill + 有 LLM → 放行到 Branch 2 的 LLM 编排器(不走下面任何确定性/执行路)。
  if (compiled?.mode === 'team' && compiled.teamConfig && !orchestrate) {
    const synthAgents = synthAgentsFromCompiled(compiled.teamConfig);
    const teamV1 = toTeamDefV1FromCompiled(compiled.teamConfig, synthAgents);
    if (explicit_skill) {
      // C 离线兜底:explicit_skill 但无 LLM(无 key 的 HTTP 执行器)→ 用确定性结构化结果直接 emit
      // 蓝图(不跑 agent)。待决1 轻量闸门:显式"要 1 个 agent" → 只 emit 1 个。
      const singleAgent = detectExplicitSingleAgent(goal).single;
      console.log(
        `[skill-assembler] @skill OFFLINE deterministic emit (no LLM) team ${teamV1.team_id}: ${teamV1.members_ids.length} members, single=${singleAgent}`,
      );
      yield* emitCompiledTeamBlueprint(compiled.teamConfig, synthAgents, session_id, singleAgent);
      return;
    }
    // 非 @skill 的编译 team → 执行(runDag),保持原行为。
    console.log(
      `[skill-assembler] running compiled team ${teamV1.team_id}: ${teamV1.members_ids.length} members, ${teamV1.edges_v1.length} edges, derivedFrom=${compiled.teamConfig.derivedFrom}`,
    );
    const chunkStream = runDag(teamV1, callable, projectDir, effectiveSignal);
    yield* pipeChunksToSse(chunkStream, session_id, artifactCallback);
    return;
  }

  // Branch 1b — legacy: skill ships an explicit TeamDef (built-in skills /
  // pre-PR-C bundles). Same DAG path, just synthesised via the older helper.
  if (skill.team && !orchestrate) {
    const teamV1 = toTeamDefV1(skill.team);
    console.log(
      `[skill-assembler] running legacy team ${teamV1.team_id}: ${teamV1.members_ids.length} members (no compile cache)`,
    );
    const chunkStream = runDag(teamV1, callable, projectDir, effectiveSignal);
    yield* pipeChunksToSse(chunkStream, session_id, artifactCallback);
    return;
  }

  // Branch 0 — 确定性 recipe 命中：结构由 recipe(Skill)定，不靠 LLM emit。Rule 出口兜底。
  // orchestrate(@skill+LLM)时跳过 recipe —— @skill 应由组装 skill 工作流驱动,不被 goal-recipe 抢路。
  const matchedRecipe = orchestrate ? null : selectRecipe(goal);
  if (matchedRecipe) {
    const teamDef = recipeToTeamDef(matchedRecipe);
    // 正本清源: user goal 不再烤进 persona(撤掉 enrichRecipePersonas 双调用),
    // 而是作为 runDag 的 goal 参数串进 executor 的 user-turn prompt。结构(节点/
    // 角色/边)仍由 recipe 定死;persona 退回骨架(title[+hint]),只负责"我是谁"。
    const roster: RosterNode[] = teamDef.agents.map(a => ({
      role_id: (a as any).id, type: (a as any).type, title: (a as any).title,
    }));
    const rules = deriveRules(goal, matchedRecipe);
    const { violations } = enforceRules(roster, rules);
    if (violations.length > 0) console.warn(`[skill-assembler] recipe ${matchedRecipe.id} violations: ${violations.join('; ')}`);
    console.log(`[skill-assembler] session=${session_id} recipe=${matchedRecipe.id} → daemon-led (${teamDef.agents.length} roles)`);
    const teamV1 = toTeamDefV1(teamDef);
    // Post-assembly UX hint — emit BEFORE the chunk stream so the front-end
    // receives it early (before the team auto-saves). Single-agent recipes set
    // `askWorkspaceOnCreate: true`; the client then offers a "move to new
    // workspace" affordance on the auto-save chip. Non-structural; safe to
    // ignore for any client that doesn't listen for `assembly-meta`.
    if (matchedRecipe.askWorkspaceOnCreate) {
      yield { event: 'assembly-meta', data: { ask_workspace: true, recipe: matchedRecipe.id } };
    }
    // 传 goal → executor 把 user-turn prompt 设为 goal(而非 node.id)。
    const chunkStream = runDag(teamV1, callable, projectDir, effectiveSignal, goal);
    yield* pipeChunksToSse(chunkStream, session_id, artifactCallback);
    return;
  }

  // Branch 2 — single agent fallback. Reached only when NO recipe matched
  // (Branch 0) and the skill carries no compiled/legacy team. Structure here
  // is NOT deterministically defined: the LLM may free-emit `<sf:node>` roster
  // under SINGLE_AGENT_DIRECTIVE and the client-side enforces the roster cap as
  // a stopgap. Phase C will push that roster enforcement down server-side so
  // even the fallback path goes through the Rule exit.
  //
  // Prefer the compiled `agentConfig.system_prompt`
  // when available (it's the LLM-curated version of raw_skill_md + persona).
  // Falls back to the skill's static system_prompt for back-compat.
  const compiledSystem = compiled?.agentConfig?.system_prompt;
  const baseSystem =
    typeof compiledSystem === 'string' && compiledSystem.trim().length > 0
      ? compiledSystem
      : effectiveSystemPrompt;
  // 2026-06-01 组装接线:用户显式 @skill / 组装意图却落到 Branch 2(目标 skill 无
  // team/recipe)时,前缀注入组装指令(agent-team-assembly 的 SKILL.md+yaml)——
  // 让 LLM 立即按"组装工作流"emit <sf:node>/<sf:edge>/<sf:complete>、禁止 discovery
  // 反问(治此前 @skill 反问"你想哪一件"的毛病),目标 skill 的内容作为蓝图上下文附后。
  const assemblyDirective = explicit_skill ? loadAssemblyDirective() : '';
  // 2026-06-01 — 请求的 skill 在注册表里没命中(已回退到默认 blueprint)时,
  // skill_requested !== skill_name。这时不静默用默认:提示组装 agent 用 read_skill
  // 按 ref 拉真实蓝图(解析不到再如实报"未找到")。read_skill 工具仅在 ApiClient
  // 路注册进工具循环;CLI/ACP 路靠 agent 自带的文件/网页读取能力(措辞做了兼容)。
  const requestedRef =
    typeof skill_requested === 'string' && skill_requested.trim() ? skill_requested.trim() : '';
  const skillUnresolved = explicit_skill && !!requestedRef && requestedRef !== skill_name;
  if (skillUnresolved) {
    console.warn(
      `[skill-assembler] session=${session_id} requested skill '${requestedRef}' not in registry — ` +
        `routing to assembly with read_skill recovery (resolved=${skill_name}).`,
    );
    // 客户端可见提示(非破坏:不监听此事件的客户端忽略即可)。
    yield {
      event: 'assembly-meta',
      data: { skill_unresolved: true, requested: requestedRef, fallback: skill_name },
    };
  }
  // C(2026-06-02)— @skill LLM 编排指令:**先读目标 skill 的真实声明,再 verbatim emit**。
  // 不预分"哪步确定/哪步模糊";忠实靠"工具锁输入 + verbatim 纪律 + 出口闸门"。
  const targetRef = requestedRef || skill_name;
  const toolHint = explicit_skill
    ? `\n\n=== 组装执行(读目标 skill → 忠实 emit)===\n` +
      `你要组装的是 skill「${targetRef}」。**第一步:用 \`read_skill(ref="${targetRef}")\` 工具` +
      `(运行时未提供该工具时,如 CLI/ACP 路,用你自带的 Read/Glob 等文件能力)读取它真实声明的 roster**,` +
      `来源优先级:team_ref → \`<ref>.team.yaml\` / 自带 roster 清单(如 \`module.yaml\` 的 \`agents:\` 段)/ \`agents/\` 目录。\n` +
      (skillUnresolved
        ? `⚠️ 该 skill 不在已编译注册表、蓝图未随上下文给出,**务必**先 read_skill 拉取。\n`
        : ``) +
      `**第二步:照声明 verbatim emit** —— 声明几个角色就 emit 几个 \`<sf:node>\`,` +
      `**绝不**混入子技能的子助手、安装模块名(如 bmad-modules.yaml 的模块)、或你臆造的角色;` +
      `再按其工作流/阶段 emit \`<sf:edge>\`(分阶段的:阶段内并行、相邻阶段相连,不要硬拉成一条直线)、\`<sf:complete>\`。\n` +
      `read_skill 解析不到 → **如实告知"未找到该 skill"**,绝不凭空编造蓝图。`
    : '';
  const branch2System = assemblyDirective
    ? `${assemblyDirective}${toolHint}\n\n=== 目标 skill 上下文(${skill_name})===\n${baseSystem}`
    : baseSystem;

  // Round 4 PR-D — when the compiled agentConfig advertises tools AND the
  // resolved transport is a direct ApiClient (anthropic-direct / byok:*),
  // drive the conversation via `ConversationRuntime` so the LLM can iterate
  // tool_use → tool_result. CLI / ACP / MCP backed callables don't expose
  // ApiClient, so they keep going through `callable.turn()` as before
  // (those transports host their own tool loops internally).
  const compiledTools = compiled?.agentConfig?.tools ?? [];
  // 2026-06-01 — 组装意图(explicit_skill)时把 read_skill 加进工具白名单,即使
  // 目标 skill 没声明工具,也能让组装 agent 走 ConversationRuntime 循环、用
  // read_skill 拉真实蓝图。read_skill 自包含、直接注册执行器(其余编译工具的执行器
  // 仍由 Lane 2 提供)。
  const effectiveToolNames = Array.from(
    new Set([...compiledTools, ...(explicit_skill ? ['read_skill'] : [])]),
  );
  const wantsToolLoop = effectiveToolNames.length > 0;
  if (wantsToolLoop && callable instanceof ApiClientCallable) {
    const apiClient = callable.getApiClient();
    if (effectiveToolNames.includes('read_skill')) {
      // Idempotent (Map set) — guarantees the executor is live whenever the
      // assembly loop runs, without depending on a boot-time registration.
      registerToolExecutor('read_skill', readSkillToolExecutor);
    }
    // The compiled `tools` list is just a whitelist of names; the actual
    // tool specs come from the (Lane 2) registered tool registry. For the
    // PR-D wiring we register all whitelisted names as `base` specs with a
    // permissive schema — Lane 2's `registerToolExecutor` calls supply the
    // executors. `read_skill` ships its real spec (so the LLM sees the `ref`
    // param) + a self-contained executor.
    const specs: ToolSpec[] = effectiveToolNames.map((name) =>
      name === 'read_skill'
        ? readSkillTool
        : {
            name,
            description: `compiled tool ${name}`,
            input_schema: { type: 'object', properties: {} },
            source: 'base' as const,
          },
    );
    const registry = new ToolRegistry(specs);
    const policy = PermissionPolicyV2.fromAllowedTools(effectiveToolNames);
    const runner = new ToolRunner(registry, policy);
    const runtime = new ConversationRuntime({
      apiClient,
      toolRunner: runner,
      maxIterations: compiled?.agentConfig?.max_iterations ?? 50,
    });
    const chunkStream: AsyncGenerator<TurnChunk> = runtime.runTurn({
      system_prompt: branch2System,
      user_message: goal,
      history: [],
      signal: effectiveSignal,
    });
    yield* pipeChunksToSse(chunkStream, session_id, artifactCallback);
    return;
  }

  // Fallback — no tool whitelist OR the transport doesn't expose an
  // ApiClient (CLI / ACP / MCP). Single-shot through the unified
  // `LlmCallable.turn()` path.
  const chunkStream = callable.turn({
    system: branch2System,
    prompt: goal,
    history: [],
    workspace,
    signal: effectiveSignal,
    model: opts.model ?? compiled?.agentConfig?.model_hint,
    maxTokens: opts.max_tokens,
    temperature: opts.temperature,
  });
  yield* pipeChunksToSse(chunkStream, session_id, artifactCallback);
}

/**
 * Build minimal `SkillAgentDef[]` from a compiled team config's per-member
 * personas. The scheduler / executor only needs `id` + `persona` to drive a
 * node (everything else is metadata for UI / cost accounting), so we
 * synthesize the rest with sentinels. This keeps the compiled team path
 * decoupled from the agent-yaml registry — a skill that ships only prose
 * agents still runs end-to-end.
 */
function synthAgentsFromCompiled(
  team: { members_ids: string[]; members_personas: Record<string, string> },
): SkillAgentDef[] {
  return team.members_ids.map((id) => ({
    id,
    title: id,
    persona: team.members_personas[id] ?? `Agent ${id}`,
    model: { id: 'compiled-default' },
    tools: { picked: [], candidate: [] },
    anchors: {
      persona: { ref: `<compiled>#${id}/persona`, tokens: 0, cached: false },
      model: { ref: `<compiled>#${id}/model`, tokens: 0, cached: false },
      tools: { ref: `<compiled>#${id}/tools`, tokens: 0, cached: false },
      memory: { ref: `<compiled>#${id}/memory`, tokens: 0, cached: false },
      io: { ref: `<compiled>#${id}/io`, tokens: 0, cached: false },
    },
    source_file: '<compiled>',
  }));
}

/**
 * recipeToTeamDef — Task 4: synthesise a `TeamDef` from a deterministic
 * AssemblyRecipe so Branch 0 can reuse the existing daemon-led `runDag` path.
 *
 * The recipe only carries the *structure* (role_id / type / title + edges).
 * `SkillAgentDef` requires persona/model/tools/anchors/source_file, so we fill
 * those with neutral defaults. We do NOT cast away the required fields; every
 * mandatory `SkillAgentDef` member is populated with a real, typed default
 * (mirroring `synthAgentsFromCompiled`).
 *
 * Persona default note: recipe.roles give a `title` (+ optional `hint`) but no
 * persona body. We seed `persona` from title/hint — the persona now only says
 * "我是谁/我这个角色干啥", NOT the goal. The user goal flows through `runDag`'s
 * `goal` param into the executor's user-turn prompt (撤掉了 enrichment 双调用),
 * so the skeleton persona is intentionally minimal and never empty at runDag time.
 */
function recipeToTeamDef(recipe: AssemblyRecipe): TeamDef {
  const agents: SkillAgentDef[] = recipe.roles.map((role) => {
    const personaSeed =
      role.hint && role.hint.trim().length > 0
        ? `${role.title}\n\n${role.hint}`
        : role.title;
    return {
      id: role.role_id,
      title: role.title,
      type: role.type,
      // Required by SkillAgentDef — seeded from recipe structure, expected to be
      // re-authored by the daemon/LLM in PHASE_2.
      persona: personaSeed,
      model: { id: 'recipe-default' },
      tools: { picked: [], candidate: [] },
      anchors: {
        persona: { ref: `synthetic:recipe:${recipe.id}#${role.role_id}/persona`, tokens: 0, cached: false },
        model: { ref: `synthetic:recipe:${recipe.id}#${role.role_id}/model`, tokens: 0, cached: false },
        tools: { ref: `synthetic:recipe:${recipe.id}#${role.role_id}/tools`, tokens: 0, cached: false },
        memory: { ref: `synthetic:recipe:${recipe.id}#${role.role_id}/memory`, tokens: 0, cached: false },
        io: { ref: `synthetic:recipe:${recipe.id}#${role.role_id}/io`, tokens: 0, cached: false },
      },
      source_file: `synthetic:recipe:${recipe.id}`,
    };
  });
  return {
    name: `recipe.${recipe.id}`,
    mode: recipe.edges.length > 0 ? 'serial' : 'dag',
    policy: 'strict',
    retry: 3,
    agents,
    edges: recipe.edges.map((e) => ({ from: e.from, to: e.to })),
    loaded_at: Date.now(),
    source_dir: `synthetic:recipe:${recipe.id}`,
  };
}

// ─── Helpers (Phase 2) ────────────────────────────────────────────────────────
//
// Round 4 PR-C: `toTeamDefV1` moved to `lib/team-yaml.ts` so the legacy
// converter sits next to its compiled-config sibling. Re-imported above.

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
/**
 * firstJsonValueEnd — given text that STARTS with `{` or `[` (after any
 * leading whitespace), return the exclusive end index of the first complete,
 * brace-balanced JSON value. Returns -1 if no balanced value is found (e.g.
 * truncated / never-closing).
 *
 * Hand-rolled brace-balance scanner (no third-party libs). It tracks string
 * literals so that `{`/`}`/`[`/`]` inside a JSON string — and escaped quotes
 * like `\"` — are NOT counted as structural brackets.
 */
export function firstJsonValueEnd(text: string): number {
  let i = 0;
  // Skip leading whitespace.
  while (i < text.length && /\s/.test(text[i])) i++;
  const open = text[i];
  if (open !== '{' && open !== '[') return -1;
  const close = open === '{' ? '}' : ']';

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === open) {
      depth++;
    } else if (ch === close) {
      depth--;
      if (depth === 0) {
        // Exclusive end index just past the matching close bracket.
        return i + 1;
      }
    }
  }
  return -1; // never balanced
}

/**
 * 2026-06-01 — bridge a Claude-Code-CLI (or any agent's) built-in
 * `AskUserQuestion` tool call into the native `question-form` SSE event so the
 * existing `QuestionFormModal` lights up. Without this the structured question
 * arrives only as a generic `tool-use` chip and the prose falls into the text
 * stream — the user sees no interactive picker.
 *
 * CLI `AskUserQuestion` input shape:
 *   { questions: [{ question, header, multiSelect, options: [{label, description}] }] }
 * → QuestionFormModal `FormBody`:
 *   { questions: [{ id, label, type:'radio'|'checkbox'|'text', options?: string[], required }] }
 *
 * Returns null for any non-AskUserQuestion tool or malformed input (caller then
 * just emits the plain tool-use chip).
 */
function askUserQuestionToFormEvent(
  toolName: string,
  toolInput: unknown,
  callId: string | null | undefined,
  nodeId: string | undefined,
): ParserSseEvent | null {
  if (toolName !== 'AskUserQuestion') return null;
  const input = toolInput as { questions?: unknown } | null;
  const rawQs = Array.isArray(input?.questions) ? (input!.questions as unknown[]) : [];
  if (rawQs.length === 0) return null;

  const questions = rawQs.map((raw, i) => {
    const q = (raw ?? {}) as {
      question?: unknown;
      header?: unknown;
      multiSelect?: unknown;
      options?: unknown;
    };
    const opts = Array.isArray(q.options)
      ? (q.options as unknown[])
          .map((o) =>
            typeof o === 'string'
              ? o
              : ((o as { label?: unknown })?.label != null
                  ? String((o as { label?: unknown }).label)
                  : ''),
          )
          .filter((s) => s.length > 0)
      : [];
    const hasOpts = opts.length > 0;
    const questionText = typeof q.question === 'string' ? q.question : `问题 ${i + 1}`;
    const header = typeof q.header === 'string' && q.header.trim() ? q.header.trim() : '';
    return {
      id: `q${i}`,
      label: header ? `${header} — ${questionText}` : questionText,
      type: hasOpts ? (q.multiSelect === true ? 'checkbox' : 'radio') : 'text',
      ...(hasOpts ? { options: opts } : {}),
      required: true,
    };
  });

  return {
    event: 'question-form',
    data: {
      id: callId ?? `askuser-${nodeId ?? '0'}`,
      title: '需要您澄清',
      body: { questions },
      ...(nodeId ? { node_id: nodeId } : {}),
    },
  };
}

export async function* pipeChunksToSse(
  chunks: AsyncGenerator<TurnChunk> | AsyncIterable<TurnChunk>,
  session_id: string,
  artifactCallback: (filename: string, content: string, type: string) => void,
): AsyncGenerator<ParserSseEvent> {
  let textBuf = '';

  // P2 / T2 (audit §2.5 A2): hold back a bare-JSON answer so it renders as a
  // structured diff_panel card instead of leaking raw JSON (literal \n / "}).
  // Engages only when the turn's FIRST answer content is text whose first
  // non-whitespace char is `{`/`[` (normal prose never starts that way). On a
  // real structured event arriving mid-hold (mixed output) we release the held
  // text as a `raw` block rather than risk corrupting the answer.
  let jsonHold: string | null = null;
  let answerStarted = false;

  /** Build the structured blueprint + yaml-line frames for a parsed JSON value. */
  const blueprintFramesFor = (parsed: unknown): ParserSseEvent[] => {
    const pretty = JSON.stringify(parsed, null, 2);
    const lines = pretty.split('\n');
    const filename = Array.isArray(parsed) ? 'output.json' : 'agent-blueprint.json';
    const evs: ParserSseEvent[] = [
      { event: 'blueprint', data: { filename, yaml: pretty } },
    ];
    for (const line of lines) {
      evs.push({ event: 'yaml-line', data: { line, total_lines: lines.length } });
    }
    return evs;
  };

  /**
   * Turn the held JSON into structured events, or fall back to a raw block.
   *
   * Boundary fix (spec §2.2): when the held text is NOT one whole JSON value
   * (e.g. `{...}\n\n后续散文`), we slice off the leading complete JSON value via
   * brace-balance scanning. If that prefix parses, the JSON renders as a card
   * and the trailing prose surfaces as a normal `text` event instead of being
   * swallowed into the raw fallback.
   */
  const releaseJson = (forceRaw: boolean): ParserSseEvent[] => {
    const raw = jsonHold;
    jsonHold = null;
    if (!raw || !raw.trim()) return [];
    if (!forceRaw) {
      const trimmed = raw.trim();
      // 1) Fast path — the whole held buffer is a single JSON value.
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === 'object') {
          return blueprintFramesFor(parsed);
        }
      } catch {
        /* fall through to prefix-extraction below */
      }
      // 2) Boundary path — only the leading `{...}` / `[...]` is JSON; the
      //    rest is trailing prose. Find where the first complete JSON value
      //    ends, parse the prefix, emit the remainder as text.
      const end = firstJsonValueEnd(trimmed);
      if (end > 0) {
        const prefix = trimmed.slice(0, end);
        const rest = trimmed.slice(end);
        try {
          const parsed = JSON.parse(prefix);
          if (parsed && typeof parsed === 'object') {
            const evs = blueprintFramesFor(parsed);
            const restText = rest.trim();
            if (restText.length > 0) {
              evs.push({ event: 'text', data: { text: restText } });
            }
            return evs;
          }
        } catch {
          /* prefix didn't parse either → raw fallback below */
        }
      }
    }
    return [{ event: 'raw', data: { text: raw.trim(), source: 'json-blob' } }];
  };

  /** Route one parser event through the JSON-hold state machine. */
  const consume = (e: ParserSseEvent, nodeId?: string): ParserSseEvent[] => {
    if (e.event === 'text') {
      const text = String((e.data as { text?: string })?.text ?? '');
      if (jsonHold !== null) {
        jsonHold += text;
        return [];
      }
      if (!answerStarted && /^\s*[[{]/.test(text)) {
        jsonHold = text; // start holding a candidate JSON answer
        return [];
      }
      answerStarted = true;
      return [
        nodeId
          ? { event: 'text', data: { ...(e.data as object), node_id: nodeId } }
          : e,
      ];
    }
    // A real structured event. If we were mid-hold, the answer wasn't pure
    // JSON → release the held text as raw, then emit this event.
    answerStarted = true;
    const out: ParserSseEvent[] = [];
    if (jsonHold !== null) out.push(...releaseJson(true));
    out.push(e);
    return out;
  };

  /**
   * P1: flush any pending text (through the parser + JSON-hold state machine)
   * and release a held JSON answer, returning the resulting events. Called
   * before a structured tool-use/tool-result frame so the tool chip lands in
   * timeline order *after* the prose/JSON that preceded it.
   */
  const flushPending = (nodeId?: string): ParserSseEvent[] => {
    const out: ParserSseEvent[] = [];
    if (textBuf.trim().length > 0) {
      const { events } = parseAndExtract(textBuf, session_id, artifactCallback);
      for (const e of events) out.push(...consume(e, nodeId));
      textBuf = '';
    }
    out.push(...releaseJson(false));
    return out;
  };

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
        for (const out of consume(e, chunk.node_id)) yield out;
      }
    } else if (chunk.type === 'thinking-delta') {
      // P1: extended-thinking content → `thinking-chunk` SSE, consumed by the
      // timeline projector's onThinkingChunk (run-sessions.ts) which feeds the
      // collapsible thinking card. Bypasses the parser: thinking is plain
      // prose with no <sf:*> tags, and it arrives strictly before any answer
      // text, so textBuf is still empty here.
      yield {
        event: 'thinking-chunk',
        data: chunk.node_id
          ? { text: chunk.value, node_id: chunk.node_id }
          : { text: chunk.value },
      };
    } else if (chunk.type === 'error') {
      // Final flush of any pending text + held JSON before the error frame.
      if (textBuf.trim().length > 0) {
        const { events } = parseAndExtract(textBuf, session_id, artifactCallback);
        for (const e of events) for (const out of consume(e, chunk.node_id)) yield out;
        textBuf = '';
      }
      for (const out of releaseJson(false)) yield out;
      yield {
        event: 'error',
        data: {
          message: chunk.error.message,
          code: chunk.error.kind,
          node_id: chunk.node_id,
        },
      };
    } else if (chunk.type === 'done') {
      // Per-node `done`. Flush any residual text + held JSON for this node.
      // We don't emit a terminal SSE here — the scheduler emits one `done`
      // per node and the natural end-of-stream is the orchestration signal.
      if (textBuf.trim().length > 0) {
        const { events } = parseAndExtract(textBuf, session_id, artifactCallback);
        for (const e of events) for (const out of consume(e, chunk.node_id)) yield out;
        textBuf = '';
      }
      for (const out of releaseJson(false)) yield out;
    } else if (chunk.type === 'usage') {
      yield {
        event: 'usage',
        data: { ...chunk.usage, node_id: chunk.node_id },
      };
    } else if (chunk.type === 'tool-use') {
      // P1 (root-cure plan §5) — tool calls are now FIRST-CLASS structured SSE,
      // sourced from the typed `tool-use` TurnChunk (ConversationRuntime /
      // ApiClientCallable), NOT re-parsed from <tool_use> XML in the text
      // stream. Flush any pending text + held JSON first so the tool chip lands
      // in timeline order after the prose that preceded it.
      for (const out of flushPending(chunk.node_id)) yield out;
      yield {
        event: 'tool-use',
        data: {
          name: chunk.tool.tool_name,
          input: chunk.tool.tool_input,
          id: chunk.tool.call_id ?? null,
          node_id: chunk.node_id,
        },
      };
      // 2026-06-01 — also surface CLI/built-in `AskUserQuestion` as an
      // interactive question-form modal (not just a tool chip). The user's
      // answer POSTs a follow-up message → continues the conversation.
      const qfEvent = askUserQuestionToFormEvent(
        chunk.tool.tool_name,
        chunk.tool.tool_input,
        chunk.tool.call_id,
        chunk.node_id,
      );
      if (qfEvent) yield qfEvent;
    } else if (chunk.type === 'tool-result') {
      for (const out of flushPending(chunk.node_id)) yield out;
      yield {
        event: 'tool-result',
        data: {
          for: chunk.result.tool_use_id,
          output: chunk.result.output,
          is_error: chunk.result.is_error ?? false,
          node_id: chunk.node_id,
        },
      };
    } else if (chunk.type === 'sse') {
      // ② Spawner passthrough — the CLI/ACP/MCP spawner already produced this as
      // a structured ShadowFlow event ({event,data}). Forward it to the wire
      // VERBATIM (never re-flatten to text → never mis-flagged as sse-frame-leak).
      // Flush pending text/JSON first so it lands in timeline order.
      for (const out of flushPending(chunk.node_id)) yield out;
      yield { event: chunk.event, data: chunk.data };
    }
  }

  // Final flush after the upstream stream ends naturally: drain residual text
  // through the hold state machine, then release any held JSON as a structured
  // card (or raw fallback).
  if (textBuf.trim().length > 0) {
    const { events } = parseAndExtract(textBuf, session_id, artifactCallback);
    for (const e of events) for (const out of consume(e)) yield out;
  }
  for (const out of releaseJson(false)) yield out;
}

// Re-export legacy direct-Anthropic helpers in case any internal code imported
// them — none currently do, but keeping the symbols available avoids surprise
// at refactor time.
void Anthropic;
void fs;
void path;
void parseAndExtract;
