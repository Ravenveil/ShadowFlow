/**
 * byokKey.ts — resolve a provider's BYOK API key, server-side.
 *
 * Extracted from run-sessions.ts so the Node chat gateway (groups-chat.ts) and
 * run-sessions share ONE key-resolution policy. Priority order:
 *   1. Per-provider HTTP header (e.g. `x-zhipu-key`)       — most specific, wins
 *   2. Generic `X-LLM-Provider` + `X-LLM-Key` headers      — browser localStorage,
 *      forwarded by src/api/chat.ts buildByokHeaders (DEBT-1, 2026-06-04)
 *   3. ByokSection's saved key in settings/byok            — server-side UI path
 *   4. Per-provider env var (e.g. ZHIPU_API_KEY)           — last-resort default
 *
 * (2) is the DEBT-1 unification: the browser stores the user's key in
 * localStorage (KEY_STORAGE) and forwards it on EVERY request as the generic
 * `X-LLM-*` headers. Before this, the Node gateway only honored per-provider
 * headers + the server `byok` setting, so a user who configured their key in
 * the browser (but never populated server `byok`) got 401 on chat replies.
 * Honoring the generic header bridges 「browser localStorage → Node gateway」,
 * matching what the Python /api/chat/completions path already reads.
 *
 * (3) is the older "前端做了后端没接上" fix: ByokSection writes apiKey to
 * byok-config.json via PUT /api/settings/byok.
 */
import { getSetting } from '../storage/settings';
import { PROVIDER_ENV_VAR, type ProviderId } from './api-clients';

// 2026-11-07 模型链路断点全清：baseUrl 解析/归一独立成 providerBaseUrl.ts
// （api-clients 的 callProvider 也要用，避免 transport↔api-clients 循环依赖），
// 此处 re-export 保持 byokKey 作为"settings/byok 解析"的统一入口。
export { resolveProviderBaseUrl, normalizeSdkBaseUrl } from './providerBaseUrl';

/** Lower-cased request header carrying each provider's key (per-request override). */
export const HEADER_BY_PROVIDER: Record<ProviderId, string> = {
  anthropic: 'x-anthropic-key',
  openai: 'x-openai-key',
  deepseek: 'x-deepseek-key',
  zhipu: 'x-zhipu-key',
  mimo: 'x-mimo-key',
  google: 'x-google-key',
  qwen: 'x-qwen-key',
  moonshot: 'x-moonshot-key',
  mistral: 'x-mistral-key',
  groq: 'x-groq-key',
  openrouter: 'x-openrouter-key',
  ollama: 'x-ollama-key',
  lmstudio: 'x-lmstudio-key',
  azure: 'x-azure-key',
};

/** 取 header 值(Express 可能给 string[]),trim 后返回非空字符串,否则 undefined。 */
function pickHeader(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const v = headers[name];
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === 'string' && s.trim() ? s.trim() : undefined;
}

/**
 * 前端 chat-provider 名 → 后端 ProviderId。浏览器 buildByokHeaders 的 `X-LLM-Provider`
 * 用 chat 名('claude' 等),归一到 ProviderId(claude→anthropic;其余同名)。
 */
function normalizeChatProvider(name: string): string {
  return name === 'claude' ? 'anthropic' : name;
}

/**
 * Resolve the API key for `provider`. `headers` is the incoming request's
 * headers map (lower-cased keys, as Express provides). Returns undefined when
 * no key is found in any source (CLI executors don't need one).
 *
 * 2026-11-07：参数放宽到 string —— settings/byok 允许用户自定义 provider
 * （custom-*），其 key 同样走本函数的"头 → 通用头 → settings → env"四级
 * 优先（custom-* 无 per-provider 头名/env 名，仅走 settings 与通用头）。
 */
export function resolveProviderKey(
  provider: ProviderId | string,
  headers: Record<string, string | string[] | undefined> = {},
): string | undefined {
  // 1) per-provider 头(最具体,最高优先)。custom-* 无对应头名，跳过。
  const specificName = (HEADER_BY_PROVIDER as Record<string, string | undefined>)[provider];
  const specific = specificName ? pickHeader(headers, specificName) : undefined;
  if (specific) return specific;

  // 2) 通用 X-LLM-* 头(DEBT-1 统一,2026-06-04):浏览器把 localStorage 里配的 key 经
  //    X-LLM-Provider / X-LLM-Key 转发(src/api/chat.ts buildByokHeaders)。仅当通用头声明
  //    的 provider 归一后与请求 provider 一致才采用,防止张冠李戴(如声明 openai 却被当
  //    anthropic 用)。这桥接「浏览器 localStorage → Node 网关」,不再依赖服务端 byok 设置另填。
  const llmKey = pickHeader(headers, 'x-llm-key');
  const llmProvider = pickHeader(headers, 'x-llm-provider');
  if (llmKey && llmProvider && normalizeChatProvider(llmProvider) === provider) {
    return llmKey;
  }

  // 3) 服务端 byok 设置(ByokSection 经 PUT /api/settings/byok 写入)。
  try {
    const cfg = getSetting('byok') as
      | { providers?: Record<string, { apiKey?: string }> }
      | undefined;
    const k = cfg?.providers?.[provider]?.apiKey;
    if (typeof k === 'string' && k.trim()) return k.trim();
  } catch {
    /* settings unavailable — fall through to env */
  }

  // 4) 环境变量(最后兜底)。custom-* 无对应 env 名，跳过。
  const envName = (PROVIDER_ENV_VAR as Record<string, string | undefined>)[provider];
  const envVal = envName ? process.env[envName] : undefined;
  return typeof envVal === 'string' && envVal.trim() ? envVal.trim() : undefined;
}

/**
 * 该 provider 是否已在 settings/byok 注册（2026-11-07）。
 *
 * 用途：模型选择器会把用户自定义 provider（custom-*，前端 ByokSection 创建）
 * 以 `byok:custom-…` executor 提交到 run-sessions；provider 校验不能只认
 * `PROVIDER_IDS` 白名单（那是内置目录），还要认 settings 里注册过的自定义
 * provider。仅"注册过"即放行——key/baseUrl 缺失时由下游 client 大声报错。
 */
export function isSettingsRegisteredProvider(provider: string): boolean {
  try {
    const cfg = getSetting('byok') as
      | { providers?: Record<string, unknown> }
      | undefined;
    return Boolean(cfg?.providers && provider in cfg.providers);
  } catch {
    return false;
  }
}

