/**
 * openai-compat-instances.ts — All OpenAI-compatible provider instances
 * generated from a single factory. Adding a new OpenAI-compatible provider
 * is a 4-line entry in this file — no parallel SSE plumbing.
 *
 * Excluded: anthropic (own protocol), google (Gemini /v1beta protocol).
 */

import { createOpenAICompatProvider } from './openai-compat-factory';
import type { LLMProvider } from './types';

export const openaiProviderInstance: LLMProvider = createOpenAICompatProvider({
  id: 'openai',
  defaultUrl: 'https://api.openai.com/v1/chat/completions',
});

export const deepseekProviderInstance: LLMProvider = createOpenAICompatProvider({
  id: 'deepseek',
  defaultUrl: 'https://api.deepseek.com/v1/chat/completions',
});

export const zhipuProviderInstance: LLMProvider = createOpenAICompatProvider({
  id: 'zhipu',
  defaultUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
});

export const qwenProviderInstance: LLMProvider = createOpenAICompatProvider({
  id: 'qwen',
  defaultUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
});

export const moonshotProviderInstance: LLMProvider = createOpenAICompatProvider({
  id: 'moonshot',
  defaultUrl: 'https://api.moonshot.cn/v1/chat/completions',
});

export const mistralProviderInstance: LLMProvider = createOpenAICompatProvider({
  id: 'mistral',
  defaultUrl: 'https://api.mistral.ai/v1/chat/completions',
});

export const groqProviderInstance: LLMProvider = createOpenAICompatProvider({
  id: 'groq',
  defaultUrl: 'https://api.groq.com/openai/v1/chat/completions',
});

export const openrouterProviderInstance: LLMProvider = createOpenAICompatProvider({
  id: 'openrouter',
  defaultUrl: 'https://openrouter.ai/api/v1/chat/completions',
});

export const ollamaProviderInstance: LLMProvider = createOpenAICompatProvider({
  id: 'ollama',
  // Ollama exposes an OpenAI-compatible endpoint at /v1/chat/completions
  // (not the legacy /api/chat) — works with the same SSE reader.
  defaultUrl: 'http://localhost:11434/v1/chat/completions',
});

export const lmstudioProviderInstance: LLMProvider = createOpenAICompatProvider({
  id: 'lmstudio',
  defaultUrl: 'http://localhost:1234/v1/chat/completions',
});

/**
 * Azure OpenAI uses a deployment-name URL like
 * `https://<resource>.openai.azure.com/openai/deployments/<deployment>/chat/completions?api-version=2024-02-01`.
 * The user MUST supply `base_url` because the resource + deployment aren't
 * inferable. Until we wire a per-user deployment config in the BYOK UI we
 * fall back to NOT_IMPLEMENTED so the failure mode is loud, not silent.
 */
export const azureProviderInstance: LLMProvider = createOpenAICompatProvider({
  id: 'azure',
  defaultUrl: '',
  buildHeaders: (apiKey) => ({
    'Content-Type': 'application/json',
    'api-key': apiKey, // Azure uses `api-key` header (not Bearer).
  }),
});
