/**
 * claude-code-cli-api-client.ts — ApiClient (S5) implementation backed by the
 * **Claude Code CLI** (`claude -p ... --output-format stream-json --verbose`).
 *
 * S14.2 (skill-team-conversion-design-v1.md §5 / Story brief 2026-05-21) —
 * companion to AnthropicApiClient / OpenAiCompatApiClient / GoogleApiClient.
 * With this in place, a user who picked executor `cli:claude` in BYOK gets the
 * same v2 multi-turn ConversationRuntime treatment (tool_use loop + usage
 * accounting + per-turn streaming) as the direct-API providers, by shelling
 * out to the official Anthropic Claude Code CLI binary they already auth'd
 * via `claude login`.
 *
 * Why a separate ApiClient (vs. the existing `parseClaudeStreamJson` runner)
 * ────────────────────────────────────────────────────────────────────────────
 * The legacy CLI path in `skill-runners/cli.ts` is single-turn: assembler →
 * spawn → text deltas → parseAndExtract → SSE. That works for the
 * `<sf:thinking>/<sf:step>` text-protocol skills but cannot drive the v2
 * loop, which needs:
 *
 *   (a) raw `tool_use` events (id + name + accumulated input JSON) surfaced
 *       per turn so PermissionPolicy + ToolExecutor can fire;
 *   (b) per-turn `message_stop` with stop_reason so the runtime decides whether
 *       to loop (tool_use) or break (end_turn);
 *   (c) usage accounting per turn so the rolling totalUsage stays accurate.
 *
 * The Claude Code CLI in `stream-json --verbose` mode emits exactly the same
 * events as the Anthropic Messages SSE protocol (it's a thin wrapper around
 * the Anthropic SDK), just framed as NDJSON instead of SSE. So we can REUSE
 * the same event-translation logic from anthropic-api-client.ts — just swap
 * the input source from "SDK iterator" to "child stdout line stream".
 *
 * CLI envelope (verbose mode, see open-design/apps/daemon/src/claude-stream.ts
 * for canonical reference + claude-stream-json.ts in this repo for an
 * existing flat-vs-nested parser):
 *
 *   {"type":"system","subtype":"init", ...}
 *   {"type":"stream_event","event":{"type":"message_start","message":{"usage":{...}}}}
 *   {"type":"stream_event","event":{"type":"content_block_start","index":0,"content_block":{"type":"text"}}}
 *   {"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"..."}}}
 *   {"type":"stream_event","event":{"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"...","name":"..."}}}
 *   {"type":"stream_event","event":{"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"..."}}}
 *   {"type":"stream_event","event":{"type":"content_block_stop","index":1}}
 *   {"type":"stream_event","event":{"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{...}}}
 *   {"type":"stream_event","event":{"type":"message_stop"}}
 *   {"type":"assistant","message":{...}}   // final summary, optional
 *   {"type":"result","stop_reason":"end_turn","usage":{...}}   // terminator
 *
 * Some flat (non-verbose / older builds) variants are also accepted — see
 * `extractInnerEvent` below.
 *
 * Auth: the CLI uses its own credential store (`~/.config/claude/` or similar
 * under Windows %APPDATA%). The BYOK key in opts.apiKey is IGNORED — we honor
 * it only as a fallback ANTHROPIC_API_KEY env var for the child process, since
 * the CLI accepts that env when no `claude login` session exists.
 *
 * Tools: the CLI doesn't currently expose a per-spawn `--tools` flag to inject
 * arbitrary custom tools — its tool set is fixed (read/write/bash/etc.) and
 * unrelated to ShadowFlow's SkillAnchor tools. We therefore DO NOT forward
 * `args.tools` into the spawn command line; instead we serialize them into
 * the system prompt as a hint. The runtime will still receive any `tool_use`
 * events the CLI happens to emit (verbose mode reports the CLI's own tools)
 * but the SkillAnchor executor will return is_error for unknown names. In
 * practice for team-backed skills the LLM is expected to drive tool_use via
 * the same `<sf:*>` text protocol that already works in legacy CLI runs.
 *
 * ALWAYS / NEVER rules
 *   - ALWAYS use Node built-in `child_process.spawn` — no execa / cross-spawn.
 *   - ALWAYS forward `args.signal` → `child.kill('SIGTERM')` (Windows alias).
 *   - ALWAYS buffer stdout chunks until `\n` before JSON.parse — partial lines
 *     mid-chunk are normal.
 *   - ALWAYS console.warn ONCE per stream when JSON.parse fails on a line
 *     (proxy banners, log output); never throw on it.
 *   - NEVER hardcode the binary path — accept `opts.binPath` (default 'claude').
 *   - NEVER block the loop on stderr — stderr is captured and surfaced ONLY
 *     on non-zero exit.
 */

