/**
 * timeline.test.ts — 时间线纯函数层的回归网。
 *
 * 这一层同时是「流式」与「回放」的两条路的公共底座：后端事件重放、run 流
 * 补丁、轮询合并都走这几个函数，坏掉的表现是「字停在半句」或「同一句话
 * 出现两遍」—— 不报错，只是不对。所以逐条钉住。
 */
import { describe, expect, it } from 'vitest';
import {
  applyTimelinePatch,
  applyTimelinePatchToList,
  approvalSignalOf,
  groupTimeline,
  isActiveRun,
  reconcileTimeline,
  upsertTimeline,
} from '@/shared/data/timeline';
import type { TimelineMessage } from '@/shared/data/types';

const msg = (patch: Partial<TimelineMessage> & Pick<TimelineMessage, 'id' | 'kind'>): TimelineMessage => ({
  turn_id: 't1',
  ts: 1_000,
  ...patch,
});

describe('upsertTimeline', () => {
  it('同 id 覆盖、位置不动（流式重发不重排）', () => {
    const a = msg({ id: 'a', kind: 'assistant_text', body: '旧' });
    const b = msg({ id: 'b', kind: 'assistant_text', body: 'B' });
    const next = upsertTimeline([a, b], msg({ id: 'a', kind: 'assistant_text', body: '新' }));
    expect(next.map((m) => m.id)).toEqual(['a', 'b']);
    expect(next[0].body).toBe('新');
  });

  it('新 id 追加到末尾', () => {
    const next = upsertTimeline([msg({ id: 'a', kind: 'raw' })], msg({ id: 'b', kind: 'raw' }));
    expect(next.map((m) => m.id)).toEqual(['a', 'b']);
  });
});

describe('applyTimelinePatch', () => {
  it('text_append 长正文并挂上流式光标', () => {
    const m = msg({ id: 'a', kind: 'assistant_text', body: '前半句' });
    const next = applyTimelinePatch(m, { id: 'a', op: 'text_append', chunk: '，后半句' });
    expect(next.body).toBe('前半句，后半句');
    expect(next.streaming).toBe(true);
  });

  it('text_finalize 收掉光标', () => {
    const m = msg({ id: 'a', kind: 'assistant_text', body: 'x', streaming: true });
    expect(applyTimelinePatch(m, { id: 'a', op: 'text_finalize' }).streaming).toBe(false);
  });

  it('thinking 边流边收：body 累加，finalize 落 tokens 与耗时', () => {
    const m = msg({ id: 'k', kind: 'thinking', status: 'streaming' });
    const grown = applyTimelinePatch(m, { id: 'k', op: 'thinking_append_body', chunk: '先看范围' });
    expect(grown.body).toBe('先看范围');
    const done = applyTimelinePatch(grown, {
      id: 'k',
      op: 'thinking_finalize',
      tokens: 812,
      duration_ms: 6400,
    });
    expect(done.status).toBe('done');
    expect(done.tokens).toBe(812);
    expect(done.duration_ms).toBe(6400);
  });

  it('tool_finalize 落状态、耗时与结果摘要', () => {
    const m = msg({ id: 'c', kind: 'tool_call', name: 'read_file', status: 'running' });
    const next = applyTimelinePatch(m, {
      id: 'c',
      op: 'tool_finalize',
      status: 'ok',
      duration_ms: 210,
      result_summary: '42 段',
    });
    expect(next.status).toBe('ok');
    expect(next.duration_ms).toBe(210);
    expect(next.result_summary).toBe('42 段');
  });

  it('append_step / update_step 让步骤树原地长大', () => {
    const m = msg({ id: 's', kind: 'step_panel', steps: [{ name: '第一步', status: 'running' }] });
    const added = applyTimelinePatch(m, {
      id: 's',
      op: 'append_step',
      step: { name: '第二步', status: 'pending' },
    });
    expect(added.steps).toHaveLength(2);
    const updated = applyTimelinePatch(added, {
      id: 's',
      op: 'update_step',
      index: 0,
      patch: { status: 'done', elapsed_ms: 900 },
    });
    expect(updated.steps?.[0]).toMatchObject({ status: 'done', elapsed_ms: 900 });
  });

  it('plan_update_task 只改点名那一行', () => {
    const m = msg({
      id: 'p',
      kind: 'plan_card',
      tasks: [
        { id: 't1', title: 'A', status: 'pending' },
        { id: 't2', title: 'B', status: 'pending' },
      ],
    });
    const next = applyTimelinePatch(m, {
      id: 'p',
      op: 'plan_update_task',
      task_id: 't2',
      patch: { status: 'running' },
    });
    expect(next.tasks?.map((t) => t.status)).toEqual(['pending', 'running']);
  });

  it('op 与 kind 不匹配时原样返回（防御性 no-op）', () => {
    const m = msg({ id: 'a', kind: 'assistant_text', body: 'x' });
    expect(applyTimelinePatch(m, { id: 'a', op: 'thinking_append_body', chunk: 'y' })).toBe(m);
  });

  it('未知 op 不炸', () => {
    const m = msg({ id: 'a', kind: 'raw', body: 'x' });
    expect(applyTimelinePatch(m, { id: 'a', op: 'something_new' })).toBe(m);
  });
});

