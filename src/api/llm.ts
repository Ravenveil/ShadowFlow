/**
 * LLM API client — 六层能力第二轮 B：一句话生成 Agent 人设（persona/soul）。
 *
 * 复用 Node 网关现有 OpenAI 协议代理 POST /api/llm/chat/completions
 * （server/src/routes/llm.ts，非流式），不新增后端端点：prompt 模板放前端，
 * 网关只做协议转换 + BYOK 分发。
 *
 * 默认走 zhipu GLM（glm-4.5-flash，对齐 server DEFAULT_MODELS.zhipu）。
 * BYOK key 取自 localStorage（sf_zhipu_key，_base.ts B 套存储），以
 * `Authorization: Bearer` 头发出（网关 extractApiKey 只认 x-api-key /
 * Authorization）；无前端 key 时依赖服务端 env 兜底。
 *
 * 任何失败（无 key 401 / 网络错 / 空响应）抛 LlmApiError，由调用方优雅降级，
 * 绝不阻塞「只填名称」的老路径。
 */

import { getApiBase, getStoredApiKey } from './_base';

export class LlmApiError extends Error {
  public readonly code: string;

  constructor(
    public status: number,
    public detail: unknown,
    code: string = '',
  ) {
    super(`LLM API error ${status}`);
    this.code = code || `HTTP_${status}`;
  }
}

function _extractError(detail: unknown): { code: string; message: string } {
  if (detail && typeof detail === 'object') {
    const inner = (detail as Record<string, unknown>).error;
    if (inner && typeof inner === 'object') {
      const e = inner as Record<string, unknown>;
      return {
        code: typeof e.code === 'string' ? e.code : typeof e.type === 'string' ? e.type : '',
        message: typeof e.message === 'string' ? e.message : '',
      };
    }
  }
  return { code: '', message: '' };
}

export interface GeneratePersonaOptions {
  /** 覆盖默认模型（默认 glm-4.5-flash → 路由到 zhipu provider）。 */
  model?: string;
  signal?: AbortSignal;
}

const DEFAULT_MODEL = 'glm-4.5-flash';

/** system prompt：约束输出为可直接入库的中文 persona，三段结构。 */
const PERSONA_SYSTEM_PROMPT = [
  '你是资深 AI Agent 设计师。用户会给你一句话描述，你要为这个角色生成一份可直接使用的 Agent 人设（persona）。',
  '要求：',
  '1. 全程使用中文；',
  '2. 严格按以下三段输出，每段以「## 」开头：## 角色定位 / ## 核心能力 / ## 工作边界；',
  '3. 角色定位：一段话说明这个 Agent 是谁、服务什么场景；',
  '4. 核心能力：3-5 条要点（每条一行，以「- 」开头），写清能做什么；',
  '5. 工作边界：2-3 条要点，写清不做什么、何时该拒绝或转交；',
  '6. 只输出人设正文，不要任何寒暄、解释或代码块包裹。',
].join('\n');

/**
 * 一句话 → 完整 persona。返回生成的纯文本（已 trim）。
 * 失败抛 LlmApiError（含后端真实 code/message），调用方负责降级。
 */
export async function generateAgentPersona(
  description: string,
  opts: GeneratePersonaOptions = {},
): Promise<string> {
  const desc = description.trim();
  if (!desc) throw new LlmApiError(0, null, 'EMPTY_DESCRIPTION');

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const key = getStoredApiKey('zhipu');
  if (key) headers['Authorization'] = `Bearer ${key}`;

  const model = opts.model ?? DEFAULT_MODEL;
  const res = await fetch(`${getApiBase()}/api/llm/chat/completions`, {
    method: 'POST',
    headers,
    signal: opts.signal,
    body: JSON.stringify({
      model,
      stream: false,
      max_tokens: 1024,
      temperature: 0.7,
      messages: [
        { role: 'system', content: PERSONA_SYSTEM_PROMPT },
        { role: 'user', content: `一句话描述：${desc}` },
      ],
    }),
  });

  const body = await res.text();
  let parsed: unknown = body;
  try {
    parsed = JSON.parse(body);
  } catch {
    // keep raw text
  }

  if (!res.ok) {
    const { code, message } = _extractError(parsed);
    throw new LlmApiError(res.status, parsed, code || message);
  }

  const choices = (parsed as { choices?: unknown }).choices;
  const content =
    Array.isArray(choices) && choices[0] && typeof choices[0] === 'object'
      ? ((choices[0] as { message?: { content?: unknown } }).message?.content ?? '')
      : '';
  if (typeof content !== 'string' || !content.trim()) {
    throw new LlmApiError(res.status, parsed, 'EMPTY_RESPONSE');
  }
  // 剥离网关注入思考通道标记的推理段（zhipu 思考模型 reasoning_content 会以
  // <sf:thinking>…</sf:thinking> 混在 content 里；非流式一次性返回时无法走
  // 客户端 ThinkCard 通道，直接丢弃——人设正文不需要思考过程）。
  const cleaned = content
    .replace(/<sf:thinking>[\s\S]*?<\/sf:thinking>/g, '')
    .replace(/<sf:thinking>[\s\S]*$/g, '') // 未闭合兜底（max_tokens 截断时）
    .trim();
  if (!cleaned) {
    // 极端情况：1024 预算全耗在思考上、正文为空 → 视为失败走降级
    throw new LlmApiError(res.status, parsed, 'EMPTY_RESPONSE');
  }
  return cleaned;
}