import {
  spawn as nodeSpawn,
  type ChildProcessWithoutNullStreams,
  type SpawnOptionsWithoutStdio,
} from 'node:child_process';
import type { ApiClient, AssistantEvent } from '../conversation-runtime';
import type { ConversationMessage, TokenUsage } from '../conversation-types';
import type { ToolSpec } from '../tool-spec';

/**
 * SpawnFn — narrow contract over child_process.spawn so the client can be
 * dependency-injected with a fake subprocess factory in tests. Production
 * callers omit this and we default to the real Node spawn.
 *
 * The return must satisfy the subset of ChildProcessWithoutNullStreams the
 * client uses: { stdout, stderr, stdin, kill, on('exit'|'error'), killed }.
 */
export type SpawnFn = (
  command: string,
  args: readonly string[],
  options: SpawnOptionsWithoutStdio,
) => ChildProcessWithoutNullStreams;

export interface ClaudeCodeCliApiClientOptions {
  /** Path or command for the claude-code binary. Default: 'claude' (resolved via PATH). */
  binPath?: string;
  /** Optional model id passed via `--model`. */
  model?: string;
  /** Per-turn output cap (best-effort — the CLI doesn't always honor it; kept for parity). */
  max_tokens?: number;
  /** Working directory for the child process. */
  cwd?: string;
  /**
   * BYOK fallback key. Set as `ANTHROPIC_API_KEY` env on the child when the
   * user has not run `claude login`. Default: inherit from parent env.
   */
  apiKey?: string;
  /**
   * Override extra args. Defaults to the verified spawn set used in
   * skill-runners/cli.ts (`-p`, `--output-format stream-json`, `--verbose`,
   * `--permission-mode bypassPermissions`). Override only for testing.
   */
  extraArgs?: string[];
  /**
   * Inject a spawn function (tests only — defaults to `child_process.spawn`).
   * The injected function must satisfy SpawnFn. Production code should leave
   * this undefined.
   */
  spawnFn?: SpawnFn;
}

// ─── NDJSON event shape ────────────────────────────────────────────────────

interface ContentBlockShape {
  type?: string;
  id?: string;
  name?: string;
}

interface DeltaShape {
  type?: string;            // 'text_delta' | 'input_json_delta' | ...
  text?: string;
  partial_json?: string;
  stop_reason?: string;
}

interface InnerEvent {
  type?: string;            // 'message_start' | 'content_block_start' | 'content_block_delta' | 'content_block_stop' | 'message_delta' | 'message_stop'
  index?: number;
  content_block?: ContentBlockShape;
  delta?: DeltaShape;
  message?: { usage?: unknown; stop_reason?: unknown };
  usage?: unknown;
}

interface OuterEvent extends InnerEvent {
  /** Verbose-mode wrapper: event nests under `event`. */
  event?: InnerEvent;
  /** 'result' terminator carries final stop_reason + usage at the top level. */
  stop_reason?: string;
  /** 'system' has subtype 'init'/'status' — ignored here. */
  subtype?: string;
}

/**
 * Resolve nested or flat envelope to a single InnerEvent. Returns the original
 * if the outer object already looks like an inner event (`type` ∈ known set
 * AND there's no `.event` field).
 */
function extractInnerEvent(evt: OuterEvent): InnerEvent | null {
  if (evt.type === 'stream_event' && evt.event && typeof evt.event === 'object') {
    return evt.event;
  }
  // Flat (legacy) variant — return as-is if it carries a known inner-event type.
  const innerTypes = new Set([
    'message_start',
    'content_block_start',
    'content_block_delta',
    'content_block_stop',
    'message_delta',
    'message_stop',
  ]);
  if (typeof evt.type === 'string' && innerTypes.has(evt.type)) return evt;
  return null;
}

/**
 * Same usage extractor as anthropic-api-client.ts — Anthropic's tuple of
 * input/output/cache_creation/cache_read tokens.
 */
function extractUsage(raw: unknown): TokenUsage | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const u = raw as Record<string, unknown>;
  const out: TokenUsage = {};
  if (typeof u.input_tokens === 'number') out.input_tokens = u.input_tokens;
  if (typeof u.output_tokens === 'number') out.output_tokens = u.output_tokens;
  if (typeof u.cache_creation_input_tokens === 'number')
    out.cache_creation_input_tokens = u.cache_creation_input_tokens;
  if (typeof u.cache_read_input_tokens === 'number')
    out.cache_read_input_tokens = u.cache_read_input_tokens;
  return Object.keys(out).length > 0 ? out : undefined;
}

