/**
 * tool-runner.ts — PR-D Lane 1 dispatcher + permission gate.
 *
 * Sits between ConversationRuntime (which sees the LLM's `tool_use` block)
 * and the actual tool implementations (Lane 2's `lib/tools/builtin/**`).
 * One ToolRunner per skill activation: it owns the per-skill tool registry
 * + permission policy and knows how to:
 *
 *   1. Look up the spec from the registry by name
 *   2. Ask the policy if the call is allowed (allow / deny / prompt)
 *   3. Invoke the executor, catch throws, normalize errors
 *   4. Pack everything into a `ToolDispatchResult` the runtime can stamp
 *      into a `tool_result` ContentBlock + (optionally) emit as SSE.
 *
 * Why this lives in `lib/` and not under `lib/tools/`
 * ───────────────────────────────────────────────────
 * Lane 2 owns `lib/tools/builtin/**` (8 new tools). Putting the dispatcher
 * here keeps lane file ownership clean: Lane 1 owns the *gate*, Lane 2
 * owns the *workers*. The ToolRunner consumes a registry by reference and
 * never imports a specific builtin tool, so the two lanes can land in
 * either order.
 *
 * Tool executor contract
 * ──────────────────────
 * The runner expects each tool spec name to be backed by an executor of
 * shape `{ execute(input, signal): Promise<{ output: unknown; isError?: boolean; sseEvents?: SseEvent[] }> }`.
 * Lane 2's builtin tools register themselves with that shape via
 * `registerToolExecutor(name, executor)`. The runner is intentionally
 * tolerant of "name in registry but no executor registered" (returns
 * is_error with a clear message) so partial Lane 2 landings don't crash
 * the runtime.
 */

import type { ToolRegistry, ToolSpec } from './tool-spec';
import type { PermissionPolicyV2, PermissionOutcomeV2 } from './permission-policy-v2';

/** A side-effect SSE the tool wants emitted by the surrounding runtime. */
export interface ToolSseEvent {
  event: string;
  data: unknown;
}

/** One tool's runtime result. Plain data — runtime decides what to do. */
export interface ToolExecResult {
  /** Tool output. Strings pass through; objects get JSON.stringify'd by caller. */
  output: unknown;
  /** Whether to set the resulting `tool_result.is_error` flag. */
  isError?: boolean;
  /** Side-channel SSE the runtime will yield in order before the tool_result. */
  sseEvents?: ToolSseEvent[];
}

/** Dispatch result — strictly more information than ToolExecResult. */
export interface ToolDispatchResult extends ToolExecResult {
  /**
   * Permission decision applied. Lets the runtime emit `permission_check`
   * SSE when the mode was 'prompt' or 'deny', without re-asking the policy.
   */
  permission: PermissionOutcomeV2;
}

/**
 * Tool executor contract. The runner ONLY calls `execute(input, signal)`.
 * Implementations may inspect / honour `signal` for long-running work; the
 * runner does NOT enforce a timeout — that's a future enhancement once a
 * concrete tool needs it.
 */
export interface ToolExecutor {
  execute(input: unknown, signal: AbortSignal): Promise<ToolExecResult>;
}

/**
 * Module-level executor registry. Lane 2 builtin tools call
 * `registerToolExecutor` at boot to plug themselves in. We deliberately use
 * a process-singleton (not an injected dependency) because tool executors
 * are typically stateless modules and a single LLM session can spin up
 * multiple ToolRunner instances — wiring them all by hand is busywork.
 */
const _executors = new Map<string, ToolExecutor>();

export function registerToolExecutor(name: string, executor: ToolExecutor): void {
  _executors.set(name, executor);
}

export function getToolExecutor(name: string): ToolExecutor | undefined {
  return _executors.get(name);
}

/** Test helper — clears the registry between runs. */
export function _resetToolExecutorsForTests(): void {
  _executors.clear();
}

/**
 * ToolRunner — one instance per skill activation. Holds the per-skill
 * registry (which whitelist of tools the LLM sees) and the per-skill
 * permission policy. dispatch() is the only public method.
 */
export class ToolRunner {
  constructor(
    private readonly registry: ToolRegistry,
    private readonly policy: PermissionPolicyV2,
  ) {}

  /** Tool specs to advertise to the LLM on each turn. */
  toolSpecs(): ToolSpec[] {
    return this.registry.list();
  }

  /**
   * Dispatch one tool_use. Always resolves — never throws. Failure modes:
   *
   *   - Tool not in registry        → isError, output explains the gap
   *   - Permission denied / prompt  → isError, output carries reason +
   *                                   permission.mode so runtime can emit
   *                                   `permission_check` SSE
   *   - Executor not registered     → isError (Lane 2 hand-off race)
   *   - Executor throws             → isError, output explains the throw
   *
   * Returns the dispatch result; runtime's job to stamp `tool_use_id` +
   * `tool_name` into the resulting ContentBlock.
   */
  async dispatch(
    toolUse: { name: string; input: unknown },
    signal: AbortSignal,
  ): Promise<ToolDispatchResult> {
    const { name, input } = toolUse;

    // Registry check first — the LLM can hallucinate names; refuse early.
    const spec = this.registry.get(name);
    if (!spec) {
      const perm = this.policy.authorize(name); // for the record, even on miss
      return {
        output: { error: `unknown tool '${name}' (not in this skill's registry)` },
        isError: true,
        permission: perm,
      };
    }

    // Permission gate. Synchronous: matches v1 semantics, no async prompter
    // round-trip in the MVP. Lane 2's `'prompt'` mode produces a non-allow
    // outcome that the runtime layer surfaces as `permission_check` SSE.
    const permission = this.policy.authorize(name);
    if (!permission.allow) {
      // Build a structured error payload that includes the mode so the
      // runtime can decide whether to also emit a `permission_check` SSE
      // (mode === 'prompt') vs a plain deny tool_result (mode === 'deny').
      // Compare structurally (string-typed) so this compiles even before
      // Lane 2 widens `PermissionMode` to include the `'prompt'` literal.
      // Once the union widens, TS narrowing here remains correct.
      const isPromptMode = (permission.mode as string) === 'prompt';
      const sseEvents: ToolSseEvent[] = isPromptMode
        ? [
            {
              event: 'permission_check',
              data: {
                tool_name: name,
                reason: permission.reason,
                // v1 behaviour: prompt acts as deny; this flag lets a
                // future UI distinguish "denied immediately" vs
                // "deferred for approval".
                decision: 'deny',
              },
            },
          ]
        : [];
      return {
        output: { error: permission.reason, permission_mode: permission.mode },
        isError: true,
        permission,
        sseEvents,
      };
    }

    // Look up the executor. We keep registry vs. executor separate because
    // the LLM-side advertise (specs) and the run-side execute (executors)
    // can be registered by different layers (skill compiler vs. Lane 2).
    const executor = getToolExecutor(name);
    if (!executor) {
      return {
        output: {
          error: `tool '${name}' has a spec but no executor is registered (Lane 2 hand-off pending)`,
        },
        isError: true,
        permission,
      };
    }

    // Honour the abort signal: tool will see it and can short-circuit.
    if (signal.aborted) {
      return {
        output: { error: `tool '${name}' aborted before execution` },
        isError: true,
        permission,
      };
    }

    // Run. Catch all throws so the LLM can recover via tool_result instead
    // of crashing the conversation.
    try {
      const result = await executor.execute(input, signal);
      return { ...result, permission };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        output: { error: `tool '${name}' threw: ${message}` },
        isError: true,
        permission,
      };
    }
  }
}
