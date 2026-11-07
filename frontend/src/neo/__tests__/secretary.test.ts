/**
 * secretary 落点收敛测试 — 2026-11-07 用户反馈「希望默认是进入 agent 单聊形式」。
 * 覆盖：默认落点 = 秘书 agent-target 单聊形态；home 导航（回首页/删会话兜底）
 * 一律重定向到秘书单聊，任何过渡帧都不再是 hero 首页；其余导航原样通过。
 */
import { describe, expect, it } from 'vitest';
import {
  SECRETARY_AGENT_ID,
  SECRETARY_NAME,
  redirectHomeToSecretary,
  secretaryTargetNav,
} from '../secretary';

describe('secretaryTargetNav — 默认落点即秘书单聊形态', () => {
  it('返回秘书 agent-target（中聊天框 + 右主机的目标态）', () => {
    expect(secretaryTargetNav()).toEqual({
      view: 'agent-target',
      agentId: SECRETARY_AGENT_ID,
      name: SECRETARY_NAME,
    });
  });
});

describe('redirectHomeToSecretary — home 导航收敛到秘书单聊', () => {
  it('home 重定向为秘书 agent-target', () => {
    expect(redirectHomeToSecretary({ view: 'home' })).toEqual(secretaryTargetNav());
  });

  it('会话导航原样通过（不抢屏）', () => {
    const conv = { view: 'conversation' as const, groupId: 'g1' };
    expect(redirectHomeToSecretary(conv)).toBe(conv);
  });

  it('内容页导航原样通过（知识库/看板/定时任务等）', () => {
    for (const next of [
      { view: 'knowledge' as const, sourceId: null },
      { view: 'dashboard' as const },
      { view: 'schedules' as const },
      { view: 'runs' as const },
      { view: 'clawhub' as const },
    ]) {
      expect(redirectHomeToSecretary(next)).toBe(next);
    }
  });

  it('其他 agent/团队目标态原样通过', () => {
    const agent = { view: 'agent-target' as const, agentId: 'a1', name: '设计助手' };
    const team = { view: 'team-target' as const, teamId: 't1', name: '增长小组' };
    expect(redirectHomeToSecretary(agent)).toBe(agent);
    expect(redirectHomeToSecretary(team)).toBe(team);
  });
});
