/**
 * providerBaseUrl.ts — BYOK 自定义 API 地址（settings/byok）→ 各 SDK 的
 * baseURL 归一与解析（2026-11-07 模型 API 调用链路断点全清）。
 *
 * 背景：settings/byok 里用户配的 `baseUrl` 有两个消费面，此前口径不一致——
 *   - 设置页「校验 / 拉模型列表」探针：`normalizeProviderBaseUrl()`（routes/
 *     system/settings.ts）会按 Cherry Studio 语义做版本段推断（缺 /v1 补上）；
 *   - 真实调用链（run-session / chat / cli 子进程）：PR #49 起原样透传给 SDK。
 * 两边对同一份用户输入解释不同 → 「设置检测通过，对话却 404」这类隐性断点。
 *
 * 本模块给调用链侧定死与探针一致的归一规则（`normalizeSdkBaseUrl`），
 * 并保留「显式传入 > settings 配置 > client 内置默认」三级优先：
 *   - 显式 opts.baseUrl / input.base_url：调用方知道自己在干什么，原样用；
 *   - settings 配置：走 `normalizeSdkBaseUrl`（下表规则）；
 *   - 都没有：返回 undefined，由各 client 的内置默认地址兜底。
 *
 * 各 SDK 的路径拼接语义（决定归一规则）：
 *   - Anthropic SDK：POST `${baseURL}/v1/messages`     → baseURL 必须是"主机根"
 *   - Gemini SDK：   GET  `${baseUrl}/v1beta/...`      → baseUrl 必须是"主机根"
 *   - OpenAI SDK：   POST `${baseURL}/chat/completions`→ baseURL 必须带 /v1
 *     （ollama / lmstudio / 各中转网关同为 OpenAI 兼容形态）
 *   - Azure OpenAI： POST `${baseURL}/chat/completions?api-version=…`，
 *     baseURL = 部署级地址（…/openai/deployments/<name>），query 原样保留
 *     （OpenAiCompatApiClient 会把 query 拆进 SDK defaultQuery）。
 *   - custom-*（用户自定义 provider）：设置页弹窗写明「Base URL（OpenAI 兼容）」，
 *     输入即完整 base（Cherry Studio 语义），原样用、不做版本推断。
 */
import { getSetting } from '../storage/settings';

/**
 * 逃逸符：URL 以 `#` 结尾表示"原样使用、别做版本推断"（Cherry Studio 同款
 * 语义，settings.ts 的 formatApiHost 亦如此）。
 */
function stripTrailingSharp(s: string): string {
  return s.replace(/#$/, '');
}

function stripTrailingSlash(s: string): string {
  return s.replace(/\/+$/, '');
}

/** 路径里是否已有版本段（/v1、/v2beta、…）。镜像 settings.ts 的 hasAPIVersion。 */
function hasAPIVersion(host: string): boolean {
  const VERSION_REGEX = /\/v\d+(?:alpha|beta)?(?:\/|$)/i;
  try {
    return VERSION_REGEX.test(new URL(host).pathname);
  } catch {
    return VERSION_REGEX.test(host);
  }
}

/**
 * settings/byok 的用户 baseUrl → 该 provider SDK 期望形态的 baseURL。
 * 规则见文件头；`raw` 以 `#` 结尾时原样（去 `#`）短路。
 */
export function normalizeSdkBaseUrl(provider: string, raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (trimmed.endsWith('#')) return stripTrailingSharp(stripTrailingSlash(trimmed));

  const host = stripTrailingSlash(trimmed);

  // Anthropic SDK 自己拼 /v1/messages —— 传进去的必须是主机根。
  // 用户若按 OpenAI 习惯带了 /v1，剥掉；mimo 的 anthropic 兼容端点
  // （https://api.xiaomimimo.com/anthropic）这类"路径即根"的原样保留。
  if (provider === 'anthropic') {
    return host.replace(/\/v1$/i, '');
  }

  // Gemini SDK 自己拼 /{apiVersion}/{model}:{task}（默认 v1beta）——
  // 传进去的必须是主机根（DEFAULT_BASE_URL 形态）。
  if (provider === 'google') {
    return host.replace(/\/v1(?:beta)?$/i, '');
  }

  // Azure 部署级地址（…/openai/deployments/<name>）与 custom-* 的完整
  // OpenAI 兼容 base：输入即所见，不做版本推断（与设置页探针同口径）。
  if (provider === 'azure' || provider === 'custom' || provider.startsWith('custom-')) {
    return host;
  }

  // ollama 的 OpenAI 兼容口固定在 /v1（探针的 /api/tags 在根，两者不同）：
  // 用户可能贴 http://host:11434、…/api、…/v1 任一形态，归一到 …/v1。
  if (provider === 'ollama') {
    const root = host.replace(/\/(?:v1|api|chat)$/i, '');
    return `${root}/v1`;
  }

  // 其余 OpenAI 兼容 provider（含 lmstudio、各中转网关）：缺版本段补 /v1，
  // 与 settings.ts formatApiHost 的探针口径一致。
  return hasAPIVersion(host) ? host : `${host}/v1`;
}

/**
 * 解析 provider 的 BYOK 自定义 baseUrl（settings/byok → SDK 归一）。
 *
 * 与 `resolveProviderKey` 同 store。返回 undefined 表示未配置——调用方回退到
 * 各 client 的内置默认地址。显式传入的 baseUrl 不经这里（原样优先）。
 *
 * 背景：此前 `resolveCallable('byok:<provider>')` 只传 key 不传 baseUrl，
 * OpenAiCompatApiClient 回退到 `https://api.openai.com/v1` 等默认地址，
 * 自定义网关/本地端点场景全部打偏（表现为 SDK "Request timed out."）。
 * PR #49 补了透传；本模块再补"与探针一致的归一"（2026-11-07 彻底解决）。
 */
export function resolveProviderBaseUrl(
  provider: string,
): string | undefined {
  try {
    const cfg = getSetting('byok') as
      | { providers?: Record<string, { baseUrl?: string }> }
      | undefined;
    const u = cfg?.providers?.[provider]?.baseUrl;
    if (typeof u === 'string' && u.trim()) return normalizeSdkBaseUrl(provider, u.trim());
  } catch {
    /* settings unavailable — fall through */
  }
  return undefined;
}
