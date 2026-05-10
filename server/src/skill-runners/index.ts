/**
 * skill-runners/index.ts — Executor dispatcher (Story 15.19 v2)
 *
 * Routing rules (executor string → runner):
 *
 *   undefined / 'anthropic-direct'  → runAnthropicDirect()    (Story 15.2 path)
 *   'cli:auto'                       → first detected & env-ready CLI;
 *                                      falls back to anthropic-direct if none.
 *   'cli:<id>'                       → runCliSpawn(id)
 *                                      (id must be in cli-registry KNOWN_CLIS)
 *                                      If installed:false, emits CLI_NOT_INSTALLED
 *                                      and DOES NOT silently downgrade.
 *   'acp:<id>'                       → runAcpExecutor(target=<id>)         (Story 15.23)
 *                                      Errors: ACP_UNREACHABLE / ACP_TIMEOUT /
 *                                      EXECUTOR_NOT_INSTALLED — never falls back.
 *   'mcp:<server>/<tool>'            → runMcpExecutor(spec)                (Story 15.23)
 *                                      Errors: MCP_SERVER_NOT_FOUND / MCP_TOOL_NOT_FOUND /
 *                                      MCP_TOOL_ERROR / MCP_INVALID_SPEC.
 *   anything else                    → EXECUTOR_UNKNOWN error.
 */

import { detectAll } from '../cli-detector';
import { runAnthropicDirect } from './anthropic';
import { runCliSpawn } from './cli';
import { runAcpExecutor } from './acp';
import { runMcpExecutor } from './mcp';
import type { RunnerChunk, RunnerInput, SkillForDispatch } from './types';

export type { RunnerChunk, RunnerInput, SkillForDispatch } from './types';

export async function* dispatchSkillRunner(
  executor: string | undefined,
  input: RunnerInput,
  _skill?: SkillForDispatch,
): AsyncGenerator<RunnerChunk> {
  const exec = executor && executor.trim().length > 0 ? executor.trim() : 'anthropic-direct';

  // 1. Default / explicit anthropic-direct.
  if (exec === 'anthropic-direct') {
    yield* runAnthropicDirect(input);
    return;
  }

  // 2. cli:auto — pick first detected + env-ready CLI; fallback to anthropic-direct.
  if (exec === 'cli:auto') {
    const snapshot = await detectAll(false);
    const pick = snapshot.items.find((i) => i.installed && i.env_set);
    if (!pick) {
      console.log('[dispatcher] cli:auto — no CLI detected & env-ready, falling back to anthropic-direct');
      yield* runAnthropicDirect(input);
      return;
    }
    console.log(`[dispatcher] cli:auto picked ${pick.id}`);
    yield* runCliSpawn(input, pick.id);
    return;
  }

  // 3. cli:<id> — explicit pin. NEVER silently fallback.
  if (exec.startsWith('cli:')) {
    const id = exec.slice(4);
    const snapshot = await detectAll(false);
    const found = snapshot.items.find((i) => i.id === id);

    if (!found) {
      yield {
        event: 'error',
        data: {
          code: 'CLI_NOT_REGISTERED',
          cli_id: id,
          message: `cli "${id}" 不在已知列表内（KNOWN_CLIS）。`,
        },
      };
      return;
    }
    if (!found.installed) {
      yield {
        event: 'error',
        data: {
          code: 'CLI_NOT_INSTALLED',
          cli_id: id,
          message: `请安装 ${id}: ${found.install_cmd}`,
          install_cmd: found.install_cmd,
        },
      };
      return;
    }
    yield* runCliSpawn(input, id);
    return;
  }

  // 4. acp:<target> — Story 15.23. Dispatcher only emits the error event when
  //    the target lookup itself is malformed; the runner is responsible for
  //    EXECUTOR_NOT_INSTALLED / ACP_UNREACHABLE on a per-call basis.
  if (exec.startsWith('acp:')) {
    const target = exec.slice(4);
    if (!target) {
      yield {
        event: 'error',
        data: { code: 'EXECUTOR_UNKNOWN', executor: exec, message: 'acp: prefix requires a target id' },
      };
      return;
    }
    yield* runAcpExecutor(input, target);
    return;
  }

  // 5. mcp:<server>/<tool> — Story 15.23.
  if (exec.startsWith('mcp:')) {
    const spec = exec.slice(4);
    if (!spec) {
      yield {
        event: 'error',
        data: { code: 'EXECUTOR_UNKNOWN', executor: exec, message: 'mcp: prefix requires <server>/<tool>' },
      };
      return;
    }
    yield* runMcpExecutor(input, spec);
    return;
  }

  // 6. Unknown.
  yield {
    event: 'error',
    data: {
      code: 'EXECUTOR_UNKNOWN',
      executor: exec,
      message: `未知 executor: "${exec}"`,
    },
  };
}