// ─── Prompt serialization ─────────────────────────────────────────────────

/**
 * Serialize the runtime's full ConversationMessage[] into a single text prompt
 * the CLI's `-p` flag accepts. The CLI is one-shot per spawn — it doesn't take
 * a chat history flag — so we encode role turns as labeled sections. The LLM
 * sees identical context to what the API-backed clients send via the
 * `messages` array.
 *
 * Tool_use / tool_result blocks are serialized as JSON-tagged segments so the
 * model can read prior tool calls + their outputs and decide whether to keep
 * looping.
 */
function serializePrompt(messages: ConversationMessage[], tools: ToolSpec[]): string {
  const out: string[] = [];
  if (tools.length > 0) {
    out.push('## Available tools');
    for (const t of tools) {
      out.push(`- ${t.name}: ${t.description}`);
    }
    out.push('');
  }
  for (const m of messages) {
    const label = m.role.toUpperCase();
    out.push(`## ${label}`);
    for (const b of m.blocks) {
      if (b.kind === 'text') {
        out.push(b.text);
      } else if (b.kind === 'tool_use') {
        const inputStr = typeof b.input === 'string' ? b.input : JSON.stringify(b.input ?? {});
        out.push(`<tool_use name="${b.name}" id="${b.id}">\n${inputStr}\n</tool_use>`);
      } else if (b.kind === 'tool_result') {
        out.push(
          `<tool_result tool_use_id="${b.tool_use_id}" name="${b.tool_name}" is_error="${b.is_error}">\n${b.output}\n</tool_result>`,
        );
      }
    }
    out.push('');
  }
  return out.join('\n');
}

// ─── Default spawn args (mirror cli-registry.ts 'claude' entry) ───────────

/**
 * Verified spawn args from `skill-runners/cli.ts` / cli-registry.ts:
 *  - `-p` short for --print → non-interactive
 *  - `--output-format stream-json` → NDJSON to stdout
 *  - `--verbose` → enables per-token deltas (without this, only an end-of-turn
 *    summary lands on stdout and the runtime appears hung)
 *  - `--permission-mode bypassPermissions` → CLI won't pause for Y/N prompts
 */
const DEFAULT_EXTRA_ARGS = [
  '-p',
  '--output-format',
  'stream-json',
  '--verbose',
  '--permission-mode',
  'bypassPermissions',
];

// ─── Client ───────────────────────────────────────────────────────────────

export class ClaudeCodeCliApiClient implements ApiClient {
  constructor(private readonly opts: ClaudeCodeCliApiClientOptions = {}) {}

