/**
 * skill-runners/cli.ts — Spawn a local AI CLI as a Skill executor (Story 15.19 v2)
 *
 * Responsibilities:
 *  - spawn(<binary>, [...extra_args]) with shell:false, stdio piped on all 3
 *  - write the full prompt to stdin then end (avoids argv length limits on
 *    Windows ~8KB / Linux 128KB)
 *  - hook AbortSignal → SIGTERM → 5 s grace → SIGKILL
 *  - delegate stdout parsing to `parsers/cli-streams/<format>`
 *  - capture stderr tail and emit a single CLI_EXIT_NONZERO error event on
 *    non-zero exit (unless aborted, which is the user's intent)
 */

import { spawn } from 'node:child_process';
import fs from 'fs';
import path from 'path';
import { findCli } from '../cli-registry';
import { dispatchParser, type CliStreamArtifactCb } from '../parsers/cli-streams';
import type { SseEvent } from '../parser';
import type { RunnerInput } from './types';

/**
 * Run a CLI binary as a skill executor.
 *
 * @param input    runner input (system_prompt + goal + session_id + cwd + signal)
 * @param cliId    registry id, e.g. 'claude' / 'codex'
 */
export async function* runCliSpawn(
  input: RunnerInput,
  cliId: string,
): AsyncGenerator<SseEvent> {
  const desc = findCli(cliId);
  if (!desc) {
    yield {
      event: 'error',
      data: {
        code: 'CLI_UNKNOWN',
        cli_id: cliId,
        message: `unknown cli id: ${cliId}`,
      },
    };
    return;
  }

  // Ensure artifact dir exists (parser callback writes here).
  try {
    fs.mkdirSync(input.cwd, { recursive: true });
  } catch (err) {
    yield {
      event: 'error',
      data: {
        code: 'PROJECT_DIR_FAILED',
        message: `无法创建产物目录: ${(err as Error).message}`,
      },
    };
    return;
  }

  const artifactCb: CliStreamArtifactCb = (filename, content, _type) => {
    const safeName = path.basename(filename);
    const filePath = path.join(input.cwd, safeName);
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`[cli:${cliId}] artifact written: ${filePath} (${content.length} bytes)`);
  };

  // Compose the full prompt: system + user goal. Each CLI handles this
  // differently; for now we concatenate with a separator that 99% of LLM
  // CLIs treat sensibly (the prompt itself is what ShadowFlow's skill author
  // designed — embedded `<sf:*>` tags drive the parser).
  const fullPrompt = input.system_prompt
    ? `${input.system_prompt}\n\n---\n\nUser goal: ${input.prompt}\n`
    : input.prompt;

  console.log(
    `[cli:${cliId}] spawn binary="${desc.binary}" args=${JSON.stringify(desc.extra_args ?? [])}` +
      ` cwd="${input.cwd}" prompt_len=${fullPrompt.length}`,
  );

  let child: ReturnType<typeof spawn>;
  try {
    child = spawn(desc.binary, desc.extra_args ?? [], {
      cwd: input.cwd,
      env: { ...process.env, ...(input.env ?? {}) },
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
      windowsHide: true,
    });
  } catch (err) {
    yield {
      event: 'error',
      data: {
        code: 'CLI_SPAWN_FAILED',
        cli_id: cliId,
        message: `spawn failed: ${(err as Error).message}`,
      },
    };
    return;
  }

  // Send prompt via stdin (avoid argv length limits).
  if (child.stdin) {
    child.stdin.on('error', () => {
      // Some CLIs close stdin early; ignore EPIPE.
    });
    try {
      child.stdin.end(fullPrompt);
    } catch {
      // ignore — child may have died already
    }
  }

  // SIGTERM → 5s → SIGKILL on abort.
  let killTimer: NodeJS.Timeout | null = null;
  const onAbort = () => {
    try {
      child.kill('SIGTERM');
    } catch {
      /* ignore */
    }
    killTimer = setTimeout(() => {
      if (!child.killed) {
        try {
          child.kill('SIGKILL');
        } catch {
          /* ignore */
        }
      }
    }, 5000);
  };
  if (input.signal) {
    if (input.signal.aborted) {
      onAbort();
    } else {
      input.signal.addEventListener('abort', onAbort, { once: true });
    }
  }

  // Capture stderr tail (last 2KB) for error reporting.
  let stderrTail = '';
  child.stderr?.on('data', (b) => {
    stderrTail = (stderrTail + b.toString()).slice(-2000);
  });

  // Track exit so we can emit CLI_EXIT_NONZERO after parser drains.
  const exitPromise = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
    (resolve) => {
      child.on('close', (code, sig) => resolve({ code, signal: sig }));
      child.on('error', () => resolve({ code: -1, signal: null }));
    },
  );

  try {
    if (!child.stdout) {
      yield {
        event: 'error',
        data: { code: 'CLI_NO_STDOUT', cli_id: cliId, message: 'child has no stdout' },
      };
      return;
    }
    yield* dispatchParser(desc.stream_format, child.stdout, input.session_id, artifactCb);
  } finally {
    if (killTimer) clearTimeout(killTimer);
    if (input.signal) input.signal.removeEventListener('abort', onAbort);
  }

  const { code } = await exitPromise;
  if (code !== 0 && code !== null && !input.signal?.aborted) {
    yield {
      event: 'error',
      data: {
        code: 'CLI_EXIT_NONZERO',
        cli_id: cliId,
        exit_code: code,
        message: `${cliId} 退出码 ${code}`,
        stderr_tail: stderrTail.slice(-500),
      },
    };
  }
}
