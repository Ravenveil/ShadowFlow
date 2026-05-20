/**
 * anthropic-block-adapter.test.ts — S5 companion smoke tests.
 *
 * Run with:  npx tsx src/lib/__tests__/anthropic-block-adapter.test.ts   (from server/)
 *
 * Coverage:
 *   1. toAnthropicBlock x 3 variants — text / tool_use / tool_result
 *   2. fromAnthropicBlock x 3 variants
 *   3. is_error round-trip both directions (true / false / undefined)
 *   4. Round-trip test: ContentBlock → wire → ContentBlock equals original
 *      (modulo tool_name asymmetry — see adapter JSDoc)
 *   5. toAnthropicMessages — role folding ('tool' → 'user'), usage stripped
 *   6. toAnthropicMessages — empty / multi-message arrays
 */

import {
  toAnthropicBlock,
  fromAnthropicBlock,
  toAnthropicMessages,
  type AnthropicBlock,
} from '../anthropic-block-adapter';
import type { ContentBlock, ConversationMessage } from '../conversation-types';

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

// ── 1. toAnthropicBlock × 3 variants ─────────────────────────────────────────
{
  check(
    'toAnthropicBlock: text',
    { type: 'text', text: 'hello' },
    toAnthropicBlock({ kind: 'text', text: 'hello' }),
  );
  check(
    'toAnthropicBlock: tool_use with object input',
    { type: 'tool_use', id: 't1', name: 'echo', input: { msg: 'hi' } },
    toAnthropicBlock({ kind: 'tool_use', id: 't1', name: 'echo', input: { msg: 'hi' } }),
  );
  check(
    'toAnthropicBlock: tool_use with string input',
    { type: 'tool_use', id: 't2', name: 'shell', input: 'ls -la' },
    toAnthropicBlock({ kind: 'tool_use', id: 't2', name: 'shell', input: 'ls -la' }),
  );
  check(
    'toAnthropicBlock: tool_result is_error=false',
    { type: 'tool_result', tool_use_id: 'tu1', content: 'output text', is_error: false },
    toAnthropicBlock({
      kind: 'tool_result',
      tool_use_id: 'tu1',
      tool_name: 'echo',
      output: 'output text',
      is_error: false,
    }),
  );
  check(
    'toAnthropicBlock: tool_result is_error=true',
    { type: 'tool_result', tool_use_id: 'tu2', content: 'bang', is_error: true },
    toAnthropicBlock({
      kind: 'tool_result',
      tool_use_id: 'tu2',
      tool_name: 'shell',
      output: 'bang',
      is_error: true,
    }),
  );
}

// ── 2. fromAnthropicBlock × 3 variants ───────────────────────────────────────
{
  check(
    'fromAnthropicBlock: text',
    { kind: 'text', text: 'hello' },
    fromAnthropicBlock({ type: 'text', text: 'hello' }),
  );
  check(
    'fromAnthropicBlock: tool_use',
    { kind: 'tool_use', id: 't1', name: 'echo', input: { msg: 'hi' } },
    fromAnthropicBlock({ type: 'tool_use', id: 't1', name: 'echo', input: { msg: 'hi' } }),
  );
  check(
    'fromAnthropicBlock: tool_result with is_error=true',
    {
      kind: 'tool_result',
      tool_use_id: 'tu1',
      tool_name: '',
      output: 'oops',
      is_error: true,
    },
    fromAnthropicBlock({
      type: 'tool_result',
      tool_use_id: 'tu1',
      content: 'oops',
      is_error: true,
    }),
  );
  // is_error undefined on wire → false internally
  check(
    'fromAnthropicBlock: tool_result with undefined is_error coerces to false',
    {
      kind: 'tool_result',
      tool_use_id: 'tu2',
      tool_name: '',
      output: 'ok',
      is_error: false,
    },
    fromAnthropicBlock({ type: 'tool_result', tool_use_id: 'tu2', content: 'ok' }),
  );
}

