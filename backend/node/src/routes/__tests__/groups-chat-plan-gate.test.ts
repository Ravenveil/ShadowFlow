/**
 * groups-chat-plan-gate.test.ts — T05① 计划确认门（runFanout 全局预检闸口）。
 *
 * 纯单元测试 planGateNoticeFor()（同 groups-chat-dag-branch 的 shouldRunTeamDag
 * 模式）：非寒暄 + 团队有未确认计划 → 拦截通知（五要素）；寒暄 / 无 team_id /
 * 无计划 / 已确认 → null 放行。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { planGateNoticeFor } from '../groups/groups-chat';
import { registerPlan, decidePlan } from '../../lib/plan-gate';

let tmpDir: string;
const OLD_ENV = process.env.SF_PLAN_GATE_PATH;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-plan-gate-chat-test-'));
  process.env.SF_PLAN_GATE_PATH = path.join(tmpDir, 'plan-gate.json');
});

afterEach(() => {
  if (OLD_ENV === undefined) delete process.env.SF_PLAN_GATE_PATH;
  else process.env.SF_PLAN_GATE_PATH = OLD_ENV;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const NODES = [
  { id: 'n1', agentId: 'alpha', name: '策划', acceptance: '选题 ≥3', risk: '撞车' },
  { id: 'n2', agentId: 'beta', name: '文案', acceptance: '成稿 800 字', risk: '口吻' },
];

describe('planGateNoticeFor — runFanout 预检闸口', () => {
  it('非寒暄 + pending 计划 → 返回拦截通知（五要素齐显）', () => {
    registerPlan('team-a', { prompt: '做一期推广', nodes: NODES, edges: [{ source: 'n1', target: 'n2', mode: 'direct' }] });
    const notice = planGateNoticeFor({ team_id: 'team-a' }, false);
    expect(notice).not.toBeNull();
    expect(notice).toContain('不启动任何执行节点');
    expect(notice).toContain('任务：');
    expect(notice).toContain('负责人：alpha');
    expect(notice).toContain('交付标准：成稿 800 字');
    expect(notice).toContain('风险：撞车');
    expect(notice).toContain('策划 → 文案（direct）');
  });

  it('rejected 计划也拦', () => {
    registerPlan('team-a', { nodes: NODES, edges: [] });
    decidePlan('team-a', 'reject');
    expect(planGateNoticeFor({ team_id: 'team-a' }, false)).not.toBeNull();
  });

  it('寒暄消息放行（casual 不走执行节点）', () => {
    registerPlan('team-a', { nodes: NODES, edges: [] });
    expect(planGateNoticeFor({ team_id: 'team-a' }, true)).toBeNull();
  });

  it('无 team_id / 无计划 / 已确认 → 放行', () => {
    expect(planGateNoticeFor({ team_id: undefined }, false)).toBeNull();
    expect(planGateNoticeFor({ team_id: 'team-ghost' }, false)).toBeNull();
    registerPlan('team-a', { nodes: NODES, edges: [] });
    decidePlan('team-a', 'confirm');
    expect(planGateNoticeFor({ team_id: 'team-a' }, false)).toBeNull();
  });
});
