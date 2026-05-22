/**
 * spawner-bridge.ts — Translation helpers shared by CliCallable / AcpCallable
 * / McpCallable.
 *
 * The legacy spawner runners (`transport/spawners/{cli,acp,mcp}.ts`) yield
 * `SseEvent = { event, data }` shapes — the same wire-format the existing
 * `routes/run-sessions.ts` SSE handler already speaks. The Phase 2 Transport
 * contract is stricter: `LlmCallable.turn()` yields `TurnChunk`, a
 * discriminated union the orchestrator/scheduler can `switch` on without
 * parsing the SSE event-name string.
 *
 * This file does NOT attempt to invert parser.ts. Instead it forwards each
 * SSE event verbatim as a single `text-delta` chunk whose `value` is the
 * canonical SSE wire line ("event: ...\ndata: <json>\n\n"). The scheduler /
 * Assembler (Lane 3) is responsible for re-parsing where it needs to (the
 * existing front-end already does this on `useRunSession`'s side).
 *
 * The two exceptions:
 *   - `event: 'error'` → mapped to a typed `{type: 'error', error}` chunk so
 *     the retry layer (`workflow/retry.ts`) can classify by `LlmCallErrorKind`.
 *   - End-of-stream → after the spawner generator returns, the callable
 *     yields a single `{type: 'done'}` chunk. The spawner never emits one
 *     itself (its consumer relied on iterator return) so we synthesise it.
 *
 * This is intentionally lossy on the chunk-taxonomy axis but lossless on the
 * SSE wire — Lane 3 can choose to either teach the scheduler to forward
 * text-delta chunks directly to SSE, or to add a finer-grained translation
 * layer later. Either path is forward-compatible with this bridge.
 */

import type { SseEvent } from '../parser';
import { LlmCallError, type LlmCallErrorKind, type TurnChunk } from '../workflow/types';

/**
 * Encode an SSE event as the on-the-wire string the front-end already
 * understands. Mirrors what `routes/run-sessions.ts` writes today.
 */
function encodeSseLine(ev: SseEvent): string {
  const dataStr =
    typeof ev.data === 'string' ? ev.data : JSON.stringify(ev.data);
  return `event: ${ev.event}\ndata: ${dataStr}\n\n`;
}

/**
 * Best-effort mapping from a spawner error event's `code` field to one of
 * `LlmCallErrorKind`. Unknown codes degrade to `provider-error` so the front-
 * end still gets a readable message.
 */
function spawnerErrorKind(code: unknown): LlmCallErrorKind {
  if (typeof code !== 'string') return 'provider-error';
  if (code === 'CLI_NOT_INSTALLED' || code === 'CLI_NOT_REGISTERED') return 'provider-error';
  if (code === 'CLI_SPAWN_FAILED') return 'cli-crash';
  if (code === 'CLI_EXIT_NONZERO') return 'cli-crash';
  if (code === 'EXECUTOR_UNKNOWN') return 'provider-error';
  if (code === 'ACP_UNREACHABLE' || code === 'EXECUTOR_NOT_INSTALLED') return 'provider-error';
  if (code === 'ACP_TIMEOUT' || code === 'MCP_TIMEOUT') return 'timeout';
  if (code === 'MCP_SERVER_NOT_FOUND' || code === 'MCP_TOOL_NOT_FOUND') return 'provider-error';
  if (code === 'PROVIDER_ERROR' || code === 'NO_API_KEY') return 'auth';
  if (code === 'RATE_LIMITED') return 'rate-limit';
  if (code === 'AUTH_FAILED') return 'auth';
  if (code === 'NETWORK_ERROR') return 'network';
  return 'provider-error';
}

/**
 * Translate one SSE event into a TurnChunk. Error events become typed error
 * chunks (CL3/E3); everything else is forwarded as the SSE wire line in a
 * text-delta payload.
 */
export function sseEventToChunk(ev: SseEvent): TurnChunk {
  if (ev.event === 'error') {
    const data = (ev.data ?? {}) as { code?: unknown; message?: unknown };
    const code = data.code;
    const message = typeof data.message === 'string' ? data.message : 'spawner error';
    return {
      type: 'error',
      error: new LlmCallError(spawnerErrorKind(code), message, { cause: ev.data }),
    };
  }
  return { type: 'text-delta', value: encodeSseLine(ev) };
}

/**
 * Drain a spawner SSE generator and re-yield as TurnChunks. Honours
 * `signal.aborted` (stops forwarding on cancel; the spawner is expected to
 * have its own signal-driven cleanup via the `RunnerInput.signal` field).
 *
 * Synthesises a single trailing `{type: 'done'}` chunk after the spawner
 * generator finishes normally. On error chunks the bridge does NOT inject
 * `done` — the scheduler treats an error chunk as terminal.
 */
export async function* bridgeSpawnerStream(
  source: AsyncGenerator<SseEvent> | AsyncIterable<SseEvent>,
  signal: AbortSignal,
): AsyncGenerator<TurnChunk> {
  let sawError = false;
  for await (const ev of source) {
    if (signal.aborted) return;
    const chunk = sseEventToChunk(ev);
    if (chunk.type === 'error') sawError = true;
    yield chunk;
  }
  if (!sawError) yield { type: 'done' };
}
