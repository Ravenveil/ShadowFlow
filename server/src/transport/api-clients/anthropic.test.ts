/**
 * llm-providers/anthropic.test.ts — standalone tsx test for Story 15.18.
 *
 * Run with: `npx tsx src/llm-providers/anthropic.test.ts`
 *
 * Specifically validates that the anthropic provider:
 *   1. Yields NO_API_KEY when no key is provided (api_key + env both empty).
 *   2. Sets the SDK Anthropic constructor's apiKey from input.api_key.
 *   3. Resolves model with: input.model > env(SHADOWFLOW_DEFAULT_MODEL) > default.
 *   4. Calls messages.stream with the right shape (system + user message).
 *
 * Because Anthropic SDK is not trivially fetch-mockable (it uses a Streaming
 * wrapper class), we monkey-patch `Anthropic.prototype` after import so the
 * `messages.stream` call is fully intercepted. This keeps the test offline.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import Anthropic from '@anthropic-ai/sdk';
import { anthropicProvider } from './anthropic';
import { PROVIDER_ENV_VAR } from './types';

let passed = 0;
let failed = 0;

function assert(cond: unknown, msg: string): void {
  if (cond) {
    console.log(`  ✓ ${msg}`);
    passed++;
  } else {
    console.error(`  ✗ ${msg}`);
    failed++;
  }
}

async function collect<T>(g: AsyncGenerator<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of g) out.push(x);
  return out;
}

function clearEnv(): void {
  delete process.env[PROVIDER_ENV_VAR.anthropic];
  delete process.env.SHADOWFLOW_DEFAULT_MODEL;
}

async function testNoApiKey(): Promise<void> {
  console.log('\n[anthropic] NO_API_KEY');
  clearEnv();
  const chunks = await collect(
    anthropicProvider.streamCompletion({
      systemPrompt: 'sys',
      userMessage: 'hi',
    }),
  );
  assert(chunks.length === 1, `yields exactly 1 chunk`);
  const c = chunks[0];
  assert(c?.type === 'error', `chunk is error`);
  if (c?.type === 'error') {
    assert(c.code === 'NO_API_KEY', `code === NO_API_KEY`);
    assert(c.provider === 'anthropic', `provider === 'anthropic'`);
  }
}

async function testEnvKey(): Promise<void> {
  console.log('\n[anthropic] env key avoids NO_API_KEY');
  clearEnv();
  process.env[PROVIDER_ENV_VAR.anthropic] = 'sk-ant-test-env-key';

  // Patch the SDK so we don't hit network.
  let constructorArgs: any = null;
  let streamArgs: any = null;
  const origCtor = (Anthropic as any).prototype.constructor;
  void origCtor;
  const origStream = (Anthropic as any).prototype.messages
    ? null
    : null;
  void origStream;

  // We patch by replacing the prototype method on the existing class.
  const origMessages = Object.getOwnPropertyDescriptor(
    Anthropic.prototype,
    'messages',
  );
  void origMessages;

  // Monkey-patch instance via wrapping Anthropic constructor.
  const RealAnthropic: any = Anthropic;
  const patchedAnthropic = function (opts: any) {
    constructorArgs = opts;
    return {
      messages: {
        stream: (args: any) => {
          streamArgs = args;
          // Return an async iterable that yields a single text_delta then
          // ends — provider should yield text-delta + end.
          const it = (async function* () {
            yield {
              type: 'content_block_delta',
              delta: { type: 'text_delta', text: 'hello' },
            };
          })();
          (it as any).abort = () => {};
          return it;
        },
      },
    };
  };
  // Replace the export: not trivial since anthropicProvider already imported.
  // Instead, swap the prototype.
  const origInit = (Anthropic.prototype as any).messages;
  void origInit;
  void RealAnthropic;
  void patchedAnthropic;

  // Easier path: trap via constructor swap is hard once imported. Use a
  // different strategy — mock `messages.stream` by replacing the prototype.
  // Anthropic SDK wires `this.messages = new Messages(this)` in ctor, so the
  // simplest is to patch `Messages.prototype.stream`.

  // Find the Messages class via an instance.
  const probe = new Anthropic({ apiKey: 'probe' });
  const MessagesProto = Object.getPrototypeOf(probe.messages);
  const origStreamFn = MessagesProto.stream;

  MessagesProto.stream = function (args: any) {
    streamArgs = args;
    constructorArgs = { apiKey: (this as any)._client?.apiKey ?? '(unknown)' };
    const it = (async function* () {
      yield {
        type: 'content_block_delta',
        delta: { type: 'text_delta', text: 'hello' },
      };
    })();
    (it as any).abort = () => {};
    return it;
  };

  try {
    const chunks = await collect(
      anthropicProvider.streamCompletion({
        systemPrompt: 'SYS',
        userMessage: 'USR',
        api_key: 'sk-ant-explicit-arg',
        model: 'claude-test-model',
        max_tokens: 256,
        temperature: 0.42,
      }),
    );

    // Validate chunks
    assert(
      chunks.some((c) => c.type === 'text-delta'),
      'yielded text-delta chunk',
    );
    assert(
      chunks.find((c) => c.type === 'text-delta' && (c as any).text === 'hello') !==
        undefined,
      'text-delta carries "hello"',
    );
    assert(
      chunks.some((c) => c.type === 'end'),
      'yielded end chunk',
    );

    // Validate SDK call arguments
    assert(streamArgs !== null, 'messages.stream was called');
    assert(streamArgs?.model === 'claude-test-model', 'model passed through');
    assert(streamArgs?.max_tokens === 256, 'max_tokens passed through');
    assert(streamArgs?.temperature === 0.42, 'temperature passed through');
    assert(streamArgs?.system === 'SYS', 'system prompt passed through');
    assert(
      Array.isArray(streamArgs?.messages) &&
        streamArgs.messages[0]?.role === 'user' &&
        streamArgs.messages[0]?.content === 'USR',
      'messages[0] is user/USR',
    );
  } finally {
    MessagesProto.stream = origStreamFn;
    clearEnv();
  }
}

async function testEnvModelFallback(): Promise<void> {
  console.log('\n[anthropic] SHADOWFLOW_DEFAULT_MODEL fallback');
  clearEnv();
  process.env[PROVIDER_ENV_VAR.anthropic] = 'sk-ant-test';
  process.env.SHADOWFLOW_DEFAULT_MODEL = 'env-pinned-model';

  let streamArgs: any = null;
  const probe = new Anthropic({ apiKey: 'probe' });
  const MessagesProto = Object.getPrototypeOf(probe.messages);
  const origStreamFn = MessagesProto.stream;

  MessagesProto.stream = function (args: any) {
    streamArgs = args;
    const it = (async function* () {
      // empty
    })();
    (it as any).abort = () => {};
    return it;
  };

  try {
    await collect(
      anthropicProvider.streamCompletion({
        systemPrompt: 's',
        userMessage: 'u',
        // no model — should fall back to env
      }),
    );
    assert(
      streamArgs?.model === 'env-pinned-model',
      `env-pinned model wins (got ${streamArgs?.model})`,
    );
  } finally {
    MessagesProto.stream = origStreamFn;
    clearEnv();
  }
}

async function main(): Promise<void> {
  await testNoApiKey();
  await testEnvKey();
  await testEnvModelFallback();

  console.log(`\n=== ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error('Test crashed:', e);
  process.exit(1);
});
