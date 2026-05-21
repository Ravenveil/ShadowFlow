/**
 * claude-code-cli-api-client.test.ts — S14.2 ClaudeCodeCliApiClient →
 * AssistantEvent translation smoke.
 *
 * Run with:
 *   npx tsx src/lib/api-clients/__tests__/claude-code-cli-api-client.test.ts
 *
 * Strategy: monkey-patch `child_process.spawn` to return an EventEmitter that
 * mimics a real subprocess. We don't actually exec the CLI — CI may not have
 * it installed and we don't want to depend on a system binary anyway. The
 * fake subprocess lets us:
 *   - script stdout NDJSON chunk-by-chunk (including mid-line splits)
 *   - assert stdin received the serialized prompt
 *   - assert SIGTERM was delivered on abort
 *   - simulate non-zero exit + stderr to verify error surfacing
 *
 * Coverage:
 *   - text_delta forwarded both via flat content_block_delta and verbose
 *     {type:stream_event, event:{...}} envelopes
 *   - tool_use input_json_delta accumulation across multiple chunks
 *   - mid-chunk line splitting (chunk boundary inside a JSON line)
 *   - message_delta stop_reason cached → emitted on message_stop
 *   - `result` flat terminator drives message_stop when verbose mode dropped it
 *   - non-zero exit code → throws with stderr text
 *   - SIGTERM delivered when AbortSignal fires
 *   - JSON.parse failure on a banner line → warns once + skips
 *   - empty stdout / no message_stop → defensive synthetic emit
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { EventEmitter } from 'node:events';
import { Readable, Writable } from 'node:stream';
import { ClaudeCodeCliApiClient, type SpawnFn } from '../claude-code-cli-api-client';
import type { AssistantEvent } from '../../conversation-runtime';
import type { ToolSpec } from '../../tool-spec';

let pass = 0;
let fail = 0;

function check(label: string, expected: unknown, actual: unknown): void {
  const eq = JSON.stringify(expected) === JSON.stringify(actual);
  if (eq) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    fail++;
    console.log(
      `  FAIL  ${label}\n        expected=${JSON.stringify(expected)}\n        actual  =${JSON.stringify(actual)}`,
    );
  }
}

function checkTruthy(label: string, actual: unknown): void {
  if (actual) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label}  (expected truthy, got ${JSON.stringify(actual)})`);
  }
}

async function collect(it: AsyncIterable<AssistantEvent>): Promise<AssistantEvent[]> {
  const out: AssistantEvent[] = [];
  for await (const e of it) out.push(e);
  return out;
}

/**
 * FakeChildProcess — minimal EventEmitter that satisfies the subset of the
 * `ChildProcessWithoutNullStreams` surface our client uses:
 *   - stdout: Readable
 *   - stderr: Readable
 *   - stdin: Writable (capture writes for assertion)
 *   - kill(signal): records the signal and emits 'exit'
 *   - on('exit'|'error'): standard EventEmitter
 *
 * Tests script stdout via `pushStdoutChunks` and trigger the exit with
 * `finish(code, signal?)`. To simulate spawn ENOENT, set `simulateSpawnError`
 * which causes the patched spawn() to emit('error', enoent) on next tick.
 */
interface ScriptedSubprocess {
  child: any;
  stdinWrites: string[];
  receivedSignals: string[];
  finish: (code: number, signal?: NodeJS.Signals | null) => void;
  pushStdoutChunks: (chunks: Array<string | Buffer>) => Promise<void>;
  pushStderr: (text: string) => void;
  triggerError: (err: NodeJS.ErrnoException) => void;
}

