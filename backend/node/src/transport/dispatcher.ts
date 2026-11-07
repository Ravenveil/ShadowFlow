/**
 * dispatcher.ts — Executor-string → LlmCallable factory.
 *
 * Single entry point that maps a user-facing "executor" identifier (the picker
 * string in agent.yaml / UI) to a concrete `LlmCallable`. Replaces the
 * historical `skill-runners/index.ts` `dispatchSkillRunner()` per Phase 2
 * decision A6 (O1 unified path).
 *
 * See `docs/architecture/orchestration-transport.md` §"Phase 2 Eng Review · 决策记录"
 * decisions A5 (transport/ directory consolidation) and A6.
 *
 * Concrete `LlmCallable` implementations live alongside this file
 * (`ApiClientCallable` / `CliCallable` / `AcpCallable` / `McpCallable`);
 * Lane 3 (assembler refactor) calls `resolveCallable()` once per skill
 * dispatch and then drives the returned callable through `turn()`.
 */

import type { LlmCallable } from './LlmCallable';
import { LlmCallError } from '../workflow/types';
import { ApiClientCallable } from './ApiClientCallable';
import { CliCallable } from './CliCallable';
import { AcpCallable } from './AcpCallable';
import { McpCallable } from './McpCallable';
import { resolveProviderBaseUrl, resolveProviderKey, normalizeSdkBaseUrl } from './byokKey';
import { getSetting } from '../storage/settings';

/**
 * Executor string grammar.
 *
 *   - `anthropic-direct`     → BYOK Anthropic SDK (default fallback)
 *   - `cli:<name>`           → spawn a CLI binary (`cli:claude`, `cli:codex`)
 *   - `acp:<name>`           → ACP-protocol agent (`acp:bmad`)
 *   - `mcp:<server>/<tool>`  → MCP-protocol agent
 *   - `byok:<provider>`      → BYOK via openai-compat (`byok:zhipu`, `byok:openai`,
 *                              `byok:google`, ...). Provider resolution lives in
 *                              `transport/api-clients/` (moved from `llm-providers/`).
 *
 * Anything else throws `LlmCallError('provider-error')` at resolve time.
 */
export type ExecutorString =
  | `cli:${string}`
  | `acp:${string}`
  | `mcp:${string}`
  | `byok:${string}`
  | 'anthropic-direct';

/**
 * Per-call resolution options. Kept narrow on purpose: anything model-tuning
 * (temperature, maxTokens) is owned by `LlmCallableTurnInput` at turn time,
 * not by the factory. The fields here are construction-time only (need to
 * pick a credential / pin a model before the callable instance exists).
 */
export interface ResolveOptions {
  /** BYOK key for `byok:*` / `anthropic-direct`. */
  apiKey?: string;
  /**
   * BYOK provider id（2026-10-30 联动修复）：cli:* 子进程注入哪个 provider 的
   * key 由它决定（如 ARC 的 preflight 读 OPENAI_API_KEY）。与 apiKey 配对使用。
   */
  provider?: string;
  /**
   * BYOK 自定义 API 地址（2026-11-07 Day1 打通修复）：`byok:*` 的
   * OpenAI-compat 端点覆盖。缺省时从 settings/byok 里同 provider 的
   * `baseUrl` 兜底解析（`resolveProviderBaseUrl`），仍未配置才回退各
   * client 的内置默认地址。此前该字段缺失，自定义网关/本地端点被打偏到
   * 默认公网地址（SDK "Request timed out."）。
   */
  baseUrl?: string;
  /** Pinned model id (e.g., `claude-opus-4-7`, `glm-4.6`). */
  model?: string;
  /** Default ceilings the callable should encode into its requests. */
  maxTokens?: number;
  temperature?: number;
  /** Session id propagated to spawner runners for artifact callbacks. */
  sessionId?: string;
  /** Workspace cwd hint for CLI/ACP/MCP; falls back to LlmCallableTurnInput.workspace. */
  workspace?: string;
}

/**
 * Resolve an executor string into a concrete `LlmCallable` instance.
 *
 * The match order is the same as the legacy `dispatchSkillRunner`:
 *   1. `anthropic-direct` → ApiClientCallable('anthropic')
 *   2. `cli:<id>` → CliCallable (no `cli:auto` resolution here — the caller
 *      is expected to have resolved auto-detect to a concrete CLI id already,
 *      via `transport/spawners/index.ts:dispatchSkillRunner` while Lane 3 is
 *      mid-flight; once Assembler is fully migrated it will call detectAll()
 *      itself before constructing the callable).
 *   3. `acp:<target>` → AcpCallable
 *   4. `mcp:<spec>` → McpCallable
 *   5. `byok:<provider>` → ApiClientCallable(provider)
 */
