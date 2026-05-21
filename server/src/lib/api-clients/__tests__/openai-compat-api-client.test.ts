/**
 * openai-compat-api-client.test.ts — S14.1 OpenAiCompatApiClient → AssistantEvent
 * translation smoke.
 *
 * Run with:  npx tsx src/lib/api-clients/__tests__/openai-compat-api-client.test.ts
 *
 * Monkey-patch the OpenAI SDK's `chat.completions.create()` to return a
 * scripted async-iterable of ChatCompletionChunk-shaped objects. Same testing
 * shape as anthropic-api-client.test.ts.
 *
 * Coverage:
 *   - text delta → kind: 'text_delta'
 *   - tool_calls fully-assembled in one chunk → 'tool_use' with parsed input
 *   - tool_calls split across N chunks (deltas accumulated by index)
 *   - tool_result fold to role:'tool' message
 *   - multiple parallel tool calls in one turn (different indexes)
 *   - finish_reason normalization: 'stop' → 'end_turn', 'tool_calls' → 'tool_use',
 *     'length' → 'max_tokens'
 *   - usage extraction from trailing chunk
 *   - happy-path on three different providerIds (zhipu / openai / deepseek)
 *   - malformed JSON in arguments → __parse_error wrapper
 *   - missing api_key for non-local provider → throws
 *   - ollama provider tolerates empty key
 *   - system_prompt forwarded as first system message
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import OpenAI from 'openai';
import {
  OpenAiCompatApiClient,
  toOpenAiMessages,
} from '../openai-compat-api-client';
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
 * Patch `OpenAI.Chat.Completions.prototype.create` to return a scripted async
 * iterable. Returns an `inspect` ref capturing the SDK call args + options
 * for assertion, and a restore() to undo the monkey-patch.
 */