function makeFakeChild(): ScriptedSubprocess {
  const ee = new EventEmitter() as any;
  const stdinWrites: string[] = [];
  const receivedSignals: string[] = [];

  // stdout / stderr as paused Readables we push into.
  const stdout = new Readable({ read() { /* no-op; pushed externally */ } });
  const stderr = new Readable({ read() { /* no-op */ } });
  const stdin = new Writable({
    write(chunk, _enc, cb) {
      stdinWrites.push(chunk.toString('utf8'));
      cb();
    },
    final(cb) {
      cb();
    },
  });

  ee.stdout = stdout;
  ee.stderr = stderr;
  ee.stdin = stdin;
  ee.killed = false;
  ee.kill = (signal?: NodeJS.Signals): boolean => {
    receivedSignals.push(String(signal ?? 'SIGTERM'));
    ee.killed = true;
    // Realistic: a kill triggers exit with null code + signal.
    setImmediate(() => {
      stdout.push(null);
      stderr.push(null);
      ee.emit('exit', null, signal ?? 'SIGTERM');
    });
    return true;
  };

  return {
    child: ee,
    stdinWrites,
    receivedSignals,
    finish: (code, signal = null) => {
      // EOF stdout/stderr first, then emit exit.
      stdout.push(null);
      stderr.push(null);
      ee.emit('exit', code, signal);
    },
    pushStdoutChunks: async (chunks) => {
      for (const c of chunks) {
        stdout.push(typeof c === 'string' ? Buffer.from(c, 'utf8') : c);
        // Yield to the event loop so the consumer can drain.
        await new Promise((r) => setImmediate(r));
      }
    },
    pushStderr: (text) => {
      stderr.push(Buffer.from(text, 'utf8'));
    },
    triggerError: (err) => {
      setImmediate(() => ee.emit('error', err));
    },
  };
}

/**
 * Build a SpawnFn that returns a scripted fake child each call. `factory` is
 * invoked on each spawn() to allow per-test scripting (test stashes the
 * returned ScriptedSubprocess via the closure-captured ref).
 */
function makeSpawnFn(
  factory: (cmd: string, args: readonly string[], opts: any) => ScriptedSubprocess,
): { spawnFn: SpawnFn; inspect: { spawned: Array<{ cmd: string; args: readonly string[]; opts: any }> } } {
  const inspect = { spawned: [] as Array<{ cmd: string; args: readonly string[]; opts: any }> };
  const spawnFn: SpawnFn = ((cmd, args, opts) => {
    inspect.spawned.push({ cmd, args, opts });
    return factory(cmd, args, opts).child;
  }) as SpawnFn;
  return { spawnFn, inspect };
}

const ECHO_TOOL: ToolSpec = {
  name: 'echo',
  description: 'echo a message',
  input_schema: {
    type: 'object',
    properties: { msg: { type: 'string' } },
    required: ['msg'],
  },
  source: 'base',
};

// ─── tests ─────────────────────────────────────────────────────────────────

async function testFlatTextDelta(): Promise<void> {
  console.log('\n[claude-code-cli] flat (non-verbose) text_delta envelope');
  let sub!: ScriptedSubprocess;
  const { spawnFn } = makeSpawnFn(() => {
    sub = makeFakeChild();
    return sub;
  });
  {
    const client = new ClaudeCodeCliApiClient({ binPath: 'claude', spawnFn });
    const eventsP = collect(
      client.stream({
        system_prompt: 'SYS',
        messages: [{ role: 'user', blocks: [{ kind: 'text', text: 'hi' }] }],
        tools: [],
        signal: new AbortController().signal,
      }),
    );

    // Wait a tick for the subprocess to be wired.
    await new Promise((r) => setImmediate(r));

    await sub.pushStdoutChunks([
      JSON.stringify({ type: 'message_start', message: { usage: { input_tokens: 7 } } }) + '\n',
      JSON.stringify({
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'hello ' },
      }) + '\n',
      JSON.stringify({
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'world' },
      }) + '\n',
      JSON.stringify({
        type: 'message_delta',
        delta: { stop_reason: 'end_turn' },
        usage: { output_tokens: 3 },
      }) + '\n',
      JSON.stringify({ type: 'message_stop' }) + '\n',
    ]);
    sub.finish(0);
    const events = await eventsP;

    const texts = events
      .filter((e) => e.kind === 'text_delta')
      .map((e) => (e as { text: string }).text);
    check('flat text_delta sequence', ['hello ', 'world'], texts);

    const usages = events.filter((e) => e.kind === 'usage') as Array<{
      usage: { input_tokens?: number; output_tokens?: number };
    }>;
    check('flat usage events count', 2, usages.length);
    check('flat usage[0].input_tokens', 7, usages[0]?.usage.input_tokens);
    check('flat usage[1].output_tokens', 3, usages[1]?.usage.output_tokens);

    const stop = events.find((e) => e.kind === 'message_stop') as
      | { stop_reason: string }
      | undefined;
    check('flat stop_reason routed', 'end_turn', stop?.stop_reason);
  }
}