/**
 * BYOK provider → Claw 子进程注入的环境变量名（2026-10-30 设置联动）。
 * 值 = 用户在设置页配的 key。CLI 自带认证（claude login / hermes portal）
 * 的会忽略这些变量，不受影响；读 env 的 Claw（ARC 读 OPENAI_API_KEY 等）
 * 从此能用平台设置的 key，不再 Connection error。
 * 2026-11-07：补 mimo（此前 settings 里的 mimo key 到不了子进程）。
 */
const CLI_ENV_BY_PROVIDER: Record<string, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  zhipu: 'ZHIPU_API_KEY',
  mimo: 'MIMO_API_KEY',
  google: 'GEMINI_API_KEY',
  qwen: 'DASHSCOPE_API_KEY',
  moonshot: 'MOONSHOT_API_KEY',
  mistral: 'MISTRAL_API_KEY',
  groq: 'GROQ_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
};

/**
 * BYOK provider → 自定义 API 地址的子进程 env 名（2026-11-07 模型链路断点
 * 全清）。与 CLI_ENV_BY_PROVIDER 同哲学："只注入、不强求"——CLI 自带配置
 * 的忽略即可；读 env 的 Claw（claude 读 ANTHROPIC_BASE_URL、OpenAI SDK 系
 * 读 OPENAI_BASE_URL 等）从此能用平台设置的自定义网关/本地端点。
 */
const CLI_BASEURL_ENV_BY_PROVIDER: Record<string, string> = {
  anthropic: 'ANTHROPIC_BASE_URL',
  openai: 'OPENAI_BASE_URL',
  deepseek: 'DEEPSEEK_BASE_URL',
  zhipu: 'ZHIPU_BASE_URL',
  mimo: 'MIMO_BASE_URL',
  google: 'GEMINI_BASE_URL',
  qwen: 'DASHSCOPE_BASE_URL',
  moonshot: 'MOONSHOT_BASE_URL',
  mistral: 'MISTRAL_BASE_URL',
  groq: 'GROQ_BASE_URL',
  openrouter: 'OPENROUTER_BASE_URL',
};

function cliKeyEnv(provider: string, apiKey: string): Record<string, string> {
  const name = CLI_ENV_BY_PROVIDER[provider];
  return name ? { [name]: apiKey } : {};
}

function cliBaseUrlEnv(provider: string, baseUrl?: string): Record<string, string> {
  const name = CLI_BASEURL_ENV_BY_PROVIDER[provider];
  return name && baseUrl ? { [name]: baseUrl } : {};
}

/**
 * 设置页全量联动（2026-10-30）：读取 settings/byok 里所有 enabled 且配了
 * key 的 provider，按标准 env 名全部注入 Claw 子进程。Claw 只消费自己认识
 * 的变量（ARC 读 OPENAI_API_KEY，hermes 读自己的配置），互不干扰。读取失败
 * 静默返回 {}（联动是增强，不是依赖）。
 * 2026-11-07：同表联动自定义 API 地址（*_BASE_URL），无 key 但配了地址的
 * provider 也注入（本地网关可能不需要 key）。
 */
function cliByokEnvFromSettings(): Record<string, string> {
  try {
    // 2026-11-07：改静态 import（byokKey → storage/settings 已在依赖图里，
    // 无新增耦合）。此前惰性 require 在 vitest 的 ESM 变换下是静默 no-op
    // （require 不存在 → catch → {}），设置层注入在单测里根本跑不到、
    // prod-vs-test 行为分叉。静态 import 后 vi.mock 可注入、两侧同径。
    const byok = getSetting('byok') as
      | {
          providers?: Record<
            string,
            { apiKey?: string; enabled?: boolean; baseUrl?: string }
          >;
        }
      | undefined;
    const env: Record<string, string> = {};
    for (const [id, p] of Object.entries(byok?.providers ?? {})) {
      if (!p?.enabled) continue;
      if (p.apiKey) Object.assign(env, cliKeyEnv(id, p.apiKey));
      if (typeof p.baseUrl === 'string' && p.baseUrl.trim()) {
        Object.assign(env, cliBaseUrlEnv(id, normalizeSdkBaseUrl(id, p.baseUrl)));
      }
    }
    return env;
  } catch {
    return {};
  }
}

