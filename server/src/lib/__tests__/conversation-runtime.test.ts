/**
 * conversation-runtime.test.ts — S5 ConversationRuntime end-to-end smoke.
 *
 * Run with:  npx tsx src/lib/__tests__/conversation-runtime.test.ts   (from server/)
 *
 * Strategy: scripted FakeApiClient + FakeToolExecutor. Each scenario builds a
 * fresh runtime, drains the runTurn AsyncGenerator into an array, and asserts
 * on the recorded events + the final state of session.messages. The whole
 * suite runs inside an `async function main()` because the tsconfig is
 * CommonJS (no top-level await).
 *
 * What's covered (per S5 DoD):
 *   A.  No tool_use → break after 1 turn, single 'complete' event
 *   B.  1 tool_use → 2-turn loop, tool executed, result fed back, complete
 *   C.  Multiple tool_use same turn → ordered execution
 *   D.  Tool throws → tool_result is_error=true, loop continues
 *   E.  Permission deny → tool_result is_error=true, executor NOT called
 *   F.  max_iterations bail → MAX_ITERATIONS error event
 *   G.  abort signal mid-loop → 'aborted' event, no 'complete'
 *   H.  abort signal before tool dispatch → 'aborted' between tools
 *   I.  ToolExecutionResult.sseEvents forwarded in order
 *   J.  Usage accumulates across turns / events
 *   K.  text_delta events stream to wire AND buffer into one text block
 *   L.  API throws → 'error' event + re-throw
 *   M.  text_delta before tool_use → ordered (text block then tool_use block)
 */

import { ConversationRuntime } from '../conversation-runtime';
import type {
  ApiClient,
  AssistantEvent,
  ToolExecutor,
  ToolExecutionResult,
  RuntimeSession,
  SseEvent,
} from '../conversation-runtime';
import type { ToolSpec } from '../tool-spec';
import { PermissionPolicy } from '../permission-policy';

let pass = 0;
let fail = 0;