async function testNestedVerboseEnvelope(): Promise<void> {
  console.log('\n[claude-code-cli] verbose nested {type:stream_event, event:{...}} envelope');
  let sub!: ScriptedSubprocess;
  const { spawnFn } = makeSpawnFn(() => {
    sub = makeFakeChild();
    return sub;
  });
  {
    const client = new ClaudeCodeCliApiClient({ binPath: 'claude', spawnFn });
    const eventsP = collect(
      client.stream({
        system_prompt: '',
        messages: [{ role: 'user', blocks: [{ kind: 'text', text: 'go' }] }],
        tools: [],
        signal: new AbortController().signal,
      }),
    );
    await new Promise((r) => setImmediate(r));
    await sub.pushStdoutChunks([
      JSON.stringify({ type: 'system', subtype: 'init' }) + '\n',
      JSON.stringify({
        type: 'stream_event',
        event: {
          type: 'message_start',
          message: { usage: { input_tokens: 4 } },
        },
      }) + '\n',
      JSON.stringify({
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: '中文 ' },
        },
      }) + '\n',
      JSON.stringify({
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: '回复' },
        },
      }) + '\n',
      JSON.stringify({
        type: 'stream_event',
        event: {
          type: 'message_delta',
          delta: { stop_reason: 'end_turn' },
        },
      }) + '\n',
      JSON.stringify({ type: 'stream_event', event: { type: 'message_stop' } }) + '\n',
    ]);
    sub.finish(0);
    const events = await eventsP;

    check(
      'verbose text concat',
      ['中文 ', '回复'],
      events
        .filter((e) => e.kind === 'text_delta')
        .map((e) => (e as { text: string }).text),
    );
    const stop = events.find((e) => e.kind === 'message_stop') as
      | { stop_reason: string }
      | undefined;
    check('verbose stop_reason routed', 'end_turn', stop?.stop_reason);
  }
}

async function testToolUseAccumulation(): Promise<void> {
  console.log('\n[claude-code-cli] tool_use input_json_delta accumulation');
  let sub!: ScriptedSubprocess;
  const { spawnFn } = makeSpawnFn(() => {
    sub = makeFakeChild();
    return sub;
  });
  {
    const client = new ClaudeCodeCliApiClient({ binPath: 'claude', spawnFn });
    const eventsP = collect(
      client.stream({
        system_prompt: 'use tools',
        messages: [{ role: 'user', blocks: [{ kind: 'text', text: 'compute' }] }],
        tools: [ECHO_TOOL],
        signal: new AbortController().signal,
      }),
    );
    await new Promise((r) => setImmediate(r));
    // Verbose envelope w/ tool_use spread across 3 input_json_delta chunks.
    await sub.pushStdoutChunks([
      JSON.stringify({
        type: 'stream_event',
        event: {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'tool_use', id: 'call_xyz', name: 'echo' },
        },
      }) + '\n',
      JSON.stringify({
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'input_json_delta', partial_json: '{"msg":"' },
        },
      }) + '\n',
      JSON.stringify({
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'input_json_delta', partial_json: 'hi th' },
        },
      }) + '\n',
      JSON.stringify({
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'input_json_delta', partial_json: 'ere"}' },
        },
      }) + '\n',
      JSON.stringify({
        type: 'stream_event',
        event: { type: 'content_block_stop', index: 0 },
      }) + '\n',
      JSON.stringify({
        type: 'stream_event',
        event: {
          type: 'message_delta',
          delta: { stop_reason: 'tool_use' },
        },
      }) + '\n',
      JSON.stringify({ type: 'stream_event', event: { type: 'message_stop' } }) + '\n',
    ]);
    sub.finish(0);
    const events = await eventsP;

    const tu = events.find((e) => e.kind === 'tool_use') as
      | { id: string; name: string; input: unknown }
      | undefined;
    checkTruthy('tool_use emitted', tu !== undefined);
    check('tool_use.id', 'call_xyz', tu?.id);
    check('tool_use.name', 'echo', tu?.name);
    check('tool_use.input glued+parsed', { msg: 'hi there' }, tu?.input);

    const stop = events.find((e) => e.kind === 'message_stop') as
      | { stop_reason: string }
      | undefined;
    check('tool_use stop_reason', 'tool_use', stop?.stop_reason);
  }
}

