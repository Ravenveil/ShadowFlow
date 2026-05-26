/**
 * builtin/index.ts — Default registry for the 9 ConversationRuntime builtins.
 *
 * Exported pieces:
 *   - `builtinTools`                 ToolSpec[]    insertion-ordered list
 *   - `builtinExecutors`             Record<name, BuiltinToolExecutor>
 *   - `builtinDefaultModes`          Record<name, PermissionMode>
 *   - `createBuiltinRegistry()`      factory returning a fresh ToolRegistry
 *                                    seeded with all 9 ToolSpec entries.
 *   - `registerBuiltinExecutors()`   register the 9 executors against Lane 1's
 *                                    module-level executor registry. The
 *                                    workspace + allowedTools context is
 *                                    threaded via AsyncLocalStorage — the
 *                                    runtime owns setting that scope per
 *                                    conversation turn (`runWithBuiltinContext`).
 *
 * Bridge to Lane 1
 * ────────────────
 * Lane 1's `tool-runner.ts` defines a simpler `ToolExecutor` shape:
 *   `{ execute(input: unknown, signal: AbortSignal): Promise<ToolExecResult> }`
 * It has no workspace argument. Our builtin executors NEED a workspace (they
 * sandbox every path against it). We bridge by:
 *
 *   1. Storing the per-turn context (`workspace`, `allowedTools`) in an
 *      AsyncLocalStorage that the ConversationRuntime sets before calling
 *      `ToolRunner.dispatch()`.
 *   2. Registering an adapter shim for each builtin that pulls context from
 *      ALS, then calls the BuiltinToolExecutor with `(input, { workspace,
 *      signal, allowedTools })`.
 *   3. Falling back to a clearly-labelled isError result if ALS is empty —
 *      this is the "Lane 1 forgot to wrap dispatch in runWithBuiltinContext"
 *      diagnostic.
 *
 * Ordering rationale (matches Claude Code's manifest):
 *   read-tier (safe-by-default), then write-tier, then shell_exec last.
 */

import { AsyncLocalStorage } from 'async_hooks';
import type { ToolSpec } from '../../tool-spec';
import { ToolRegistry } from '../../tool-spec';
import type { PermissionMode } from '../../permission-policy';
import type { BuiltinToolExecutor } from './types';

import { readFileTool, readFileExecutor } from './read-file';
import { listDirTool, listDirExecutor } from './list-dir';
import { globFilesTool, globFilesExecutor } from './glob-files';
import { grepTool, grepExecutor } from './grep';
import { webSearchTool, webSearchExecutor } from './web-search';
import { fetchUrlTool, fetchUrlExecutor } from './fetch-url';
import { writeFileTool, writeFileExecutor } from './write-file';
import { editFileTool, editFileExecutor } from './edit-file';
import { shellExecTool, shellExecExecutor } from './shell-exec';

export const builtinTools: ToolSpec[] = [
  readFileTool,
  listDirTool,
  globFilesTool,
  grepTool,
  webSearchTool,
  fetchUrlTool,
  writeFileTool,
  editFileTool,
  shellExecTool,
];

export const builtinExecutors: Record<string, BuiltinToolExecutor> = {
  read_file: readFileExecutor,
  list_dir: listDirExecutor,
  glob_files: globFilesExecutor,
  grep: grepExecutor,
  web_search: webSearchExecutor,
  fetch_url: fetchUrlExecutor,
  write_file: writeFileExecutor,
  edit_file: editFileExecutor,
  shell_exec: shellExecExecutor,
};

/**
 * Canonical defaults. `'prompt'` means tool-runner should hold the call,
 * emit an `event: "tool_permission_prompt"` SSE frame, and only run on
 * explicit user approval. v1 implementation (Lane 1) may downgrade
 * `'prompt'` → deny + notify SSE if interactive approval isn't wired yet.
 */
export const builtinDefaultModes: Record<string, PermissionMode> = {
  read_file: 'allow',
  list_dir: 'allow',
  glob_files: 'allow',
  grep: 'allow',
  web_search: 'allow',
  fetch_url: 'allow',
  write_file: 'prompt',
  edit_file: 'prompt',
  shell_exec: 'deny',
};

/** Fresh ToolRegistry seeded with the canonical builtin order. */
export function createBuiltinRegistry(): ToolRegistry {
  return new ToolRegistry(builtinTools);
}

// ─── Bridge to Lane 1's module-level executor registry ──────────────────────

/**
 * Per-call context that the runtime sets via `runWithBuiltinContext` before
 * dispatching a tool. Pulled out of ALS by each executor shim.
 */
export interface BuiltinExecutorScope {
  workspace: string;
  allowedTools?: ReadonlySet<string>;
}

const _builtinAls = new AsyncLocalStorage<BuiltinExecutorScope>();

/**
 * Wrap a runtime turn so all builtin executors see the right workspace.
 *
 *   await runWithBuiltinContext({ workspace, allowedTools }, () =>
 *     runner.dispatch(toolUse, signal)
 *   );
 *
 * The ConversationRuntime owns this — call it once per `tool_use` block.
 */
export function runWithBuiltinContext<T>(
  scope: BuiltinExecutorScope,
  fn: () => Promise<T> | T,
): Promise<T> | T {
  return _builtinAls.run(scope, fn);
}

/**
 * Register all 9 builtin executors against Lane 1's tool-runner module
 * registry. Idempotent — safe to call multiple times (last write wins per
 * tool name).
 *
 * `registerFn` matches the signature of `tool-runner.ts`'s
 * `registerToolExecutor(name, executor)`. We accept it by injection instead
 * of importing to avoid a hard module dependency in case Lane 1's file path
 * shifts during the merge — the runtime just hands us the function.
 */
export function registerBuiltinExecutors(
  registerFn: (
    name: string,
    executor: { execute(input: unknown, signal: AbortSignal): Promise<{ output: unknown; isError?: boolean; sseEvents?: Array<{ event: string; data: unknown }> }> },
  ) => void,
): void {
  for (const [name, exec] of Object.entries(builtinExecutors)) {
    registerFn(name, {
      async execute(input: unknown, signal: AbortSignal) {
        const scope = _builtinAls.getStore();
        if (!scope) {
          return {
            output: {
              error: `builtin '${name}' invoked outside runWithBuiltinContext scope; ConversationRuntime must wrap each turn`,
            },
            isError: true,
          };
        }
        return exec(input, {
          workspace: scope.workspace,
          signal,
          allowedTools: scope.allowedTools,
        });
      },
    });
  }
}

export type { BuiltinToolExecutor, BuiltinToolContext } from './types';
