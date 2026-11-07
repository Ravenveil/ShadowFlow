/**
 * orchestrator-parse.ts — Polynoia 5+1 状态机的 INTENT_PARSE 阶段。
 *
 * Polynoia（docs/superpowers/specs §orchestration）：编排者本身是个 agent，
 * 每回合先跑 INTENT_PARSE——把用户的原始消息拆解成 per-agent 子任务清单
 * （流式 plan + JSON 任务列表），DISPATCH 阶段才按 DAG 分层派发。
 *
 * ShadowFlow 落地（groups-chat.ts runFanout 意图路由）：
 *   1. `composeParsePrompt` — 组装给编排者的指令（成员名单 + 角色 soul +
 *      用户消息 + 策略矩阵），要求输出 {intent, strategy, tasks} JSON；
 *   2. `planWithLlm` — 走 BYOK provider（callProvider，与 /api/llm/messages
 *      同一后端），收集 text-delta 拼全文，产出 ChatPlan（意图+策略+工单）；
 *   3. `parseOrchestratorPlan` — 纯函数：剥 ``` 围栏、抽 JSON（容忍前后
 *      杂文与旧数组格式）、校验 agentId 归属团队成员、收敛 intent/strategy；
 *   4. 任何失败（无 key / 网络错 / JSON 不合法 / 空清单）→ 返回 null，
 *      调用方降级为启发式策略矩阵（chat-strategy.heuristicPlan），零回归。
 *
 * 纯函数（compose/parse）与 IO（decompose）分离，便于单测。
 */
import { callProvider } from '../transport/api-clients';
import type { ChatIntent, ChatPlan, ChatStrategy } from './chat-strategy';

export interface OrchestratorAgent {
  id: string;
  name: string;
  /** Agent persona/soul excerpt so the orchestrator can route by specialty. */
  soul?: string;
}

export interface ParsedTask {
  agentId: string;
  /** Short imperative title for the plan_card row (≤ 40 chars). */
  title: string;
  /** The full prompt DISPATCH sends to this agent (replaces raw user text). */
  prompt: string;
  /** Informational dependencies (execution order still comes from team DAG). */
  depends_on?: string[];
}

export interface DecomposeOutcome {
  tasks: ParsedTask[];
  /** 'llm' = orchestrator decomposition; 'fallback' = raw passthrough. */
  source: 'llm' | 'fallback';
}

/** Compose the orchestrator's instruction. Exported for unit tests. */
export function composeParsePrompt(userText: string, agents: OrchestratorAgent[]): string {
  const roster = agents
    .map((a) => {
      const soulExcerpt = (a.soul ?? '').trim().slice(0, 160);
      return `- id: ${a.id} | name: ${a.name}${soulExcerpt ? ` | 简介: ${soulExcerpt}` : ''}`;
    })
    .join('\n');
  return [
    '你是这个多 Agent 团队的编排者。先识别用户消息的意图，再按策略矩阵把请求拆解成团队成员的子任务。',
    '',
    '## 团队成员',
    roster,
    '',
    '## 用户请求',
    userText,
    '',
    '## 策略矩阵（意图 → 协作策略）',
    '- 寒暄/应答 → intent=casual, strategy=solo（只派 1 人轻松回复）',
    '- 问答/咨询 → intent=question, strategy=expert（只派最对口的 1 人）',
    '- 讨论/征求意见 → intent=discussion, strategy=roundtable（2-3 人给观点）',
    '- 任务单工种 → intent=task, strategy=expert（1 人）',
    '- 任务多工种且有先后依赖 → intent=task, strategy=pipeline（按 depends_on 串行交接）',
    '- 任务多工种互相独立 → intent=task, strategy=parallel（并行分工）',
    '- 面向全体的号召（大家/各位/全员一起…）→ intent=task, strategy=all-hands（全员参与）',
    '',
    '## 输出要求',
    '只输出一个 JSON 对象（可包在 ```json 围栏里），不要其他文字：',
    '{',
    '  "intent": "casual | question | discussion | task",',
    '  "strategy": "solo | expert | pipeline | parallel | roundtable | all-hands",',
    '  "tasks": [ { "agentId": "<成员 id，必须来自上面名单>", "title": "≤20字任务标题", "prompt": "发给该 agent 的完整指令，包含它需要的全部上下文", "depends_on": ["<依赖的成员 id>"] } ]',
    '}',
    '规则：每个成员至多一个任务；与请求无关的成员不要分配；prompt 用中文、自包含（不要写"见上文"）。',
  ].join('\n');
}

/**
 * Extract the orchestrator's JSON payload. Tolerates:
 *   • ```json fences
 *   • prose before/after the JSON body
 *   • BOTH shapes: the plan object {"intent","strategy","tasks":[...]}（现行）
 *     and the legacy bare array [...]（2026-11-07 之前的旧 prompt 输出）
 * Returns the tasks list (unvalidated) plus optional plan metadata.
 */
function extractPlanJson(raw: string): { tasks: unknown[]; intent?: unknown; strategy?: unknown } | null {
  const text = raw.trim();
  if (!text) return null;

  const candidates: string[] = [];
  // Fenced block first (```json ... ```), then the outermost {...} span (object
  // shape BEFORE array span — 否则 tasks 数组会被当成 legacy 数组截走、丢掉
  // intent/strategy 元数据), then the outermost [...] span, then the raw text.
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  if (fence?.[1]) candidates.push(fence[1].trim());
  const oStart = text.indexOf('{');
  const oEnd = text.lastIndexOf('}');
  if (oStart !== -1 && oEnd > oStart) candidates.push(text.slice(oStart, oEnd + 1));
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start !== -1 && end > start) candidates.push(text.slice(start, end + 1));
  candidates.push(text);

  for (const candidate of candidates) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(candidate);
    } catch {
      continue;
    }
    if (Array.isArray(parsed)) return { tasks: parsed };
    if (parsed && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>;
      if (Array.isArray(obj.tasks)) {
        return { tasks: obj.tasks, intent: obj.intent, strategy: obj.strategy };
      }
    }
  }
  return null;
}

