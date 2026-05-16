/**
 * llm-providers/google.ts — Google Gemini provider stub.
 *
 * Gemini uses its own `generateContent` protocol against
 * `https://generativelanguage.googleapis.com/v1beta/models/<model>:streamGenerateContent?key=<KEY>&alt=sse`.
 * Different request body shape (`contents` instead of `messages`), different
 * SSE event format, no `[DONE]` sentinel. Real streamCompletion implementation
 * is a separate piece of work; for now we keep the dispatch link complete so
 * `byok:google` doesn't crash the run-session route, and surface
 * NOT_IMPLEMENTED so the failure is loud.
 */

import {
  DEFAULT_MODELS,
  PROVIDER_LABEL,
  type LLMProvider,
  type ProviderChunk,
  type ProviderInput,
} from './types';

async function* streamCompletion(_input: ProviderInput): AsyncGenerator<ProviderChunk> {
  yield {
    type: 'error',
    message:
      `${PROVIDER_LABEL.google} 流式聊天尚未在服务端实现。` +
      `可在 BYOK 设置中验证 key + 拉取模型列表；正式聊天请暂时切换到其他 provider。`,
    code: 'NOT_IMPLEMENTED',
    provider: 'google',
  };
}

export const googleProvider: LLMProvider = {
  id: 'google',
  defaultModel: DEFAULT_MODELS.google,
  streamCompletion,
};
