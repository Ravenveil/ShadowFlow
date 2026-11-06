/**
 * groups-chat-handoff-sink.test.ts — 会话回合跑完自动沉淀交接包（2026-11-05）。
 *
 * 沉淀逻辑拆成纯函数 buildRoundHandoffPayload（组 payload）+ 薄壳
 * sinkRoundHandoff（动态 import 落库，fire-and-forget）。纯函数直测：
 *   - speakers < 2（单 agent 回合）→ null
 *   - speakers ≥ 2 → shift_id=chat:<gid>:<turnSeq> 幂等锚、from=末位 to=首位、
 *     summary 含 goal 与各 agent 产出
 *   - autoLearnOff → null
 *   - 空 excerpt 的 speaker 被过滤
 *   - goal 为空 → summary 不含「任务：」前缀但仍成立
 *
 * createHandoff 的字段校验/幂等/上下文快照本体由其路由层契约测试覆盖
 * （src/__tests__/memory-handoff.test.ts）；薄壳 sinkRoundHandoff 的异常静默
 * 由 try/catch + .catch 双兜底保证（调用方 fire-and-forget）。
 */
import { describe, it, expect } from 'vitest';
import { buildRoundHandoffPayload } from '../groups-chat';

describe('buildRoundHandoffPayload — 会话回合自动沉淀交接包', () => {
  const twoSpeakers = [
    { id: 'a1', name: 'Atlas', excerpt: '我先起草' },
    { id: 'a2', name: 'Nova', excerpt: '我复核完了' },
  ];

  it('单 agent 回合（speakers<2）→ null', () => {
    expect(
      buildRoundHandoffPayload({
        groupId: 'g1',
        turnSeq: 3,
        goal: '写个报告',
        speakers: [{ id: 'a1', name: 'Atlas', excerpt: '写好了' }],
      }),
    ).toBeNull();
  });

  it('双 agent 回合 → shift_id=chat:g1:3，from=末位 to=首位，summary 全量', () => {
    const p = buildRoundHandoffPayload({
      groupId: 'g1',
      turnSeq: 3,
      goal: '写个报告',
      speakers: twoSpeakers,
    });
    expect(p).toMatchObject({
      shift_id: 'chat:g1:3',
      from_agent: 'a2',
      to_agent: 'a1',
      scope_key: 'g1',
      task_type: 'chat_round',
    });
    expect(p!.summary).toContain('任务：写个报告');
    expect(p!.summary).toContain('Atlas：我先起草');
    expect(p!.summary).toContain('Nova：我复核完了');
  });

  it('autoLearnOff → null（settings.memory.autoLearn=false 关沉淀）', () => {
    expect(
      buildRoundHandoffPayload({
        groupId: 'g1',
        turnSeq: 3,
        goal: 'g',
        autoLearnOff: true,
        speakers: twoSpeakers,
      }),
    ).toBeNull();
  });

  it('空 excerpt 的 speaker 被过滤（过滤后 <2 → null）', () => {
    expect(
      buildRoundHandoffPayload({
        groupId: 'g1',
        turnSeq: 3,
        goal: 'g',
        speakers: [
          { id: 'a1', name: 'A', excerpt: '' },
          { id: 'a2', name: 'B', excerpt: 'y' },
        ],
      }),
    ).toBeNull();
  });

  it('goal 为空 → summary 跳过任务前缀但仍有产出行', () => {
    const p = buildRoundHandoffPayload({
      groupId: 'g1',
      turnSeq: 3,
      goal: '',
      speakers: twoSpeakers,
    });
    expect(p).not.toBeNull();
    expect(p!.summary.startsWith('任务：')).toBe(false);
    expect(p!.summary).toContain('Atlas');
  });

  it('summary 600 字截断（长产出不无限膨胀）', () => {
    const long = '啊'.repeat(500);
    const p = buildRoundHandoffPayload({
      groupId: 'g1',
      turnSeq: 3,
      goal: 'g',
      speakers: [
        { id: 'a1', name: 'A', excerpt: long },
        { id: 'a2', name: 'B', excerpt: long },
      ],
    });
    expect(p!.summary.length).toBeLessThanOrEqual(600);
  });
});