async function testMidChunkLineSplit(): Promise<void> {
  console.log('\n[claude-code-cli] mid-chunk line split (JSON line spans 2 stdout chunks)');
  let sub!: ScriptedSubprocess;
  const { spawnFn } = makeSpawnFn(() => {
    sub = makeFakeChild();
    return sub;
  });
  {
    const client = new ClaudeCodeCliApiClient({ binPath: 'claude', spawnFn });
    const eventsP = collect(
      client.stream({
        system_prompt: '',
        messages: [],
        tools: [],
        signal: new AbortController().signal,
      }),
    );
    await new Promise((r) => setImmediate(r));
    const fullLine =
      JSON.stringify({
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'split-test' },
      }) + '\n';
    // Cut in half — first chunk has no trailing newline.
    const cut = Math.floor(fullLine.length / 2);
    await sub.pushStdoutChunks([fullLine.slice(0, cut), fullLine.slice(cut)]);
    await sub.pushStdoutChunks([
      JSON.stringify({
        type: 'message_delta',
        delta: { stop_reason: 'end_turn' },
      }) + '\n',
      JSON.stringify({ type: 'message_stop' }) + '\n',
    ]);
    sub.finish(0);
    const events = await eventsP;
    check(
      'reassembled split line',
      ['split-test'],
      events
        .filter((e) => e.kind === 'text_delta')
        .map((e) => (e as { text: string }).text),
    );
  }
}

async function testNonZeroExit(): Promise<void> {
  console.log('\n[claude-code-cli] non-zero exit → throws with stderr text');
  let sub!: ScriptedSubprocess;
  const { spawnFn } = makeSpawnFn(() => {
    sub = makeFakeChild();
    return sub;
  });
  {
    const client = new ClaudeCodeCliApiClient({ binPath: 'claude', spawnFn });
    const eventsP = collect(
      client.stream({
        system_prompt: '',
        messages: [],
        tools: [],
        signal: new AbortController().signal,
      }),
    );
    await new Promise((r) => setImmediate(r));
    sub.pushStderr('Error: not authenticated. Run `claude login`.\n');
    sub.finish(1);

    let threw = false;
    let msg = '';
    try {
      await eventsP;
    } catch (err) {
      threw = true;
      msg = (err as Error).message;
    }
    checkTruthy('throws on non-zero exit', threw);
    checkTruthy(
      `error mentions exit code 1 (got '${msg.slice(0, 80)}…')`,
      msg.includes('code 1'),
    );
    checkTruthy(
      `error includes stderr tail (got '${msg.slice(0, 200)}…')`,
      msg.includes('not authenticated'),
    );
  }
}

async function testAbortSendsSigterm(): Promise<void> {
  console.log('\n[claude-code-cli] abort signal → SIGTERM');
  let sub!: ScriptedSubprocess;
  const { spawnFn } = makeSpawnFn(() => {
    sub = makeFakeChild();
    return sub;
  });
  {
    const client = new ClaudeCodeCliApiClient({ binPath: 'claude', spawnFn });
    const ac = new AbortController();
    const eventsP = collect(
      client.stream({
        system_prompt: '',
        messages: [],
        tools: [],
        signal: ac.signal,
      }),
    );
    await new Promise((r) => setImmediate(r));
    // Push a partial event then abort before message_stop.
    await sub.pushStdoutChunks([
      JSON.stringify({
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'partial' },
      }) + '\n',
    ]);
    ac.abort();
    // pile some bytes after abort to make sure consumer notices abort fast
    await new Promise((r) => setImmediate(r));
    // The fake's kill() drives the exit emit automatically.
    try {
      await eventsP;
    } catch {
      /* may throw or not depending on timing; we only assert SIGTERM was sent */
    }
    checkTruthy(
      `SIGTERM delivered (signals=${JSON.stringify(sub.receivedSignals)})`,
      sub.receivedSignals.includes('SIGTERM'),
    );
  }
}