function patchSdk(scriptedChunks: any[]): {
  restore: () => void;
  inspect: { createArgs?: any; createOptions?: any; ctorOptions?: any };
} {
  const inspect: { createArgs?: any; createOptions?: any; ctorOptions?: any } = {};

  // Patch the constructor to capture { apiKey, baseURL } too.
  const OrigOpenAI = OpenAI as unknown as new (opts: any) => any;
  const captureCtor = OpenAI as any;
  const origCtorCall = captureCtor.prototype.constructor;
  // Strategy: patch `chat.completions.create` on the prototype path. The
  // OpenAI SDK exposes `client.chat.completions.create`. We grab the proto
  // via a probe instance and reroute the method.
  const probe = new OrigOpenAI({ apiKey: 'probe', baseURL: 'http://probe' });
  // chat is a getter that returns a Chat instance; completions is on Chat.
  const CompletionsProto = Object.getPrototypeOf(probe.chat.completions);
  const origCreate = CompletionsProto.create;

  CompletionsProto.create = function (body: any, options?: any) {
    inspect.createArgs = body;
    inspect.createOptions = options;
    // Capture ctor opts via `this.client._options` if available (SDK keeps
    // them on the client). Fall back to probing in __sdkInternals_.
    const client = (this as any)._client ?? (this as any).client ?? probe;
    inspect.ctorOptions = {
      apiKey: client?.apiKey,
      baseURL: client?.baseURL,
    };
    return (async function* () {
      for (const chunk of scriptedChunks) yield chunk;
    })();
  };

  return {
    inspect,
    restore: () => {
      CompletionsProto.create = origCreate;
      void origCtorCall;
    },
  };
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

const ADD_TOOL: ToolSpec = {
  name: 'add',
  description: 'add two numbers',
  input_schema: {
    type: 'object',
    properties: { a: { type: 'number' }, b: { type: 'number' } },
    required: ['a', 'b'],
  },
  source: 'base',
};

// ─── tests ──────────────────────────────────────────────────────────────────

async function testTextDelta_zhipu(): Promise<void> {
  console.log('\n[openai-compat-api-client] text_delta on providerId=zhipu (GLM)');
  const { restore, inspect } = patchSdk([
    { choices: [{ delta: { content: '你好 ' } }] },
    { choices: [{ delta: { content: '世界' } }] },
    {
      choices: [{ delta: {}, finish_reason: 'stop' }],
      usage: { prompt_tokens: 12, completion_tokens: 3 },
    },
  ]);
  try {
    const client = new OpenAiCompatApiClient({
      providerId: 'zhipu',
      apiKey: 'sk-zhipu-test',
      model: 'glm-4.5-flash',
    });
    const events = await collect(
      client.stream({
        system_prompt: '系统提示',
        messages: [{ role: 'user', blocks: [{ kind: 'text', text: '问候' }] }],
        tools: [],
        signal: new AbortController().signal,
      }),
    );

    const texts = events
      .filter((e) => e.kind === 'text_delta')
      .map((e) => (e as { text: string }).text);
    check('zhipu text_delta sequence', ['你好 ', '世界'], texts);

    const usage = events.find((e) => e.kind === 'usage') as
      | { usage: { input_tokens?: number; output_tokens?: number } }
      | undefined;
    check('zhipu usage.input_tokens (from prompt_tokens)', 12, usage?.usage.input_tokens);
    check(
      'zhipu usage.output_tokens (from completion_tokens)',
      3,
      usage?.usage.output_tokens,
    );

    const stop = events.find((e) => e.kind === 'message_stop') as
      | { stop_reason: string }
      | undefined;
    check('zhipu stop_reason: stop → end_turn', 'end_turn', stop?.stop_reason);

    check('zhipu SDK baseURL', 'https://open.bigmodel.cn/api/paas/v4', inspect.ctorOptions?.baseURL);
  } finally {
    restore();
  }
}

async function testTextDelta_openai(): Promise<void> {
  console.log('\n[openai-compat-api-client] text_delta on providerId=openai');
  const { restore, inspect } = patchSdk([
    { choices: [{ delta: { content: 'hi' } }] },
    { choices: [{ delta: {}, finish_reason: 'stop' }] },
  ]);
  try {
    const client = new OpenAiCompatApiClient({
      providerId: 'openai',
      apiKey: 'sk-openai-test',
    });
    const events = await collect(
      client.stream({
        system_prompt: 'sys',
        messages: [{ role: 'user', blocks: [{ kind: 'text', text: 'go' }] }],
        tools: [],
        signal: new AbortController().signal,
      }),
    );
    check(
      'openai text_delta',
      ['hi'],
      events.filter((e) => e.kind === 'text_delta').map((e) => (e as { text: string }).text),
    );
    check('openai SDK baseURL', 'https://api.openai.com/v1', inspect.ctorOptions?.baseURL);
  } finally {
    restore();
  }
}

async function testTextDelta_deepseek(): Promise<void> {
  console.log('\n[openai-compat-api-client] text_delta on providerId=deepseek');
  const { restore, inspect } = patchSdk([
    { choices: [{ delta: { content: 'deep' } }] },
    { choices: [{ delta: { content: ' seek' } }] },
    { choices: [{ delta: {}, finish_reason: 'stop' }] },
  ]);
  try {
    const client = new OpenAiCompatApiClient({
      providerId: 'deepseek',
      apiKey: 'sk-ds-test',
    });
    const events = await collect(
      client.stream({
        system_prompt: '',
        messages: [],
        tools: [],
        signal: new AbortController().signal,
      }),
    );
    check(
      'deepseek text_delta concat',
      ['deep', ' seek'],
      events.filter((e) => e.kind === 'text_delta').map((e) => (e as { text: string }).text),
    );
    check('deepseek SDK baseURL', 'https://api.deepseek.com/v1', inspect.ctorOptions?.baseURL);
  } finally {
    restore();
  }
}

async function testToolCallsSingleChunk(): Promise<void> {
  console.log('\n[openai-compat-api-client] tool_calls assembled in single delta');
  const { restore } = patchSdk([
    {
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id: 'call_abc',
                type: 'function',
                function: {
                  name: 'echo',
                  arguments: '{"msg":"hi"}',
                },
              },
            ],
          },
        },
      ],
    },
    { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
  ]);
  try {
    const client = new OpenAiCompatApiClient({
      providerId: 'zhipu',
      apiKey: 'sk-test',
    });
    const events = await collect(
      client.stream({
        system_prompt: '',
        messages: [],
        tools: [ECHO_TOOL],
        signal: new AbortController().signal,
      }),
    );
    const tu = events.find((e) => e.kind === 'tool_use') as
      | { id: string; name: string; input: unknown }
      | undefined;
    checkTruthy('tool_use emitted', tu !== undefined);
    check('tool_use.id', 'call_abc', tu?.id);
    check('tool_use.name', 'echo', tu?.name);
    check('tool_use.input parsed', { msg: 'hi' }, tu?.input);

    const stop = events.find((e) => e.kind === 'message_stop') as
      | { stop_reason: string }
      | undefined;
    check('finish_reason: tool_calls → tool_use', 'tool_use', stop?.stop_reason);
  } finally {
    restore();
  }
}

