/**
 * team-dag-draft.ts — 自然语言 → Team DAG 草稿：IO 编排层。
 *
 * 2026-11-20 拆分（架构评审 Q5 跟进）：纯函数（compose/parse/validate 与全部
 * 类型）已迁 `domains/collaboration/dag-draft-model.ts`。原因：此前
 * use_cases/teams.ts 为复用 validateDagDraft 而 import 本文件，而本文件顶层
 * import 了 transport/api-clients（callProvider）——ESM 顶层导入没法「只用一半」，
 * 纯函数消费方被迫传递加载外部 LLM SDK。
 *
 * 本文件只留 IO（generateDagDraft，走 BYOK provider，与 /api/llm/messages
 * 同一后端），消费方：
 *   - routes/agents/teams.ts — HTTP 路由层，合法消费方；
 *   - lib/__tests__/team-dag-draft.test.ts — 纯函数直测 + generate 注入测试
 *     （下方 re-export 的域 model 符号保持测试零改动）。
 */

import { callProvider } from '../adapters/transport/api-clients/index';
import {
  composeDagDraftPrompt,
  parseDagDraftJson,
  validateDagDraft,
  type DagDraftAgent,
  type DagDraftOutcome,
} from './collaboration-models/dag-draft-model';

// Re-export the domain model's pure functions and types so existing consumers
// (routes/agents/teams.ts, tests) keep working unchanged.
export {
  composeDagDraftPrompt,
  parseDagDraftJson,
  validateDagDraft,
  normalizeDraftEdgeMode,
} from './collaboration-models/dag-draft-model';
export type {
  DagDraft,
  DagDraftEdge,
  DagDraftEdgeMode,
  DagDraftNode,
  DagDraftAgent,
  DagDraftOutcome,
} from './collaboration-models/dag-draft-model.ts';

export interface DagDraftOptions {
  userText: string;
  agents: DagDraftAgent[];
  provider: string;
  apiKey: string;
  model?: string;
  signal?: AbortSignal;
  /** Override the provider call for tests. */
  callImpl?: typeof callProvider;
  maxTokens?: number;
}

async function callDraftLlm(
  opts: DagDraftOptions,
  prompt: string,
): Promise<{ text: string } | { error: string }> {
  const call = opts.callImpl ?? callProvider;
  let text = '';
  try {
    for await (const chunk of call(opts.provider, {
      systemPrompt:
        '你是多 Agent 团队的拓扑设计师。你的唯一职责：根据用户描述输出严格 JSON 的团队 DAG 草稿，无任何多余文字。',
      userMessage: prompt,
      model: opts.model,
      max_tokens: opts.maxTokens ?? 2000,
      temperature: 0.2,
      api_key: opts.apiKey,
      signal: opts.signal,
    })) {
      if (opts.signal?.aborted) return { error: 'aborted' };
      if (chunk.type === 'text-delta' && typeof chunk.text === 'string') {
        text += chunk.text;
      } else if (chunk.type === 'error') {
        return { error: chunk.message };
      }
    }
  } catch (err) {
    return { error: (err as Error).message ?? String(err) };
  }
  return { text };
}

/**
 * Generate a DAG draft from a one-line description. On parse/validation
 * failure the error list is fed back to the model for exactly ONE retry;
 * still invalid → { kind:'invalid', errors } (route maps to 422). Any LLM
 * failure → { kind:'llm' } (route maps to 502). Draft is never persisted.
 */
export async function generateDagDraft(opts: DagDraftOptions): Promise<DagDraftOutcome> {
  let prevErrors: string[] | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await callDraftLlm(opts, composeDagDraftPrompt(opts.userText, opts.agents, prevErrors));
    if ('error' in res) return { ok: false, kind: 'llm', message: res.error };

    const draft = parseDagDraftJson(res.text);
    if (!draft) {
      prevErrors = ['output was not a parseable JSON draft with a non-empty "nodes" array'];
      continue;
    }
    const errors = validateDagDraft(draft, opts.agents.map((a) => a.id));
    if (errors.length === 0) return { ok: true, draft };
    prevErrors = errors;
  }
  return { ok: false, kind: 'invalid', errors: prevErrors ?? ['draft validation failed'] };
}