export function resolveCallable(
  executor: ExecutorString | string,
  opts: ResolveOptions = {},
): LlmCallable {
  if (!executor || typeof executor !== 'string') {
    throw new LlmCallError(
      'provider-error',
      `resolveCallable: executor string is empty`,
    );
  }
  const exec = executor.trim();

  // 1. anthropic-direct → in-process Anthropic SDK
  if (exec === 'anthropic-direct') {
    return new ApiClientCallable('anthropic', {
      apiKey: opts.apiKey,
      model: opts.model,
      maxTokens: opts.maxTokens,
      temperature: opts.temperature,
    });
  }

  // 2. cli:<id> — local CLI spawner
  if (exec.startsWith('cli:')) {
    const id = exec.slice(4);
    if (!id) {
      throw new LlmCallError(
        'provider-error',
        `resolveCallable("${exec}"): cli: prefix requires an id (e.g. cli:claude)`,
      );
    }
    return new CliCallable(id, {
      sessionId: opts.sessionId,
      cwd: opts.workspace,
      model: opts.model,
      maxTokens: opts.maxTokens,
      // 2026-10-30 设置联动（两层）：
      //  1) 本 session 显式 provider+key（请求头 BYOK）→ 注入该 provider 的 env
      //  2) 设置页全部 enabled 的 BYOK key → 按标准 env 名全量注入
      // Claw 只消费自己认识的变量；自带认证的 CLI（claude login 等）不受影响。
      // 2026-11-07：同两层联动自定义 API 地址（*_BASE_URL env），显式
      // opts.baseUrl > settings 配置（与 byok:* 调用链同优先序）。
      env: {
        ...cliByokEnvFromSettings(),
        ...(opts.apiKey && opts.provider ? cliKeyEnv(opts.provider, opts.apiKey) : {}),
        ...(opts.provider
          ? cliBaseUrlEnv(
              opts.provider,
              opts.baseUrl ?? resolveProviderBaseUrl(opts.provider),
            )
          : {}),
      },
    });
  }

  // 3. acp:<target>
  if (exec.startsWith('acp:')) {
    const target = exec.slice(4);
    if (!target) {
      throw new LlmCallError(
        'provider-error',
        `resolveCallable("${exec}"): acp: prefix requires a target id`,
      );
    }
    return new AcpCallable(target, {
      sessionId: opts.sessionId,
      cwd: opts.workspace,
    });
  }

  // 4. mcp:<server>/<tool>
  if (exec.startsWith('mcp:')) {
    const spec = exec.slice(4);
    if (!spec) {
      throw new LlmCallError(
        'provider-error',
        `resolveCallable("${exec}"): mcp: prefix requires <server>/<tool>`,
      );
    }
    return new McpCallable(spec, {
      sessionId: opts.sessionId,
      cwd: opts.workspace,
    });
  }

  // 5. byok:<provider> — fan out to any of the 15 ApiClient instances
  if (exec.startsWith('byok:')) {
    const provider = exec.slice(5);
    if (!provider) {
      throw new LlmCallError(
        'provider-error',
        `resolveCallable("${exec}"): byok: prefix requires a provider id`,
      );
    }
    return new ApiClientCallable(provider, {
      // 2026-11-07 模型链路断点全清：key 同样三级优先（显式 > settings/byok >
      // env，`resolveProviderKey`），与 baseUrl 对齐。此前只收显式 apiKey，
      // 调用方没传时 settings 里明明配了 key 也会走到 client 报
      // "API key not configured"。
      apiKey: opts.apiKey ?? resolveProviderKey(provider),
      // 2026-11-07 Day1 打通修复：显式 baseUrl > settings/byok 里同 provider
      // 的 baseUrl > client 内置默认地址。此前完全不透传，自定义网关/本地
      // 端点一律打偏到默认公网地址（SDK "Request timed out."）。
      // settings 值经 normalizeSdkBaseUrl 归一（与设置页探针同口径）。
      baseUrl: opts.baseUrl ?? resolveProviderBaseUrl(provider),
      model: opts.model,
      maxTokens: opts.maxTokens,
      temperature: opts.temperature,
    });
  }

  throw new LlmCallError(
    'provider-error',
    `resolveCallable: unknown executor "${exec}"`,
  );
}
