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

import { pipeChunksToSse, firstJsonValueEnd } from '../../assembler';
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

  // 5: JSON object + trailing prose → blueprint card AND trailing text.
  //    Boundary fix (spec §2.2): prose must NOT be swallowed into raw.
  {
    console.log('\n[5] JSON + trailing prose → card + text (prose not lost to raw)');
    const ev = await collect([
      { type: 'text-delta', value: '{"name":"x"}' },
      { type: 'text-delta', value: '\n\n后续说明文字' },
      { type: 'done' },
    ]);
    ok('emits a blueprint event', ev.some((e) => e.event === 'blueprint'));
    ok('emits yaml-line events', ev.some((e) => e.event === 'yaml-line'));
    ok('trailing prose surfaces as text', textOf(ev).includes('后续说明文字'));
    ok('no raw fallback for this case', !ev.some((e) => e.event === 'raw'));
    ok('no JSON leaked into text', !textOf(ev).includes('"name"'));
  }

  // 6: JSON with string-embedded braces + trailing prose → boundary respected.
  {
    console.log('\n[6] JSON whose string contains braces + trailing prose');
    const ev = await collect([
      { type: 'text-delta', value: '{"tpl":"用 {x} 占位","ok":true}' },
      { type: 'text-delta', value: ' 我建议你接下来检查配置' },
      { type: 'done' },
    ]);
    ok('emits blueprint despite braces in string', ev.some((e) => e.event === 'blueprint'));
    ok('trailing prose surfaces as text', textOf(ev).includes('我建议你接下来检查配置'));
    ok('no raw fallback', !ev.some((e) => e.event === 'raw'));
  }

  // 7: firstJsonValueEnd unit checks — balance scanning with strings/escapes.
  {
    console.log('\n[7] firstJsonValueEnd unit');
    ok('plain object end', firstJsonValueEnd('{"a":1} tail') === 7);
    ok('array end', firstJsonValueEnd('[1,2,3] more') === 7);
    ok('nested object end', firstJsonValueEnd('{"a":{"b":[1]}}X') === 15);
    ok('braces inside string ignored', firstJsonValueEnd('{"s":"}}}"}rest') === 11);
    ok('escaped quote inside string', firstJsonValueEnd('{"s":"a\\"}b"}z') === 13);
    ok('leading whitespace skipped', firstJsonValueEnd('  {"a":1}') === 9);
    ok('unbalanced returns -1', firstJsonValueEnd('{"a":1') === -1);
    ok('non-json start returns -1', firstJsonValueEnd('hello {a}') === -1);
  }

  console.log(`\n${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

void main();