// ── 3. Round-trip: ContentBlock → wire → ContentBlock ────────────────────────
{
  const original: ContentBlock = { kind: 'text', text: 'roundtrip' };
  const wired = toAnthropicBlock(original);
  const back = fromAnthropicBlock(wired);
  check('round-trip: text', original, back);
}
{
  const original: ContentBlock = {
    kind: 'tool_use',
    id: 'rt1',
    name: 'rt_tool',
    input: { a: 1, nested: { b: [1, 2, 3] } },
  };
  const wired = toAnthropicBlock(original);
  const back = fromAnthropicBlock(wired);
  check('round-trip: tool_use with nested input', original, back);
}
{
  // tool_result asymmetry: wire format drops tool_name. We must
  // compare against an "expected" with tool_name=''.
  const original: ContentBlock = {
    kind: 'tool_result',
    tool_use_id: 'rt2',
    tool_name: 'shell',
    output: '/tmp',
    is_error: false,
  };
  const wired = toAnthropicBlock(original);
  const back = fromAnthropicBlock(wired);
  // tool_name is stripped on the wire and comes back empty per adapter JSDoc.
  const expected = { ...original, tool_name: '' };
  check('round-trip: tool_result (tool_name stripped per adapter contract)', expected, back);
}

// ── 4. toAnthropicMessages — role folding ────────────────────────────────────
{
  const messages: ConversationMessage[] = [
    { role: 'user', blocks: [{ kind: 'text', text: 'hello' }] },
    {
      role: 'assistant',
      blocks: [{ kind: 'text', text: 'hi' }],
      usage: { input_tokens: 10, output_tokens: 5 },
    },
    {
      role: 'tool',
      blocks: [
        {
          kind: 'tool_result',
          tool_use_id: 'x1',
          tool_name: 'echo',
          output: 'pong',
          is_error: false,
        },
      ],
    },
  ];
  const wire = toAnthropicMessages(messages);
  check(
    'toAnthropicMessages: tool role → user role',
    [
      { role: 'user', content: [{ type: 'text', text: 'hello' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'hi' }] },
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'x1', content: 'pong', is_error: false },
        ],
      },
    ],
    wire,
  );
}

// ── 5. toAnthropicMessages — empty + multi-block ─────────────────────────────
{
  check('toAnthropicMessages: empty array', [], toAnthropicMessages([]));
}
{
  // assistant with text + tool_use, like a real Anthropic mid-turn message.
  const messages: ConversationMessage[] = [
    {
      role: 'assistant',
      blocks: [
        { kind: 'text', text: 'let me check' },
        { kind: 'tool_use', id: 'a1', name: 'lookup', input: { q: 'x' } },
      ],
    },
  ];
  const wire = toAnthropicMessages(messages);
  check(
    'toAnthropicMessages: multi-block assistant turn',
    [
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'let me check' },
          { type: 'tool_use', id: 'a1', name: 'lookup', input: { q: 'x' } },
        ],
      },
    ],
    wire,
  );
}

// ── 6. Exhaustiveness: switch covers every ContentBlock variant ──────────────
// Compile-time check via inline self-test: if a future variant is added to
// ContentBlock without updating toAnthropicBlock, the build will break. At
// runtime we just sanity-check that the three known variants all map to a
// wire block with a defined `type` field.
{
  const variants: ContentBlock[] = [
    { kind: 'text', text: 't' },
    { kind: 'tool_use', id: 'i', name: 'n', input: null },
    {
      kind: 'tool_result',
      tool_use_id: 'i',
      tool_name: 'n',
      output: 'o',
      is_error: false,
    },
  ];
  for (const v of variants) {
    const wire: AnthropicBlock = toAnthropicBlock(v);
    const typeField = wire.type;
    check(`exhaustive: kind=${v.kind} maps to a non-empty wire type`, true, typeof typeField === 'string' && typeField.length > 0);
  }
}

console.log(`\n${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