async function testParseFailureWarnOnce(): Promise<void> {
  console.log('\n[claude-code-cli] JSON.parse failure → warn once + skip');
  let sub!: ScriptedSubprocess;
  const { spawnFn } = makeSpawnFn(() => {
    sub = makeFakeChild();
    return sub;
  });
  const origWarn = console.warn;
  let warnCount = 0;
  let warnMsg = '';
  console.warn = (...a: unknown[]): void => {
    warnCount++;
    warnMsg = String(a[0] ?? '');
  };
  try {
    const client = new ClaudeCodeCliApiClient({ binPath: 'claude', spawnFn });
    const eventsP = collect(
      client.stream({
        system_prompt: '',
        messages: [],
        tools: [],
        signal: new AbortController().signal,
      }),
    );
    await new Promise((r) => setImmediate(r));
    await sub.pushStdoutChunks([
      'BANNER: claude-code v1.2.3 starting\n',
      'another non-json log line\n',
      JSON.stringify({
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'real text' },
      }) + '\n',
      JSON.stringify({ type: 'message_stop' }) + '\n',
    ]);
    sub.finish(0);
    const events = await eventsP;
    check(
      'real text still extracted past banner',
      ['real text'],
      events.filter((e) => e.kind === 'text_delta').map((e) => (e as any).text),
    );
    check('console.warn fired exactly once across N bad lines', 1, warnCount);
    checkTruthy(
      `warn mentions JSON.parse (got '${warnMsg.slice(0, 80)}')`,
      warnMsg.includes('JSON.parse'),
    );
  } finally {
    console.warn = origWarn;
  }
}

async function testResultTerminator(): Promise<void> {
  console.log('\n[claude-code-cli] `result` flat terminator drives final message_stop');
  let sub!: ScriptedSubprocess;
  const { spawnFn } = makeSpawnFn(() => {
    sub = makeFakeChild();
    return sub;
  });
  {
    const client = new ClaudeCodeCliApiClient({ binPath: 'claude', spawnFn });
    const eventsP = collect(
      client.stream({
        system_prompt: '',
        messages: [],
        tools: [],
        signal: new AbortController().signal,
      }),
    );
    await new Promise((r) => setImmediate(r));
    await sub.pushStdoutChunks([
      JSON.stringify({
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'done.' },
      }) + '\n',
      // No message_stop — verbose mode dropped it, instead a flat `result`.
      JSON.stringify({
        type: 'result',
        stop_reason: 'end_turn',
        usage: { input_tokens: 1, output_tokens: 2 },
      }) + '\n',
    ]);
    sub.finish(0);
    const events = await eventsP;
    const stops = events.filter((e) => e.kind === 'message_stop');
    check('exactly one message_stop emitted', 1, stops.length);
    check(
      'result-driven stop_reason',
      'end_turn',
      (stops[0] as { stop_reason: string })?.stop_reason,
    );
    const usages = events.filter((e) => e.kind === 'usage') as Array<{ usage: any }>;
    checkTruthy('usage from result terminator', usages.some((u) => u.usage.output_tokens === 2));
  }
}

async function testEmptyStdoutDefensiveStop(): Promise<void> {
  console.log('\n[claude-code-cli] empty stdout → defensive synthetic message_stop');
  let sub!: ScriptedSubprocess;
  const { spawnFn } = makeSpawnFn(() => {
    sub = makeFakeChild();
    return sub;
  });
  {
    const client = new ClaudeCodeCliApiClient({ binPath: 'claude', spawnFn });
    const eventsP = collect(
      client.stream({
        system_prompt: '',
        messages: [],
        tools: [],
        signal: new AbortController().signal,
      }),
    );
    await new Promise((r) => setImmediate(r));
    // No chunks, just clean exit.
    sub.finish(0);
    const events = await eventsP;
    const stop = events.find((e) => e.kind === 'message_stop') as
      | { stop_reason: string }
      | undefined;
    checkTruthy('defensive message_stop emitted', stop !== undefined);
    check('defensive stop_reason defaults to unknown', 'unknown', stop?.stop_reason);
  }
}