/**
 * Validate + normalize the task list. Tolerates:
 *   • unknown agents (dropped), duplicate agents (first wins)
 *   • missing title (falls back to prompt head), missing depends_on
 * Returns null when nothing usable remains.
 */
function validateTasks(list: unknown[], agents: OrchestratorAgent[]): ParsedTask[] | null {
  const validIds = new Set(agents.map((a) => a.id));
  const seen = new Set<string>();
  const tasks: ParsedTask[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const t = item as Record<string, unknown>;
    const agentId = typeof t.agentId === 'string' ? t.agentId : '';
    const prompt = typeof t.prompt === 'string' ? t.prompt.trim() : '';
    if (!agentId || !validIds.has(agentId) || !prompt || seen.has(agentId)) continue;
    const rawTitle = typeof t.title === 'string' ? t.title.trim() : '';
    const title = (rawTitle || prompt.slice(0, 20)).slice(0, 40);
    const dependsOn = Array.isArray(t.depends_on)
      ? t.depends_on.filter((d): d is string => typeof d === 'string' && validIds.has(d))
      : undefined;
    seen.add(agentId);
    tasks.push({
      agentId,
      title,
      prompt,
      ...(dependsOn && dependsOn.length > 0 ? { depends_on: dependsOn } : {}),
    });
  }
  return tasks.length > 0 ? tasks : null;
}

const PLAN_INTENTS: readonly ChatIntent[] = ['casual', 'question', 'discussion', 'task'];
const PLAN_STRATEGIES: readonly ChatStrategy[] = [
  'solo',
  'expert',
  'pipeline',
  'parallel',
  'roundtable',
  'all-hands',
];

/**
 * Extract + validate the full orchestrator plan（意图 + 策略 + 工单）。
 * 旧数组输出 → 合成计划（intent=task，多任务默认 parallel）；LLM 给的
 * intent/strategy 不在枚举内 → 收敛到安全缺省。Returns null when nothing
 * usable remains.
 */
export function parseOrchestratorPlan(
  raw: string,
  agents: OrchestratorAgent[],
): ChatPlan | null {
  const payload = extractPlanJson(raw);
  if (!payload) return null;
  const tasks = validateTasks(payload.tasks, agents);
  if (!tasks) return null;
  const intent: ChatIntent = PLAN_INTENTS.includes(payload.intent as ChatIntent)
    ? (payload.intent as ChatIntent)
    : 'task';
  const strategy: ChatStrategy = PLAN_STRATEGIES.includes(payload.strategy as ChatStrategy)
    ? (payload.strategy as ChatStrategy)
    : tasks.length > 1
      ? 'parallel'
      : 'expert';
  return { intent, strategy, tasks, source: 'llm' };
}

/**
 * Extract + validate the orchestrator's JSON task list（legacy 契约：只回工单）。
 * Kept for existing callers/tests — delegates to parseOrchestratorPlan.
 */
export function parseOrchestratorJson(
  raw: string,
  agents: OrchestratorAgent[],
): ParsedTask[] | null {
  return parseOrchestratorPlan(raw, agents)?.tasks ?? null;
}

export interface DecomposeOptions {
  userText: string;
  agents: OrchestratorAgent[];
  provider: string;
  apiKey?: string;
  model?: string;
  /** Abort fanout signal — decomposition honours cancellation. */
  signal?: AbortSignal;
  /** Override the provider call for tests. */
  callImpl?: typeof callProvider;
  maxTokens?: number;
}

/**
 * INTENT_PARSE：ask the BYOK LLM to classify intent + pick a strategy from the
 * strategy matrix + decompose the user message into per-agent work orders
 * (one ChatPlan). Returns null on ANY failure (no key / provider error /
 * unparseable JSON / empty task list) — the caller then falls back to the
 * heuristic strategy matrix (chat-strategy.heuristicPlan), never fabricates.
 */
export async function planWithLlm(opts: DecomposeOptions): Promise<ChatPlan | null> {
  const call = opts.callImpl ?? callProvider;
  if (!opts.apiKey) return null;
  const system = [
    '你是多 Agent 团队的编排者（orchestrator）。你的唯一职责：识别用户消息意图，',
    '按策略矩阵选择协作策略，并把请求拆解为成员子任务。',
    '输出必须是严格的 JSON 对象（intent/strategy/tasks），无任何多余文字。',
  ].join('\n');

  let text = '';
  try {
    for await (const chunk of call(opts.provider, {
      systemPrompt: system,
      userMessage: composeParsePrompt(opts.userText, opts.agents),
      model: opts.model,
      max_tokens: opts.maxTokens ?? 1600,
      temperature: 0.2,
      api_key: opts.apiKey,
      signal: opts.signal,
    })) {
      if (opts.signal?.aborted) return null;
      if (chunk.type === 'text-delta' && typeof chunk.text === 'string') {
        text += chunk.text;
      } else if (chunk.type === 'error') {
        return null;
      }
    }
  } catch {
    return null;
  }
  return parseOrchestratorPlan(text, opts.agents);
}

/**
 * Legacy entry（2026-11-07 前的契约）：只回工单清单。委托 planWithLlm ——
 * 旧数组输出仍可解析（parseOrchestratorPlan 兼容）。新调用方直接用 planWithLlm。
 */
export async function decomposeWithLlm(opts: DecomposeOptions): Promise<ParsedTask[] | null> {
  const plan = await planWithLlm(opts);
  return plan ? plan.tasks : null;
}