function check(label: string, expected: unknown, actual: unknown) {
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

// ─── Fakes ─────────────────────────────────────────────────────────────────

/**
 * Scripted ApiClient — each call to stream() yields the next pre-recorded
 * batch of AssistantEvents. When the script is exhausted, the next call
 * throws (so tests fail loudly if runtime asks for more turns than scripted).
 *
 * If `throwOnTurn` is set, that turn (1-indexed) throws instead of streaming.
 */
class FakeApiClient implements ApiClient {
  private callIdx = 0;
  constructor(
    private readonly script: AssistantEvent[][],
    private readonly throwOnTurn?: { turn: number; err: Error },
  ) {}

  // Public for assertions.
  get turnsConsumed(): number {
    return this.callIdx;
  }

  async *stream(args: {
    system_prompt: string;
    messages: unknown[];
    tools: ToolSpec[];
    signal: AbortSignal;
  }): AsyncIterable<AssistantEvent> {
    const turn = this.callIdx + 1;
    if (this.throwOnTurn && this.throwOnTurn.turn === turn) {
      this.callIdx += 1;
      throw this.throwOnTurn.err;
    }
    if (this.callIdx >= this.script.length) {
      throw new Error(
        `FakeApiClient: turn ${turn} unscripted (script has ${this.script.length})`,
      );
    }
    const events = this.script[this.callIdx];
    this.callIdx += 1;
    for (const ev of events) {
      // Honor abort between events so tests can observe mid-stream cancellation.
      if (args.signal.aborted) return;
      yield ev;
    }
  }
}

/**
 * Fake ToolExecutor. Each tool name is mapped to either a static result or a
 * throwing thunk. The executor records all execute() calls so tests can
 * assert call order and inputs.
 */
class FakeToolExecutor implements ToolExecutor {
  public readonly calls: Array<{ name: string; input: unknown }> = [];
  constructor(
    private readonly specs: ToolSpec[],
    private readonly handlers: Record<
      string,
      ((input: unknown) => Promise<ToolExecutionResult>) | { throws: Error }
    >,
  ) {}

  toolSpecs(): ToolSpec[] {
    return this.specs;
  }

  async execute(name: string, input: unknown): Promise<ToolExecutionResult> {
    this.calls.push({ name, input });
    const h = this.handlers[name];
    if (!h) {
      throw new Error(`FakeToolExecutor: no handler for "${name}"`);
    }
    if (typeof h === 'function') return h(input);
    throw h.throws;
  }
}

// Common ToolSpec — three tools used across scenarios.
const SPECS: ToolSpec[] = [
  { name: 'echo', description: 'echo', input_schema: { type: 'object' }, source: 'base' },
  { name: 'add', description: 'add', input_schema: { type: 'object' }, source: 'base' },
  {
    name: 'forbidden',
    description: 'never allowed',
    input_schema: { type: 'object' },
    source: 'base',
  },
];

function newSession(): RuntimeSession {
  return { id: 'sess-test', messages: [] };
}

async function drain(gen: AsyncGenerator<SseEvent>): Promise<SseEvent[]> {
  const out: SseEvent[] = [];
  for await (const ev of gen) out.push(ev);
  return out;
}

async function main(): Promise<void> {
  // ─── A. Single-turn end_turn, no tools ───────────────────────────────────
  {
    console.log('\n[A] single turn, no tools');
    const api = new FakeApiClient([
      [
        { kind: 'text_delta', text: 'hi' },
        { kind: 'text_delta', text: ' there' },
        { kind: 'usage', usage: { input_tokens: 5, output_tokens: 2 } },
        { kind: 'message_stop', stop_reason: 'end_turn' },
      ],
    ]);
    const tools = new FakeToolExecutor(SPECS, {});
    const session = newSession();
    const rt = new ConversationRuntime(
      session,
      api,
      tools,
      new PermissionPolicy('allow'),
      'SYS',
    );
    const ac = new AbortController();
    const events = await drain(rt.runTurn('hello', ac.signal));

    check('A: no tool calls', 0, tools.calls.length);
    check('A: exactly one turn consumed', 1, api.turnsConsumed);
    const eventKinds = events.map((e) => e.event);
    check('A: SSE shape', ['text', 'text', 'complete'], eventKinds);
    const last = events[events.length - 1].data as {
      iterations: number;
      stop_reason: string;
      session_id: string;
    };
    check('A: complete.iterations=1', 1, last.iterations);
    check('A: complete.stop_reason=end_turn', 'end_turn', last.stop_reason);
    check('A: complete.session_id', 'sess-test', last.session_id);
    check('A: session has 2 messages', 2, session.messages.length);
    check('A: msg[0] role', 'user', session.messages[0].role);
    check('A: msg[1] role', 'assistant', session.messages[1].role);
    const asstBlocks = session.messages[1].blocks;
    check('A: assistant blocks length=1', 1, asstBlocks.length);
    check(
      'A: assistant text concatenated',
      { kind: 'text', text: 'hi there' },
      asstBlocks[0],
    );
  }

  // ─── B. 1 tool_use → 2-turn loop ───────────────────────────────────────────
  {
    console.log('\n[B] one tool_use → execute → loop → complete');
    const api = new FakeApiClient([
      [
        { kind: 'tool_use', id: 'tu1', name: 'echo', input: { msg: 'ping' } },
        { kind: 'usage', usage: { input_tokens: 10, output_tokens: 3 } },
        { kind: 'message_stop', stop_reason: 'tool_use' },
      ],
      [
        { kind: 'text_delta', text: 'got pong' },
        { kind: 'usage', usage: { input_tokens: 12, output_tokens: 4 } },
        { kind: 'message_stop', stop_reason: 'end_turn' },
      ],
    ]);
    const tools = new FakeToolExecutor(SPECS, {
      echo: async (input) => ({ output: { reply: 'pong', got: input } }),
    });
    const session = newSession();
    const rt = new ConversationRuntime(
      session,
      api,
      tools,
      new PermissionPolicy('allow'),
      'SYS',
    );
    const events = await drain(rt.runTurn('start', new AbortController().signal));

    check('B: 1 tool call', 1, tools.calls.length);
    check('B: tool name echo', 'echo', tools.calls[0].name);
    check('B: tool input passed through', { msg: 'ping' }, tools.calls[0].input);
    check('B: turns consumed = 2', 2, api.turnsConsumed);
    const eventKinds = events.map((e) => e.event);
    check('B: SSE shape', ['text', 'complete'], eventKinds);
    check('B: 4 session messages', 4, session.messages.length);
    check('B: msg[0]=user', 'user', session.messages[0].role);
    check('B: msg[1]=assistant', 'assistant', session.messages[1].role);
    check('B: msg[2]=tool', 'tool', session.messages[2].role);
    check('B: msg[3]=assistant', 'assistant', session.messages[3].role);
    const trBlock = session.messages[2].blocks[0];
    check(
      'B: tool_result block',
      {
        kind: 'tool_result',
        tool_use_id: 'tu1',
        tool_name: 'echo',
        output: JSON.stringify({ reply: 'pong', got: { msg: 'ping' } }),
        is_error: false,
      },
      trBlock,
    );
  }

  // ─── C. Multiple tool_use in one turn → sequential dispatch ──────────────
  {
    console.log('\n[C] multiple tool_use same turn');
    const api = new FakeApiClient([
      [
        { kind: 'tool_use', id: 'a', name: 'echo', input: { i: 1 } },
        { kind: 'tool_use', id: 'b', name: 'add', input: { x: 2, y: 3 } },
        { kind: 'message_stop', stop_reason: 'tool_use' },
      ],
      [
        { kind: 'text_delta', text: 'done' },
        { kind: 'message_stop', stop_reason: 'end_turn' },
      ],
    ]);
    const tools = new FakeToolExecutor(SPECS, {
      echo: async (input) => ({ output: { ok: 'echo', input } }),
      add: async (input) => {
        const i = input as { x: number; y: number };
        return { output: { sum: i.x + i.y } };
      },
    });
    const session = newSession();
    const rt = new ConversationRuntime(
      session,
      api,
      tools,
      new PermissionPolicy('allow'),
      'SYS',
    );
    await drain(rt.runTurn('go', new AbortController().signal));

    check('C: 2 tool calls', 2, tools.calls.length);
    check('C: call[0]=echo', 'echo', tools.calls[0].name);
    check('C: call[1]=add', 'add', tools.calls[1].name);
    const turn1Blocks = session.messages[1].blocks;
    check('C: assistant turn1 has 2 blocks', 2, turn1Blocks.length);
    check('C: turn1.block[0] tool_use kind', 'tool_use', turn1Blocks[0].kind);
    check('C: turn1.block[1] tool_use kind', 'tool_use', turn1Blocks[1].kind);
    check('C: msg[2]=tool', 'tool', session.messages[2].role);
    check('C: msg[3]=tool', 'tool', session.messages[3].role);
  }

  // ─── D. Tool throws → packed as tool_result is_error=true ────────────────
  {
    console.log('\n[D] tool throws → is_error=true');
    const api = new FakeApiClient([
      [
        { kind: 'tool_use', id: 'tu1', name: 'echo', input: {} },
        { kind: 'message_stop', stop_reason: 'tool_use' },
      ],
      [
        { kind: 'text_delta', text: 'recovered' },
        { kind: 'message_stop', stop_reason: 'end_turn' },
      ],
    ]);
    const tools = new FakeToolExecutor(SPECS, {
      echo: { throws: new Error('boom') },
    });
    const session = newSession();
    const rt = new ConversationRuntime(
      session,
      api,
      tools,
      new PermissionPolicy('allow'),
      'SYS',
    );
    const events = await drain(rt.runTurn('go', new AbortController().signal));

    const trBlock = session.messages[2].blocks[0];
    check('D: tool_result is_error', true, (trBlock as { is_error: boolean }).is_error);
    check(
      'D: tool_result output mentions throw msg',
      true,
      typeof (trBlock as { output: string }).output === 'string' &&
        (trBlock as { output: string }).output.includes('boom'),
    );
    check('D: loop continued (2 turns)', 2, api.turnsConsumed);
    check('D: completes normally', 'complete', events[events.length - 1].event);
  }

  // ─── E. Permission deny → executor not called ────────────────────────────
  {
    console.log('\n[E] permission deny');
    const api = new FakeApiClient([
      [
        { kind: 'tool_use', id: 'tu1', name: 'forbidden', input: { rm: '/' } },
        { kind: 'message_stop', stop_reason: 'tool_use' },
      ],
      [
        { kind: 'text_delta', text: 'oh well' },
        { kind: 'message_stop', stop_reason: 'end_turn' },
      ],
    ]);
    const tools = new FakeToolExecutor(SPECS, {
      forbidden: async () => ({ output: 'should NOT be called' }),
    });
    const session = newSession();
    const policy = PermissionPolicy.fromAllowedTools(['echo', 'add']);
    const rt = new ConversationRuntime(session, api, tools, policy, 'SYS');
    await drain(rt.runTurn('go', new AbortController().signal));

    check('E: executor NOT called', 0, tools.calls.length);
    const trBlock = session.messages[2].blocks[0] as {
      is_error: boolean;
      output: string;
      tool_name: string;
    };
    check('E: tool_result is_error=true', true, trBlock.is_error);
    check('E: tool_name set on result', 'forbidden', trBlock.tool_name);
    check(
      'E: output contains deny reason',
      true,
      trBlock.output.includes('denied by permission policy'),
    );
  }

  // ─── F. max_iterations bail ──────────────────────────────────────────────
  {
    console.log('\n[F] max_iterations bail');
    const makeTurnScript = (): AssistantEvent[] => [
      { kind: 'tool_use', id: 't', name: 'echo', input: {} },
      { kind: 'message_stop', stop_reason: 'tool_use' },
    ];
    const api = new FakeApiClient([makeTurnScript(), makeTurnScript(), makeTurnScript()]);
    const tools = new FakeToolExecutor(SPECS, {
      echo: async () => ({ output: 'loop' }),
    });
    const session = newSession();
    const rt = new ConversationRuntime(
      session,
      api,
      tools,
      new PermissionPolicy('allow'),
      'SYS',
      { maxIterations: 3 },
    );
    const events = await drain(rt.runTurn('go', new AbortController().signal));

    check('F: 3 iterations consumed', 3, api.turnsConsumed);
    const errEv = events.find((e) => e.event === 'error');
    check('F: error event emitted', true, errEv !== undefined);
    check(
      'F: error code = MAX_ITERATIONS',
      'MAX_ITERATIONS',
      (errEv?.data as { code: string }).code,
    );
    const completeEv = events.find((e) => e.event === 'complete');
    check('F: complete event still emitted', true, completeEv !== undefined);
    check(
      'F: complete.stop_reason=max_iterations',
      'max_iterations',
      (completeEv?.data as { stop_reason: string }).stop_reason,
    );
  }

  // ─── G. AbortSignal mid-loop → 'aborted' event, no 'complete' ────────────
  {
    console.log('\n[G] abort between turns');
    const ac = new AbortController();
    const api = new FakeApiClient([
      [
        { kind: 'tool_use', id: 'a', name: 'echo', input: {} },
        { kind: 'message_stop', stop_reason: 'tool_use' },
      ],
      [
        { kind: 'text_delta', text: 'never' },
        { kind: 'message_stop', stop_reason: 'end_turn' },
      ],
    ]);
    const tools = new FakeToolExecutor(SPECS, {
      echo: async () => {
        // Trigger abort right after tool result is recorded — runtime should
        // see signal.aborted at top of the next iteration.
        ac.abort();
        return { output: 'ok' };
      },
    });
    const session = newSession();
    const rt = new ConversationRuntime(
      session,
      api,
      tools,
      new PermissionPolicy('allow'),
      'SYS',
    );
    const events = await drain(rt.runTurn('go', ac.signal));

    const kinds = events.map((e) => e.event);
    check('G: abort yields aborted event', true, kinds.includes('aborted'));
    check('G: no complete event after abort', false, kinds.includes('complete'));
    check('G: only one turn consumed', 1, api.turnsConsumed);
  }

  // ─── H. Abort BEFORE first iteration (already aborted) ───────────────────
  {
    console.log('\n[H] signal already aborted');
    const ac = new AbortController();
    ac.abort();
    const api = new FakeApiClient([[{ kind: 'message_stop', stop_reason: 'end_turn' }]]);
    const tools = new FakeToolExecutor(SPECS, {});
    const session = newSession();
    const rt = new ConversationRuntime(
      session,
      api,
      tools,
      new PermissionPolicy('allow'),
      'SYS',
    );
    const events = await drain(rt.runTurn('go', ac.signal));

    const kinds = events.map((e) => e.event);
    check('H: pre-abort yields only aborted', ['aborted'], kinds);
    check('H: ApiClient not called', 0, api.turnsConsumed);
    check('H: user message recorded before abort', 'user', session.messages[0].role);
  }

  // ─── I. ToolExecutionResult.sseEvents forwarded in order ─────────────────
  {
    console.log('\n[I] sseEvents passthrough');
    const api = new FakeApiClient([
      [
        { kind: 'tool_use', id: 'a', name: 'echo', input: {} },
        { kind: 'tool_use', id: 'b', name: 'add', input: { x: 1, y: 2 } },
        { kind: 'message_stop', stop_reason: 'tool_use' },
      ],
      [
        { kind: 'text_delta', text: 'fin' },
        { kind: 'message_stop', stop_reason: 'end_turn' },
      ],
    ]);
    const tools = new FakeToolExecutor(SPECS, {
      echo: async () => ({
        output: 'a',
        sseEvents: [
          { event: 'sf-node', data: { id: 'n1' } },
          { event: 'sf-edge', data: { from: 'n1', to: 'n2' } },
        ],
      }),
      add: async () => ({
        output: 'b',
        sseEvents: [{ event: 'sf-node', data: { id: 'n2' } }],
      }),
    });
    const session = newSession();
    const rt = new ConversationRuntime(
      session,
      api,
      tools,
      new PermissionPolicy('allow'),
      'SYS',
    );
    const events = await drain(rt.runTurn('go', new AbortController().signal));

    const sideChannel = events.filter((e) => e.event.startsWith('sf-'));
    check('I: 3 side-channel events', 3, sideChannel.length);
    check(
      'I: order matches tool exec order',
      ['sf-node', 'sf-edge', 'sf-node'],
      sideChannel.map((e) => e.event),
    );
    check('I: first sf-node data', { id: 'n1' }, sideChannel[0].data);
    check('I: sf-edge data', { from: 'n1', to: 'n2' }, sideChannel[1].data);
  }

  // ─── J. Usage accumulates across events and turns ────────────────────────
  {
    console.log('\n[J] usage accumulation');
    const api = new FakeApiClient([
      [
        { kind: 'usage', usage: { input_tokens: 10, output_tokens: 5 } },
        { kind: 'tool_use', id: 'a', name: 'echo', input: {} },
        { kind: 'message_stop', stop_reason: 'tool_use' },
      ],
      [
        { kind: 'usage', usage: { input_tokens: 3, output_tokens: 2 } },
        { kind: 'usage', usage: { input_tokens: 4, cache_read_input_tokens: 100 } },
        { kind: 'message_stop', stop_reason: 'end_turn' },
      ],
    ]);
    const tools = new FakeToolExecutor(SPECS, {
      echo: async () => ({ output: 'ok' }),
    });
    const session = newSession();
    const rt = new ConversationRuntime(
      session,
      api,
      tools,
      new PermissionPolicy('allow'),
      'SYS',
    );
    const events = await drain(rt.runTurn('go', new AbortController().signal));

    const completeData = events.find((e) => e.event === 'complete')!.data as {
      usage: {
        input_tokens: number;
        output_tokens: number;
        cache_read_input_tokens: number;
        cache_creation_input_tokens: number;
      };
    };
    check('J: input_tokens sum', 17, completeData.usage.input_tokens);
    check('J: output_tokens sum', 7, completeData.usage.output_tokens);
    check('J: cache_read sum', 100, completeData.usage.cache_read_input_tokens);
    check(
      'J: cache_creation zero-default',
      0,
      completeData.usage.cache_creation_input_tokens,
    );
  }

  // ─── K. text_delta streams + buffers correctly ───────────────────────────
  {
    console.log('\n[K] text_delta streaming + single-block flush');
    const api = new FakeApiClient([
      [
        { kind: 'text_delta', text: 'one ' },
        { kind: 'text_delta', text: 'two ' },
        { kind: 'text_delta', text: 'three' },
        { kind: 'message_stop', stop_reason: 'end_turn' },
      ],
    ]);
    const tools = new FakeToolExecutor(SPECS, {});
    const session = newSession();
    const rt = new ConversationRuntime(
      session,
      api,
      tools,
      new PermissionPolicy('allow'),
      'SYS',
    );
    const events = await drain(rt.runTurn('go', new AbortController().signal));

    const textEvents = events.filter((e) => e.event === 'text');
    check('K: 3 text frames on the wire', 3, textEvents.length);
    check(
      'K: text frames in order',
      ['one ', 'two ', 'three'],
      textEvents.map((e) => (e.data as { text: string }).text),
    );
    const asstBlocks = session.messages[1].blocks;
    check('K: assistant has exactly 1 block', 1, asstBlocks.length);
    check(
      'K: block contains concatenated text',
      { kind: 'text', text: 'one two three' },
      asstBlocks[0],
    );
  }

  // ─── L. API throws → 'error' event + re-throw ────────────────────────────
  {
    console.log('\n[L] ApiClient throws → error event + re-throw');
    const api = new FakeApiClient(
      [[{ kind: 'message_stop', stop_reason: 'end_turn' }]],
      { turn: 1, err: new Error('rate limited') },
    );
    const tools = new FakeToolExecutor(SPECS, {});
    const session = newSession();
    const rt = new ConversationRuntime(
      session,
      api,
      tools,
      new PermissionPolicy('allow'),
      'SYS',
    );

    const collected: SseEvent[] = [];
    let caughtMsg = '';
    try {
      for await (const ev of rt.runTurn('go', new AbortController().signal)) {
        collected.push(ev);
      }
    } catch (err) {
      caughtMsg = (err as Error).message;
    }
    check('L: caught re-thrown error', 'rate limited', caughtMsg);
    check(
      'L: emitted error event before throw',
      true,
      collected.some(
        (e) => e.event === 'error' && (e.data as { code: string }).code === 'API_ERROR',
      ),
    );
    check(
      'L: no complete event after throw',
      false,
      collected.some((e) => e.event === 'complete'),
    );
  }

  // ─── M. text_delta BEFORE tool_use ordering ──────────────────────────────
  {
    console.log('\n[M] text_delta then tool_use → text block before tool_use block');
    const api = new FakeApiClient([
      [
        { kind: 'text_delta', text: 'I will look up: ' },
        { kind: 'tool_use', id: 'tu1', name: 'echo', input: { q: 'x' } },
        // After the tool, we keep streaming text. This should flush into a
        // SECOND text block (after the tool_use block).
        { kind: 'text_delta', text: 'done lookup.' },
        { kind: 'message_stop', stop_reason: 'tool_use' },
      ],
      [{ kind: 'message_stop', stop_reason: 'end_turn' }],
    ]);
    const tools = new FakeToolExecutor(SPECS, {
      echo: async () => ({ output: 'ok' }),
    });
    const session = newSession();
    const rt = new ConversationRuntime(
      session,
      api,
      tools,
      new PermissionPolicy('allow'),
      'SYS',
    );
    await drain(rt.runTurn('go', new AbortController().signal));

    const blocks = session.messages[1].blocks;
    check('M: 3 blocks (text, tool_use, text)', 3, blocks.length);
    check('M: block[0] is text', 'text', blocks[0].kind);
    check(
      'M: block[0] text',
      'I will look up: ',
      (blocks[0] as { text: string }).text,
    );
    check('M: block[1] is tool_use', 'tool_use', blocks[1].kind);
    check('M: block[2] is text', 'text', blocks[2].kind);
    check(
      'M: block[2] text',
      'done lookup.',
      (blocks[2] as { text: string }).text,
    );
  }

  console.log(`\n${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

void main();
