/**
 * llm-timeout.ts — 模型客户端默认总超时（公网演示稳定性批 2026-11-08）。
 *
 * 公网隧道/弱网下，fetch 与 SDK 流可能无限挂起（TCP 半开、对端静默丢包），
 * 而调用方传入的 signal 只覆盖「用户主动取消」。这里给每条模型流叠加一个
 * 总时长上限：`SF_LLM_TIMEOUT_MS`（毫秒，默认 300_000 = 5 分钟）。
 *
 * 超时以 AbortError 冒泡，与用户取消同形——runtime 既有错误策略（折叠部分
 * 消息入史 + SSE error）天然兼容，无需感知超时来源。
 */

const DEFAULT_LLM_TIMEOUT_MS = 300_000;

/** 读取总超时上限：SF_LLM_TIMEOUT_MS（正有限数），否则默认 5 分钟。 */
export function llmTimeoutMs(): number {
  const raw = Number(process.env.SF_LLM_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_LLM_TIMEOUT_MS;
}

/**
 * 叠加默认总超时：任一先到即中止——调用方取消（signal）或超时（timeout）。
 * Node ≥20.3 内置 AbortSignal.any / AbortSignal.timeout。
 */
export function withDefaultLlmTimeout(signal: AbortSignal): AbortSignal {
  return AbortSignal.any([signal, AbortSignal.timeout(llmTimeoutMs())]);
}
