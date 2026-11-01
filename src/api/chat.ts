/**
 * Chat Completions API client — BYOK 模式
 * 从 localStorage 读取 API key，通过 X-LLM-Key header 传给后端
 */

import { getApiBase, getStoredApiKey, getDefaultProvider, type ProviderId } from './_base';

export type TextPart = { type: 'text'; text: string };
export type ImagePart = { type: 'image_url'; image_url: { url: string } };
export type ContentPart = TextPart | ImagePart;

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | ContentPart[];
}

export interface ChatCompletionRequest {
  messages: ChatMessage[];
  agent_id?: string;
}

export interface ChatCompletionResponse {
  content: string;
  model: string;
  provider: string;
  tokens_used: number;
}

/**
 * 从 localStorage `sf_secrets` 构造 BYOK `X-LLM-*` headers。
 * chatCompletion（单聊）与 postGroupMessage（群聊）共用，让两条路都把浏览器里
 * 配的 key 转发给后端。总是带 `X-LLM-Provider`；有 key/model 时才带对应 header。
 */
// chat 后端认的 provider 名（X-LLM-Provider）。anthropic↔claude：sf_secrets 用
// 'claude'，_base.ts KEY_STORAGE 用 'anthropic'，后端两名都接受（都→CLAUDE）。
const _BYOK_PROVIDER_ORDER = ['claude', 'openai', 'deepseek', 'zhipu'] as const;

/**
 * 读取某 chat-provider 的 key。2026-05-29 统一存储后 **B 套 KEY_STORAGE 是真相源**
 * （SecretsModal + 设置页 ApiKeySettings 都写它），优先读；老 `sf_secrets.{p}_key`
 * 仅作迁移过渡期的兼容回退（main.tsx 的 migrateLegacySecrets 已把老值搬进 B 套，
 * 这条回退基本不会再命中，留着兜底未迁移的边角）。claude↔anthropic 映射。
 */
function _readByokKey(provider: string, secrets: Record<string, string>): string {
  const baseId = (provider === 'claude' ? 'anthropic' : provider) as ProviderId;
  try {
    const k = getStoredApiKey(baseId);
    if (k) return k;
  } catch {
    /* ignore */
  }
  return secrets[`${provider}_key`] ?? '';
}

/**
 * 从两套 localStorage BYOK 存储构造 `X-LLM-*` headers。chatCompletion（单聊）与
 * postGroupMessage（群聊）共用，前后端一致。provider 自动发现：opts →
 * sf_secrets.provider → 设置页默认 provider → 扫所有已知 provider 取第一个有 key
 * 的（不再写死 zhipu，避免用户配的是 anthropic 却发 zhipu+空 key → 401）。
 */
export function buildByokHeaders(opts?: {
  provider?: string;
  key?: string;
  model?: string;
}): Record<string, string> {
  let secrets: Record<string, string> = {};
  try {
    secrets = JSON.parse(localStorage.getItem('sf_secrets') ?? '{}');
  } catch { /* ignore */ }

  // 显式传 key 直接用。
  if (opts?.key) {
    const provider = opts.provider ?? (secrets['provider'] as string) ?? 'zhipu';
    const headers: Record<string, string> = { 'X-LLM-Provider': provider, 'X-LLM-Key': opts.key };
    if (opts.model) headers['X-LLM-Model'] = opts.model;
    return headers;
  }

  let provider = opts?.provider ?? (secrets['provider'] as string | undefined) ?? '';
  let key = provider ? _readByokKey(provider, secrets) : '';

  if (!key) {
    try {
      const dp = getDefaultProvider();               // anthropic / openai / ...
      const chatP = dp === 'anthropic' ? 'claude' : dp;
      const k = _readByokKey(chatP, secrets);
      if (k) { provider = chatP; key = k; }
    } catch { /* ignore */ }
  }
  if (!key) {
    for (const p of _BYOK_PROVIDER_ORDER) {
      const k = _readByokKey(p, secrets);
      if (k) { provider = p; key = k; break; }
    }
  }
  if (!provider) provider = 'zhipu';

  const headers: Record<string, string> = { 'X-LLM-Provider': provider };
  if (key) headers['X-LLM-Key'] = key;
  const model = opts?.model ?? secrets['model'];
  if (model) headers['X-LLM-Model'] = model;
  return headers;
}

export async function chatCompletion(
  req: ChatCompletionRequest,
  opts?: { provider?: string; key?: string; model?: string; signal?: AbortSignal }
): Promise<ChatCompletionResponse> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...buildByokHeaders(opts),
  };

  const res = await fetch(`${getApiBase()}/api/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(req),
    signal: opts?.signal,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Chat API error ${res.status}: ${body}`);
  }

  const env = await res.json() as { data: ChatCompletionResponse };
  return env.data;
}