async function testToolCallsSplitChunks(): Promise<void> {
  console.log('\n[openai-compat-api-client] tool_calls split across chunks (index-keyed accumulation)');
  const { restore } = patchSdk([
    {
      choices: [
        {
          delta: {
            tool_calls: [
              { index: 0, id: 'call_split', function: { name: 'echo' } },
            ],
          },
        },
      ],
    },
    {
      choices: [
        {
          delta: {
            tool_calls: [{ index: 0, function: { arguments: '{"msg":"' } }],
          },
        },
      ],
    },
    {
      choices: [
        {
          delta: {
            tool_calls: [{ index: 0, function: { arguments: 'hello' } }],
          },
        },
      ],
    },
    {
      choices: [
        {
          delta: {
            tool_calls: [{ index: 0, function: { arguments: '"}' } }],
          },
        },
      ],
    },
    { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
  ]);
  try {
    const client = new OpenAiCompatApiClient({ providerId: 'openai', apiKey: 'sk' });
    const events = await collect(
      client.stream({
        system_prompt: '',
        messages: [],
        tools: [ECHO_TOOL],
        signal: new AbortController().signal,
      }),
    );
    const tu = events.find((e) => e.kind === 'tool_use') as
      | { id: string; name: string; input: unknown }
      | undefined;
    check('split tool_use.id', 'call_split', tu?.id);
    check('split tool_use.name', 'echo', tu?.name);
    check('split tool_use.input glued+parsed', { msg: 'hello' }, tu?.input);
  } finally {
    restore();
  }
}

async function testMultipleToolCalls(): Promise<void> {
  console.log('\n[openai-compat-api-client] multiple parallel tool_calls (different index)');
  const { restore } = patchSdk([
    {
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id: 'c0',
                function: { name: 'echo', arguments: '{"msg":"a"}' },
              },
              {
                index: 1,
                id: 'c1',
                function: { name: 'add', arguments: '{"a":1,"b":2}' },
              },
            ],
          },
        },
      ],
    },
    { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
  ]);
  try {
    const client = new OpenAiCompatApiClient({ providerId: 'qwen', apiKey: 'sk-q' });
    const events = await collect(
      client.stream({
        system_prompt: '',
        messages: [],
        tools: [ECHO_TOOL, ADD_TOOL],
        signal: new AbortController().signal,
      }),
    );
    const tools = events.filter((e) => e.kind === 'tool_use') as Array<{
      id: string;
      name: string;
      input: unknown;
    }>;
    check('two tool_use events emitted', 2, tools.length);
    check('tool[0].id', 'c0', tools[0]?.id);
    check('tool[0].name', 'echo', tools[0]?.name);
    check('tool[1].id', 'c1', tools[1]?.id);
    check('tool[1].name', 'add', tools[1]?.name);
    check('tool[1].input', { a: 1, b: 2 }, tools[1]?.input);
  } finally {
    restore();
  }
}

