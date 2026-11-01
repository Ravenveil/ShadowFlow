/**
 * G1（2026-06-13）— emitToolChunk 映射契约：网关 fanout 的 tool-use/tool-result
 * chunk → tool_call/tool_echo TimelineMessage。锁住映射(args 截 200、空 result 跳过、
 * gw=null no-op)，与 timeline-projector.onToolUse/onToolResult 对齐。
 */
import { describe, it, expect } from 'vitest';
import { emitToolChunk } from '../groups-chat';
import type { TimelineMessage, MessagePatch } from '../../lib/contracts';
import type { TurnChunk } from '../../workflow/types';

function makeGw() {
  const emitted: TimelineMessage[] = [];
  const patches: MessagePatch[] = [];
  let n = 0;
  return {
    gw: {
      nextId: () => `gw_test_${++n}`,
      turnId: 'turn_1',
      emitMessage: (m: TimelineMessage) => emitted.push(m),
      emitPatch: (p: MessagePatch) => patches.push(p),
    },
    emitted,
    patches,
  };
}

describe('emitToolChunk (G1 工具可见)', () => {
  it('tool-use → tool_call(name + args_summary)', () => {
    const { gw, emitted } = makeGw();
    emitToolChunk(gw, {
      type: 'tool-use',
      tool: { tool_name: 'read_file', tool_input: { path: 'src/a.ts' } },
    } as TurnChunk);
    expect(emitted).toHaveLength(1);
    const m = emitted[0] as Extract<TimelineMessage, { kind: 'tool_call' }>;
    expect(m.kind).toBe('tool_call');
    expect(m.name).toBe('read_file');
    expect(m.args_summary).toBe('{"path":"src/a.ts"}');
    expect(m.turn_id).toBe('turn_1');
    // gap #2 — tool_call 起始 status:'running'
    expect(m.status).toBe('running');
  });

  it('gap #2 — tool-use → tool-result 配对发 tool_finalize（ok + 耗时 + 摘要）', () => {
    const { gw, emitted, patches } = makeGw();
    emitToolChunk(gw, { type: 'tool-use', tool: { tool_name: 'grep', tool_input: { q: 'x' } } } as TurnChunk);
    const call = emitted[0] as Extract<TimelineMessage, { kind: 'tool_call' }>;
    emitToolChunk(gw, { type: 'tool-result', result: { tool_use_id: 't1', output: 'a\nb\nc' } } as TurnChunk);
    const fin = patches.find((p) => p.op === 'tool_finalize') as Extract<MessagePatch, { op: 'tool_finalize' }> | undefined;
    expect(fin).toBeTruthy();
    expect(fin?.id).toBe(call.id);          // 落定到对应 tool_call
    expect(fin?.status).toBe('ok');
    expect(typeof fin?.duration_ms).toBe('number');
    expect(fin?.result_summary).toBe('3 行'); // 多行 → "N 行"
  });

  it('gap #2 — 错误结果 → tool_finalize status error', () => {
    const { gw, patches } = makeGw();
    emitToolChunk(gw, { type: 'tool-use', tool: { tool_name: 'read_file', tool_input: {} } } as TurnChunk);
    emitToolChunk(gw, { type: 'tool-result', result: { tool_use_id: 't1', output: 'Error: ENOENT' } } as TurnChunk);
    const fin = patches.find((p) => p.op === 'tool_finalize') as Extract<MessagePatch, { op: 'tool_finalize' }> | undefined;
    expect(fin?.status).toBe('error');
  });

  it('tool-use 超长 args 截断到 200 + …', () => {
    const { gw, emitted } = makeGw();
    const big = 'x'.repeat(500);
    emitToolChunk(gw, {
      type: 'tool-use',
      tool: { tool_name: 'grep', tool_input: big },
    } as TurnChunk);
    const m = emitted[0] as Extract<TimelineMessage, { kind: 'tool_call' }>;
    expect(m.args_summary.length).toBe(201); // 200 + '…'
    expect(m.args_summary.endsWith('…')).toBe(true);
  });

  it('tool-result → tool_echo(body)', () => {
    const { gw, emitted } = makeGw();
    emitToolChunk(gw, {
      type: 'tool-result',
      result: { tool_use_id: 'toolu_1', output: '3 matches found' },
    } as TurnChunk);
    expect(emitted).toHaveLength(1);
    const m = emitted[0] as Extract<TimelineMessage, { kind: 'tool_echo' }>;
    expect(m.kind).toBe('tool_echo');
    expect(m.body).toBe('3 matches found');
  });

  it('空 tool-result → 不 emit', () => {
    const { gw, emitted } = makeGw();
    emitToolChunk(gw, {
      type: 'tool-result',
      result: { tool_use_id: 'toolu_1', output: '   ' },
    } as TurnChunk);
    expect(emitted).toHaveLength(0);
  });

  it('gw=null → no-op(不抛)', () => {
    expect(() =>
      emitToolChunk(null, {
        type: 'tool-use',
        tool: { tool_name: 'x', tool_input: {} },
      } as TurnChunk),
    ).not.toThrow();
  });

  it('text-delta/error chunk → 忽略(只认 tool-use/tool-result)', () => {
    const { gw, emitted } = makeGw();
    emitToolChunk(gw, { type: 'text-delta', value: 'hi' } as TurnChunk);
    expect(emitted).toHaveLength(0);
  });
});
