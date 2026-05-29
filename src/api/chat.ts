/**
 * Chat Completions API client — BYOK 模式
 * 从 localStorage 读取 API key，通过 X-LLM-Key header 传给后端
 */

import { getApiBase } from './_base';

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
export function buildByokHeaders(opts?: {
  provider?: string;
  key?: string;
  model?: string;
}): Record<string, string> {
  let secrets: Record<string, string> = {};
  try {
    secrets = JSON.parse(localStorage.getItem('sf_secrets') ?? '{}');
  } catch { /* ignore */ }

  const provider = opts?.provider ?? 'zhipu';
  const key = opts?.key ?? (
    provider === 'zhipu'    ? secrets['zhipu_key'] :
    provider === 'openai'   ? secrets['openai_key'] :
    provider === 'claude'   ? secrets['claude_key'] :
    provider === 'deepseek' ? secrets['deepseek_key'] : ''
  ) ?? '';

  const headers: Record<string, string> = { 'X-LLM-Provider': provider };
  if (key) headers['X-LLM-Key'] = key;
  if (opts?.model) headers['X-LLM-Model'] = opts.model;
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