async function testMalformedJson(): Promise<void> {
  console.log('\n[openai-compat-api-client] malformed JSON in tool args → __parse_error');
  const { restore } = patchSdk([
    {
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id: 'c_bad',
                function: { name: 'echo', arguments: 'not json' },
              },
            ],
          },
        },
      ],
    },
    { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
  ]);
  try {
    const client = new OpenAiCompatApiClient({ providerId: 'openai', apiKey: 'sk' });
    const events = await collect(
      client.stream({
        system_prompt: '',
        messages: [],
        tools: [ECHO_TOOL],
        signal: new AbortController().signal,
      }),
    );
    const tu = events.find((e) => e.kind === 'tool_use') as
      | { input: unknown }
      | undefined;
    check(
      'malformed args wrapped',
      { __parse_error: true, raw: 'not json' },
      tu?.input,
    );
  } finally {
    restore();
  }
}

async function testFinishReasonLength(): Promise<void> {
  console.log('\n[openai-compat-api-client] finish_reason: length → max_tokens');
  const { restore } = patchSdk([
    { choices: [{ delta: { content: 'partial' } }] },
    { choices: [{ delta: {}, finish_reason: 'length' }] },
  ]);
  try {
    const client = new OpenAiCompatApiClient({ providerId: 'openai', apiKey: 'sk' });
    const events = await collect(
      client.stream({
        system_prompt: '',
        messages: [],
        tools: [],
        signal: new AbortController().signal,
      }),
    );
    const stop = events.find((e) => e.kind === 'message_stop') as
      | { stop_reason: string }
      | undefined;
    check('length → max_tokens', 'max_tokens', stop?.stop_reason);
  } finally {
    restore();
  }
}

async function testSdkCallShape(): Promise<void> {
  console.log('\n[openai-compat-api-client] SDK call body shape (system + history + tools)');
  const { restore, inspect } = patchSdk([
    { choices: [{ delta: {}, finish_reason: 'stop' }] },
  ]);
  try {
    const client = new OpenAiCompatApiClient({
      providerId: 'openai',
      apiKey: 'sk',
      model: 'gpt-5',
      max_tokens: 999,
      temperature: 0.3,
    });
    const ac = new AbortController();
    await collect(
      client.stream({
        system_prompt: 'SYS-MSG',
        messages: [
          { role: 'user', blocks: [{ kind: 'text', text: 'goal' }] },
          {
            role: 'assistant',
            blocks: [
              { kind: 'text', text: 'plan' },
              {
                kind: 'tool_use',
                id: 'c1',
                name: 'echo',
                input: { msg: 'x' },
              },
            ],
          },
          {
            role: 'tool',
            blocks: [
              {
                kind: 'tool_result',
                tool_use_id: 'c1',
                tool_name: 'echo',
                output: 'x',
                is_error: false,
              },
            ],
          },
        ],
        tools: [ECHO_TOOL],
        signal: ac.signal,
      }),
    );

    const body = inspect.createArgs!;
    check('body.model', 'gpt-5', body.model);
    check('body.max_tokens', 999, body.max_tokens);
    check('body.temperature', 0.3, body.temperature);
    check('body.stream', true, body.stream);
    check('body.tools[0].function.name', 'echo', body.tools?.[0]?.function?.name);

    const msgs = body.messages as Array<any>;
    check('messages[0].role', 'system', msgs[0]?.role);
    check('messages[0].content', 'SYS-MSG', msgs[0]?.content);
    check('messages[1].role', 'user', msgs[1]?.role);
    check('messages[1].content', 'goal', msgs[1]?.content);
    check('messages[2].role', 'assistant', msgs[2]?.role);
    check('messages[2].content (assistant text)', 'plan', msgs[2]?.content);
    checkTruthy('messages[2].tool_calls', Array.isArray(msgs[2]?.tool_calls));
    check('messages[2].tool_calls[0].id', 'c1', msgs[2]?.tool_calls?.[0]?.id);
    check(
      'messages[2].tool_calls[0].function.arguments (stringified)',
      '{"msg":"x"}',
      msgs[2]?.tool_calls?.[0]?.function?.arguments,
    );
    check('messages[3].role (tool)', 'tool', msgs[3]?.role);
    check('messages[3].tool_call_id', 'c1', msgs[3]?.tool_call_id);
    check('messages[3].content', 'x', msgs[3]?.content);

    // Signal forwarded
    checkTruthy('signal forwarded', inspect.createOptions?.signal === ac.signal);
  } finally {
    restore();
  }
}

