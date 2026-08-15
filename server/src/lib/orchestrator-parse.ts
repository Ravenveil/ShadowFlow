/**
 * orchestrator-parse.ts — Polynoia 5+1 状态机的 INTENT_PARSE 阶段。
 *
 * Polynoia（docs/superpowers/specs §orchestration）：编排者本身是个 agent，
 * 每回合先跑 INTENT_PARSE——把用户的原始消息拆解成 per-agent 子任务清单
 * （流式 plan + JSON 任务列表），DISPATCH 阶段才按 DAG 分层派发。
 *
 * ShadowFlow 落地（groups-chat.ts runFanout 团队分支）：
 *   1. `composeParsePrompt` — 组装给编排者的指令（成员名单 + 角色 soul +
 *      用户消息），要求输出严格 JSON；
 *   2. `decomposeWithLlm` — 走 BYOK provider（callProvider，与
 *      /api/llm/messages 同一后端），收集 text-delta 拼全文；
 *   3. `parseOrchestratorJson` — 纯函数：剥 ``` 围栏、抽 JSON（容忍前后
 *      杂文）、校验 agentId 归属团队成员、产出 ParsedTask[]；
 *   4. 任何失败（无 key / 网络错 / JSON 不合法 / 空清单）→ 返回 null，
 *      调用方降级为现状（用户原文直接分发给所有 agent），零回归。
 *
 * 纯函数（compose/parse）与 IO（decompose）分离，便于单测。
 */
import { callProvider } from '../transport/api-clients';

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
    '你是这个多 Agent 团队的编排者。把用户的请求拆解成团队成员的子任务。',
    '',
    '## 团队成员',
    roster,
    '',
    '## 用户请求',
    userText,
    '',
    '## 输出要求',
    '只输出一个 JSON 数组（可包在 ```json 围栏里），不要其他文字。每项：',
    '{ "agentId": "<成员 id，必须来自上面名单>", "title": "≤20字任务标题", "prompt": "发给该 agent 的完整指令，包含它需要的全部上下文", "depends_on": ["<依赖的成员 id>"] }',
    '规则：每个成员至多一个任务；与请求无关的成员不要分配；prompt 用中文、自包含（不要写"见上文"）。',
  ].join('\n');
}

/**
 * Extract + validate the orchestrator's JSON task list. Tolerates:
 *   • ```json fences
 *   • prose before/after the JSON body
 *   • unknown agents (dropped), duplicate agents (first wins)
 *   • missing title (falls back to prompt head), missing depends_on
 * Returns null when nothing usable remains.
 */
export function parseOrchestratorJson(
  raw: string,
  agents: OrchestratorAgent[],
): ParsedTask[] | null {
  const text = raw.trim();
  if (!text) return null;

  const candidates: string[] = [];
  // Fenced block first (```json ... ```), then the outermost [...] span.
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  if (fence?.[1]) candidates.push(fence[1].trim());
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
    if (!Array.isArray(parsed)) continue;
    const validIds = new Set(agents.map((a) => a.id));
    const seen = new Set<string>();
    const tasks: ParsedTask[] = [];
    for (const item of parsed) {
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
    if (tasks.length > 0) return tasks;
  }
  return null;
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
 * INTENT_PARSE：ask the BYOK LLM to decompose the user message into per-agent
 * tasks. Returns null on ANY failure (no key / provider error / unparseable
 * JSON / empty task list) — the caller then dispatches the raw user text to
 * every agent exactly like today (graceful degradation, never fabricated).
 */
export async function decomposeWithLlm(opts: DecomposeOptions): Promise<ParsedTask[] | null> {
  const call = opts.callImpl ?? callProvider;
  if (!opts.apiKey) return null;
  const system = [
    '你是多 Agent 团队的编排者（orchestrator）。你的唯一职责：把用户请求拆解为成员子任务。',
    '输出必须是严格的 JSON 数组，无任何多余文字。',
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
  return parseOrchestratorJson(text, opts.agents);
}
