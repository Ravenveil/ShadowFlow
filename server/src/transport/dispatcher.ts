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
  /** BYOK key for `byok:*` / `anthropic-direct`. Ignored for CLI/ACP/MCP. */
  apiKey?: string;
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
      apiKey: opts.apiKey,
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