async function testStdinReceivesPrompt(): Promise<void> {
  console.log('\n[claude-code-cli] stdin receives serialized prompt with role labels');
  let sub!: ScriptedSubprocess;
  const { spawnFn, inspect } = makeSpawnFn(() => {
    sub = makeFakeChild();
    return sub;
  });
  {
    const client = new ClaudeCodeCliApiClient({ binPath: 'claude', model: 'claude-sonnet-4-6', spawnFn });
    const eventsP = collect(
      client.stream({
        system_prompt: 'You are a helpful agent.',
        messages: [
          { role: 'user', blocks: [{ kind: 'text', text: 'Compute 1+1' }] },
          {
            role: 'assistant',
            blocks: [
              { kind: 'text', text: 'I will use echo.' },
              { kind: 'tool_use', id: 'c1', name: 'echo', input: { msg: 'two' } },
            ],
          },
          {
            role: 'tool',
            blocks: [
              {
                kind: 'tool_result',
                tool_use_id: 'c1',
                tool_name: 'echo',
                output: 'two',
                is_error: false,
              },
            ],
          },
        ],
        tools: [ECHO_TOOL],
        signal: new AbortController().signal,
      }),
    );
    await new Promise((r) => setImmediate(r));
    sub.finish(0);
    await eventsP.catch(() => {/* defensive stop emit fine */});

    const allStdin = sub.stdinWrites.join('');
    checkTruthy('prompt contains USER label', allStdin.includes('## USER'));
    checkTruthy('prompt contains ASSISTANT label', allStdin.includes('## ASSISTANT'));
    checkTruthy('prompt contains TOOL label', allStdin.includes('## TOOL'));
    checkTruthy(
      'prompt contains tool_use envelope',
      allStdin.includes('<tool_use name="echo" id="c1">'),
    );
    checkTruthy(
      'prompt contains tool_result envelope',
      allStdin.includes('<tool_result tool_use_id="c1"'),
    );
    checkTruthy('prompt lists available tool', allStdin.includes('echo: echo a message'));

    const spawnCall = inspect.spawned[0];
    checkTruthy(
      `--model forwarded (args=${JSON.stringify(spawnCall.args)})`,
      spawnCall.args.includes('--model') &&
        spawnCall.args[spawnCall.args.indexOf('--model') + 1] === 'claude-sonnet-4-6',
    );
    checkTruthy(
      '--append-system forwarded with system_prompt',
      spawnCall.args.includes('--append-system') &&
        spawnCall.args[spawnCall.args.indexOf('--append-system') + 1] ===
          'You are a helpful agent.',
    );
    checkTruthy(
      '--output-format stream-json forwarded',
      spawnCall.args.includes('stream-json'),
    );
    checkTruthy('--verbose forwarded', spawnCall.args.includes('--verbose'));
  }
}

async function testSpawnEnoent(): Promise<void> {
  console.log('\n[claude-code-cli] spawn ENOENT → install-hint error');
  let sub!: ScriptedSubprocess;
  const { spawnFn } = makeSpawnFn(() => {
    sub = makeFakeChild();
    const enoent: NodeJS.ErrnoException = new Error('spawn claude ENOENT');
    enoent.code = 'ENOENT';
    sub.triggerError(enoent);
    return sub;
  });
  {
    const client = new ClaudeCodeCliApiClient({ binPath: 'claude', spawnFn });
    const eventsP = collect(
      client.stream({
        system_prompt: '',
        messages: [],
        tools: [],
        signal: new AbortController().signal,
      }),
    );
    await new Promise((r) => setImmediate(r));
    // Even with ENOENT the child still emits its own exit via the EE — fire
    // it to unblock the await exitPromise inside the client.
    sub.finish(127);

    let threw = false;
    let msg = '';
    try {
      await eventsP;
    } catch (err) {
      threw = true;
      msg = (err as Error).message;
    }
    checkTruthy('throws on ENOENT', threw);
    checkTruthy(
      `error mentions install hint (got '${msg.slice(0, 200)}…')`,
      msg.includes('npm i') || msg.includes('not found') || msg.includes('claude'),
    );
  }
}

async function main(): Promise<void> {
  await testFlatTextDelta();
  await testNestedVerboseEnvelope();
  await testToolUseAccumulation();
  await testMidChunkLineSplit();
  await testNonZeroExit();
  await testAbortSendsSigterm();
  await testParseFailureWarnOnce();
  await testResultTerminator();
  await testEmptyStdoutDefensiveStop();
  await testStdinReceivesPrompt();
  await testSpawnEnoent();

  console.log(`\n${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

void main();