  /**
   * Stream one LLM turn by spawning the Claude Code CLI as a child process,
   * piping the serialized prompt into stdin, and translating its NDJSON
   * stdout into AssistantEvent.
   *
   * Translation contract (NDJSON event → AssistantEvent), mirrors
   * anthropic-api-client.ts:
   *   content_block_start tool_use                   → buffer name+id
   *   content_block_delta input_json_delta           → accumulate args
   *   content_block_stop tool_use                    → emit 'tool_use'
   *   content_block_delta text_delta                 → emit 'text_delta'
   *   message_start.message.usage                    → emit 'usage'
   *   message_delta.usage                            → emit 'usage'
   *   message_delta.delta.stop_reason                → cache → emit on message_stop
   *   message_stop                                   → emit 'message_stop'
   *   result (terminator, flat)                      → emit 'message_stop' if not seen yet
   *
   * Errors / signal:
   *   - Spawn ENOENT (binary not installed) → throw with install hint
   *   - Non-zero exit code → throw with stderr text
   *   - args.signal.aborted → SIGTERM the child; generator returns
   *   - JSON.parse failure on a line → console.warn ONCE, skip line
   */
  async *stream(args: {
    system_prompt: string;
    messages: ConversationMessage[];
    tools: ToolSpec[];
    signal: AbortSignal;
  }): AsyncIterable<AssistantEvent> {
    const binPath = this.opts.binPath ?? 'claude';
    const extraArgs = this.opts.extraArgs ?? DEFAULT_EXTRA_ARGS;
    const spawnArgs = [...extraArgs];
    if (this.opts.model && this.opts.model.length > 0) {
      spawnArgs.push('--model', this.opts.model);
    }
    // `--append-system` is supported on recent CLI builds; if absent the CLI
    // silently ignores unknown args, so this is a no-op on legacy versions.
    // The system prompt is also stitched into the prompt body as a fallback.
    if (args.system_prompt.length > 0) {
      spawnArgs.push('--append-system', args.system_prompt);
    }

    const env = { ...process.env };
    if (this.opts.apiKey && this.opts.apiKey.length > 0 && !env.ANTHROPIC_API_KEY) {
      env.ANTHROPIC_API_KEY = this.opts.apiKey;
    }

    const spawnImpl: SpawnFn = this.opts.spawnFn ?? nodeSpawn;
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawnImpl(binPath, spawnArgs, {
        cwd: this.opts.cwd,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (err) {
      throw new Error(
        `claude-code CLI spawn failed (${binPath}): ${err instanceof Error ? err.message : String(err)}. Install: npm i -g @anthropic-ai/claude-cli, then run \`claude login\`.`,
      );
    }

    // Capture stderr for failure messages — don't yield from it.
    let stderrBuf = '';
    child.stderr.on('data', (c: Buffer) => {
      stderrBuf += c.toString('utf8');
      // Bound stderr buffer too so a misbehaving CLI dumping MB of warnings
      // doesn't OOM us.
      if (stderrBuf.length > 256 * 1024) stderrBuf = stderrBuf.slice(-128 * 1024);
    });

    // Surface spawn-time ENOENT (binary not on PATH). The 'error' event fires
    // asynchronously AFTER spawn() returns the child reference.
    let spawnError: Error | null = null;
    child.on('error', (err: Error) => {
      spawnError = err;
    });

    // Wire abort → SIGTERM. On Windows SIGTERM maps to a terminate call.
    const onAbort = (): void => {
      if (!child.killed) {
        try {
          child.kill('SIGTERM');
        } catch {
          /* already dead */
        }
      }
    };
    if (args.signal.aborted) {
      onAbort();
    } else {
      args.signal.addEventListener('abort', onAbort, { once: true });
    }

    // Pipe prompt into stdin and close.
    const prompt = serializePrompt(args.messages, args.tools);
    try {
      child.stdin.write(prompt);
      child.stdin.end();
    } catch {
      // stdin closed already (child died) — exit handler below will throw.
    }

    // Track exit so we can throw on non-zero code AFTER draining stdout.
    let exitCode: number | null = null;
    let exitSignal: NodeJS.Signals | null = null;
    const exitPromise = new Promise<void>((resolve) => {
      child.on('exit', (code, sig) => {
        exitCode = code;
        exitSignal = sig;
        resolve();
      });
    });

    // Per-turn tool_use accumulation, mirroring AnthropicApiClient.
    interface PendingToolUse {
      id: string;
      name: string;
      jsonBuf: string;
    }
    const pending = new Map<number, PendingToolUse>();
    let cachedStopReason = 'unknown';
    let messageStopEmitted = false;
    let warnedBadLine = false;

    // ── stdout line splitter ──────────────────────────────────────────────
    const MAX_LINE_BUF = 1 * 1024 * 1024; // 1MB safety cap (mirror claude-stream-json)
    let lineBuf = '';

    /** Process a single fully-buffered JSON line. */
    const processLine = function* (
      this: void,
      rawLine: string,
    ): Generator<AssistantEvent> {
      const line = rawLine.trim();
      if (!line) return;
      let outer: OuterEvent;
      try {
        outer = JSON.parse(line) as OuterEvent;
      } catch {
        if (!warnedBadLine) {
          // eslint-disable-next-line no-console
          console.warn(
            `[ClaudeCodeCliApiClient] failed to JSON.parse stdout line (snippet='${line.slice(0, 80)}') — skipping further parse-failure warnings this stream`,
          );
          warnedBadLine = true;
        }
        return;
      }

      // Terminator: `result` (flat) carries the final stop_reason + usage.
      if (outer.type === 'result') {
        const usage = extractUsage(outer.usage);
        if (usage) yield { kind: 'usage', usage };
        const sr = typeof outer.stop_reason === 'string' ? outer.stop_reason : cachedStopReason;
        if (!messageStopEmitted) {
          yield { kind: 'message_stop', stop_reason: sr };
          messageStopEmitted = true;
        }
        return;
      }

      const inner = extractInnerEvent(outer);
      if (!inner || typeof inner.type !== 'string') return;

      if (inner.type === 'message_start') {
        const u = extractUsage(inner.message?.usage);
        if (u) yield { kind: 'usage', usage: u };
      } else if (inner.type === 'content_block_start') {
        const idx = inner.index ?? 0;
        const cb = inner.content_block;
        if (cb && cb.type === 'tool_use' && typeof cb.id === 'string' && typeof cb.name === 'string') {
          pending.set(idx, { id: cb.id, name: cb.name, jsonBuf: '' });
        }
      } else if (inner.type === 'content_block_delta') {
        const idx = inner.index ?? 0;
        const d = inner.delta;
        if (d?.type === 'text_delta' && typeof d.text === 'string') {
          yield { kind: 'text_delta', text: d.text };
        } else if (d?.type === 'input_json_delta' && typeof d.partial_json === 'string') {
          const p = pending.get(idx);
          if (p) p.jsonBuf += d.partial_json;
        }
      } else if (inner.type === 'content_block_stop') {
        const idx = inner.index ?? 0;
        const p = pending.get(idx);
        if (p) {
          let input: unknown = {};
          if (p.jsonBuf.length > 0) {
            try {
              input = JSON.parse(p.jsonBuf);
            } catch {
              input = { __parse_error: true, raw: p.jsonBuf };
            }
          }
          yield { kind: 'tool_use', id: p.id, name: p.name, input };
          pending.delete(idx);
        }
      } else if (inner.type === 'message_delta') {
        const u = extractUsage(inner.usage);
        if (u) yield { kind: 'usage', usage: u };
        const sr = inner.delta?.stop_reason;
        if (typeof sr === 'string') cachedStopReason = sr;
      } else if (inner.type === 'message_stop') {
        if (!messageStopEmitted) {
          yield { kind: 'message_stop', stop_reason: cachedStopReason };
          messageStopEmitted = true;
        }
      }
    };

    // ── stdout consumer ──────────────────────────────────────────────────
    // Use the readable as an async iterable. Each chunk may contain ≥0 full
    // lines + a possibly-partial trailing line; we glue them via lineBuf.
    try {
      for await (const chunk of child.stdout as AsyncIterable<Buffer>) {
        if (args.signal.aborted) {
          onAbort();
          return;
        }
        lineBuf += chunk.toString('utf8');
        if (lineBuf.length > MAX_LINE_BUF) {
          // Defensive — drop everything up to the last newline so we resync.
          // eslint-disable-next-line no-console
          console.warn(
            `[ClaudeCodeCliApiClient] lineBuf > ${MAX_LINE_BUF}B without newline — resyncing`,
          );
          const lastNl = lineBuf.lastIndexOf('\n');
          lineBuf = lastNl >= 0 ? lineBuf.slice(lastNl + 1) : lineBuf.slice(-1);
        }
        const lines = lineBuf.split('\n');
        lineBuf = lines.pop() ?? '';
        for (const ln of lines) {
          for (const ev of processLine(ln)) yield ev;
        }
      }
      // Flush the trailing partial line (some CLIs don't end with '\n').
      if (lineBuf.trim().length > 0) {
        for (const ev of processLine(lineBuf)) yield ev;
        lineBuf = '';
      }
    } catch (err) {
      // stdout iteration error — usually a forced kill. If we already saw an
      // abort, swallow and return; else surface.
      if (args.signal.aborted) return;
      throw err instanceof Error ? err : new Error(String(err));
    }

    // Wait for the child to fully exit before deciding success/failure.
    await exitPromise;
    args.signal.removeEventListener('abort', onAbort);

    if (spawnError) {
      // ENOENT / EACCES — typically means the binary isn't installed.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const code = (spawnError as any).code;
      if (code === 'ENOENT') {
        throw new Error(
          `claude-code CLI not found (${binPath}). Install: npm i -g @anthropic-ai/claude-cli, then run \`claude login\`.`,
        );
      }
      throw spawnError;
    }

    if (exitCode !== null && exitCode !== 0) {
      const tail = stderrBuf.slice(-2048);
      throw new Error(
        `claude-code CLI exited with code ${exitCode}${exitSignal ? ` (signal=${exitSignal})` : ''}: ${tail || '(no stderr)'}`,
      );
    }

    // Defensive — if the CLI dropped EOF without ever sending message_stop,
    // emit one so the runtime terminates cleanly. (Mirrors openai-compat's
    // stop_emitted-fallback policy.)
    if (!messageStopEmitted) {
      yield { kind: 'message_stop', stop_reason: cachedStopReason };
    }
  }
}
