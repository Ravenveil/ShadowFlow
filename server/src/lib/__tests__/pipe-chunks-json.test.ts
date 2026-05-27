/**
 * pipe-chunks-json.test.ts — T2/P2: bare-JSON answer → structured card.
 *
 * Run with:  npx tsx src/lib/__tests__/pipe-chunks-json.test.ts
 *
 * pipeChunksToSse holds back an answer whose first content is a JSON document
 * (`{`/`[`) and, at turn end, emits it as `blueprint` + `yaml-line` frames
 * (→ diff_panel card) instead of leaking literal `\n` / `"}` as text. Falls
 * back to a `raw` block when the blob doesn't parse or is interrupted.
 */

import { pipeChunksToSse } from '../../assembler';
import type { TurnChunk } from '../../workflow/types';

let pass = 0;
let fail = 0;
function ok(label: string, cond: boolean): void {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}`); }
}

async function collect(chunks: TurnChunk[]): Promise<Array<{ event: string; data: unknown }>> {
  async function* gen() { for (const c of chunks) yield c; }
  const out: Array<{ event: string; data: unknown }> = [];
  for await (const e of pipeChunksToSse(gen(), 'sess-json', () => {})) out.push(e);
  return out;
}

function textOf(events: Array<{ event: string; data: unknown }>): string {
  return events
    .filter((e) => e.event === 'text')
    .map((e) => String((e.data as { text?: string })?.text ?? ''))
    .join('');
}

async function main() {
  // 1: bare JSON object answer → blueprint + yaml-line, NOT text.
  {
    console.log('\n[1] bare JSON answer → structured blueprint card');
    const json = '{"name":"dev_engineer","constraints":"代码必须可运行"}';
    const ev = await collect([
      { type: 'text-delta', value: json.slice(0, 20) },
      { type: 'text-delta', value: json.slice(20) },
      { type: 'done' },
    ]);
    ok('emits a blueprint event', ev.some((e) => e.event === 'blueprint'));
    ok('emits yaml-line events', ev.some((e) => e.event === 'yaml-line'));
    ok('no raw JSON leaked as text', !textOf(ev).includes('"name"'));
    const bp = ev.find((e) => e.event === 'blueprint');
    ok('blueprint filename = agent-blueprint.json', (bp?.data as { filename?: string })?.filename === 'agent-blueprint.json');
  }

  // 2: normal prose answer (not JSON) streams as text unchanged.
  {
    console.log('\n[2] normal prose → text (not held)');
    const ev = await collect([
      { type: 'text-delta', value: '这是一个普通回答' },
      { type: 'done' },
    ]);
    ok('prose emitted as text', textOf(ev).includes('这是一个普通回答'));
    ok('no blueprint for prose', !ev.some((e) => e.event === 'blueprint'));
  }

  // 3: malformed/truncated JSON → raw fallback, never garbage text.
  {
    console.log('\n[3] truncated JSON → raw fallback');
    const ev = await collect([
      { type: 'text-delta', value: '{"name":"x", "oops' },
      { type: 'done' },
    ]);
    ok('falls back to raw', ev.some((e) => e.event === 'raw'));
    ok('raw source = json-blob', ev.some((e) => e.event === 'raw' && (e.data as { source?: string })?.source === 'json-blob'));
    ok('no blueprint for unparseable', !ev.some((e) => e.event === 'blueprint'));
  }

  // 4: JSON-looking text interrupted by a real structured event → raw release.
  {
    console.log('\n[4] held JSON interrupted by <sf:node> tag → raw, tag preserved');
    const ev = await collect([
      { type: 'text-delta', value: '{"partial":' },
      { type: 'text-delta', value: ' <sf:node node_id="a" title="A"/>' },
      { type: 'done' },
    ]);
    ok('held text released as raw', ev.some((e) => e.event === 'raw'));
    ok('the node tag still surfaces as node event', ev.some((e) => e.event === 'node'));
  }

  console.log(`\n${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

void main();