async function testNoApiKey(): Promise<void> {
  console.log('\n[openai-compat-api-client] missing api_key for non-local provider throws');
  const client = new OpenAiCompatApiClient({ providerId: 'openai' });
  let threw = false;
  try {
    await collect(
      client.stream({
        system_prompt: '',
        messages: [],
        tools: [],
        signal: new AbortController().signal,
      }),
    );
  } catch (err) {
    threw = true;
    checkTruthy('error mentions API key', /API key/.test((err as Error).message));
  }
  check('throws for missing key', true, threw);
}

async function testOllamaNoKey(): Promise<void> {
  console.log('\n[openai-compat-api-client] ollama tolerates empty key');
  const { restore } = patchSdk([
    { choices: [{ delta: { content: 'ok' } }] },
    { choices: [{ delta: {}, finish_reason: 'stop' }] },
  ]);
  try {
    const client = new OpenAiCompatApiClient({ providerId: 'ollama' });
    const events = await collect(
      client.stream({
        system_prompt: '',
        messages: [],
        tools: [],
        signal: new AbortController().signal,
      }),
    );
    checkTruthy(
      'ollama empty-key stream still completes',
      events.find((e) => e.kind === 'message_stop') !== undefined,
    );
  } finally {
    restore();
  }
}

async function testNoToolsOmitted(): Promise<void> {
  console.log('\n[openai-compat-api-client] tools field omitted when empty');
  const { restore, inspect } = patchSdk([
    { choices: [{ delta: {}, finish_reason: 'stop' }] },
  ]);
  try {
    const client = new OpenAiCompatApiClient({ providerId: 'openai', apiKey: 'sk' });
    await collect(
      client.stream({
        system_prompt: '',
        messages: [],
        tools: [],
        signal: new AbortController().signal,
      }),
    );
    check('tools omitted when empty', undefined, inspect.createArgs?.tools);
  } finally {
    restore();
  }
}

async function testToOpenAiMessagesPure(): Promise<void> {
  console.log('\n[openai-compat-api-client] toOpenAiMessages translation (pure)');
  const out = toOpenAiMessages([
    { role: 'user', blocks: [{ kind: 'text', text: 'hi' }] },
    {
      role: 'assistant',
      blocks: [
        { kind: 'text', text: 'plan' },
        { kind: 'tool_use', id: 'c1', name: 'echo', input: { msg: 'a' } },
      ],
    },
    {
      role: 'tool',
      blocks: [
        {
          kind: 'tool_result',
          tool_use_id: 'c1',
          tool_name: 'echo',
          output: '{"ok":true}',
          is_error: false,
        },
      ],
    },
  ]);
  check('toOpenAiMessages length', 3, out.length);
  check('msg[2] is tool role (NOT folded to user)', 'tool', (out[2] as any).role);
  check('msg[2] tool_call_id', 'c1', (out[2] as any).tool_call_id);
  check('msg[1] assistant.content', 'plan', (out[1] as any).content);
  check(
    'msg[1] tool_calls[0].function.arguments',
    '{"msg":"a"}',
    (out[1] as any).tool_calls?.[0]?.function?.arguments,
  );
}

async function main(): Promise<void> {
  await testTextDelta_zhipu();
  await testTextDelta_openai();
  await testTextDelta_deepseek();
  await testToolCallsSingleChunk();
  await testToolCallsSplitChunks();
  await testMultipleToolCalls();
  await testMalformedJson();
  await testFinishReasonLength();
  await testSdkCallShape();
  await testNoApiKey();
  await testOllamaNoKey();
  await testNoToolsOmitted();
  await testToOpenAiMessagesPure();

  console.log(`\n${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

void main();
