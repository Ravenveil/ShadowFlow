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
 * Concrete `LlmCallable` implementations (ApiClientCallable / CliCallable /
 * AcpCallable / McpCallable) are Lane 2 work; this file only defines the
 * factory signature and executor-string typing so Lane 1 (workflow/) and Lane 3
 * (assembler refactor) can compile against the contract in parallel.
 */

import type { LlmCallable } from './LlmCallable';
import { LlmCallError } from '../workflow/types';

/**
 * Executor string grammar.
 *
 *   - `anthropic-direct`     → BYOK Anthropic SDK (default fallback)
 *   - `cli:<name>`           → spawn a CLI binary (`cli:claude`, `cli:codex`)
 *   - `acp:<name>`           → ACP-protocol agent (`acp:bmad`)
 *   - `mcp:<name>`           → MCP-protocol agent
 *   - `byok:<provider>`      → BYOK via openai-compat (`byok:zhipu`, `byok:openai`,
 *                              `byok:google`, ...). Provider resolution lives in
 *                              `transport/api-clients/` (moved from `llm-providers/`).
 *
 * Anything else throws `LlmCallError('executor-not-found')` at resolve time.
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
}

/**
 * Resolve an executor string into a concrete `LlmCallable` instance.
 *
 * Lane 2 will replace this throw with a switch over the executor grammar that
 * constructs `ApiClientCallable` / `CliCallable` / `AcpCallable` / `McpCallable`.
 *
 * Lane 1 (workflow/) and Lane 3 (assembler refactor) import this signature only
 * — they don't depend on the implementations existing yet.
 */
export function resolveCallable(
  executor: ExecutorString,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  opts: ResolveOptions,
): LlmCallable {
  throw new LlmCallError(
    'provider-error',
    `resolveCallable(${executor}): not yet implemented — Lane 2 work`,
  );
}