describe('applyTimelinePatchToList', () => {
  it('补丁指向不认识的 id 时整份列表不动（环形缓冲可能已驱逐原消息）', () => {
    const list = [msg({ id: 'a', kind: 'assistant_text', body: 'x' })];
    expect(applyTimelinePatchToList(list, { id: 'ghost', op: 'text_append', chunk: 'y' })).toBe(list);
  });

  it('命中时只替换那一格', () => {
    const list = [
      msg({ id: 'a', kind: 'assistant_text', body: 'x' }),
      msg({ id: 'b', kind: 'assistant_text', body: 'y' }),
    ];
    const next = applyTimelinePatchToList(list, { id: 'b', op: 'text_append', chunk: 'z' });
    expect(next[0]).toBe(list[0]);
    expect(next[1].body).toBe('yz');
  });
});

describe('reconcileTimeline', () => {
  const echo = msg({ id: 'local-1', kind: 'user_turn', ts: 5_000, text: '帮我看一下第三节' });

  it('服务端回显同文本后，本地回声退场（不渲染两遍）', () => {
    const server = [msg({ id: 'chat_1', kind: 'user_turn', ts: 5_100, text: '帮我看一下第三节' })];
    expect(reconcileTimeline(server, [echo]).map((m) => m.id)).toEqual(['chat_1']);
  });

  it('服务端还没回显时，回声先上屏并排在正确位置', () => {
    const server = [msg({ id: 'chat_0', kind: 'user_turn', ts: 4_000, text: '早先那句' })];
    expect(reconcileTimeline(server, [echo]).map((m) => m.id)).toEqual(['chat_0', 'local-1']);
  });

  it('文本不同就当两句话（不回显也不吞），按 ts 归位', () => {
    const server = [msg({ id: 'chat_2', kind: 'user_turn', ts: 5_100, text: '别的话' })];
    expect(reconcileTimeline(server, [echo]).map((m) => m.id)).toEqual(['local-1', 'chat_2']);
  });
});

describe('groupTimeline', () => {
  it('用户开口单独成行，过程并进同一张 Agent 卡', () => {
    const rows = groupTimeline([
      msg({ id: 'u', kind: 'user_turn', ts: 100 }),
      msg({ id: 'k', kind: 'thinking', ts: 200, agent_name: '主控' }),
      msg({ id: 'a', kind: 'assistant_text', ts: 300, agent_name: '主控' }),
    ]);
    expect(rows.map((r) => r.kind)).toEqual(['user', 'turn']);
    expect(rows[1].kind === 'turn' && rows[1].msgs).toHaveLength(2);
  });

  it('换了人就拆卡', () => {
    const rows = groupTimeline([
      msg({ id: 'k1', kind: 'thinking', ts: 100, agent_name: '主控', agent_id: 'lead' }),
      msg({ id: 'k2', kind: 'thinking', ts: 200, agent_name: '引用审查', agent_id: 'cr' }),
    ]);
    expect(rows).toHaveLength(2);
  });

  it('没有归属的格子并进相邻卡，不会各自成卡', () => {
    const rows = groupTimeline([
      msg({ id: 'a', kind: 'assistant_text', ts: 100, agent_name: '主控' }),
      msg({ id: 'f', kind: 'msg_foot', ts: 200 }),
    ]);
    expect(rows).toHaveLength(1);
  });

  it('msg_foot 稳定挪到卡片末尾（回放按 ts 排会把它插到中间）', () => {
    const rows = groupTimeline([
      msg({ id: 'a', kind: 'assistant_text', ts: 100 }),
      msg({ id: 'f', kind: 'msg_foot', ts: 200 }),
      msg({ id: 'k', kind: 'thinking', ts: 300 }),
    ]);
    const turn = rows[0];
    expect(turn.kind === 'turn' && turn.msgs.map((m) => m.id)).toEqual(['a', 'k', 'f']);
  });

  it('收尾行被后置的裁决卡隔开时，仍挂回上一张 Agent 卡', () => {
    const rows = groupTimeline([
      msg({ id: 'a', kind: 'assistant_text', ts: 100, agent_name: '引用审查', agent_id: 'cr' }),
      msg({ id: 'v', kind: 'verdict_card', ts: 200 }),
      msg({ id: 'f', kind: 'msg_foot', ts: 300 }),
    ]);
    expect(rows.map((r) => r.kind)).toEqual(['turn', 'system']);
    const turn = rows[0];
    expect(turn.kind === 'turn' && turn.msgs.map((m) => m.id)).toEqual(['a', 'f']);
    expect(turn.kind === 'turn' && turn.who.name).toBe('引用审查');
  });

  it('计划卡 / 表格 / 裁决各自独立成块，不并进 Agent 卡', () => {
    const rows = groupTimeline([
      msg({ id: 'a', kind: 'assistant_text', ts: 100 }),
      msg({ id: 'p', kind: 'plan_card', ts: 200 }),
      msg({ id: 't', kind: 'table_panel', ts: 300 }),
    ]);
    expect(rows.map((r) => r.kind)).toEqual(['turn', 'system', 'system']);
  });
});

describe('isActiveRun', () => {
  it('只有 running / pending 值得订阅过程流', () => {
    expect(isActiveRun('running')).toBe(true);
    expect(isActiveRun('PENDING')).toBe(true);
    expect(isActiveRun('done')).toBe(false);
    expect(isActiveRun('canceled')).toBe(false);
    expect(isActiveRun(undefined)).toBe(false);
  });
});

describe('approvalSignalOf', () => {
  it('请批准 → request；已批准 → decision；其余无关', () => {
    expect(approvalSignalOf('「合并成稿」前有 1 道审批门挂起，等待你确认，回复「批准」放行')).toBe('request');
    expect(approvalSignalOf('审批结果：门①已获批准')).toBe('decision');
    expect(approvalSignalOf('本轮已中止')).toBeNull();
    expect(approvalSignalOf(undefined)).toBeNull();
  });
});
