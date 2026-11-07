/**
 * chat-dag/__tests__/run-team-dag-plan-gate.test.ts — T05① 计划确认门
 * （执行器兜底层）。
 *
 * 通过标准（T05）：未确认前无执行节点启动。断言 callAgent 零调用 ——
 * 一个执行节点都没起，而不是"跑完再拦"。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runTeamDagFanout, type RunTeamDagDeps, type UpstreamMsg } from '../run-team-dag';
import type { TeamRunShape } from '../../team-source';
import { registerPlan, decidePlan, type PlanGateRecord } from '../../plan-gate';

let tmpDir: string;
const OLD_ENV = process.env.SF_PLAN_GATE_PATH;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-plan-gate-dag-test-'));
  process.env.SF_PLAN_GATE_PATH = path.join(tmpDir, 'plan-gate.json');
});

afterEach(() => {
  if (OLD_ENV === undefined) delete process.env.SF_PLAN_GATE_PATH;
  else process.env.SF_PLAN_GATE_PATH = OLD_ENV;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function mkDeps(over: Partial<RunTeamDagDeps> = {}) {
  const callOrder: string[] = [];
  const posted: { content: string; sender_kind: string }[] = [];
  const deps: RunTeamDagDeps & { callOrder: string[]; posted: typeof posted } = {
    getAgent: vi.fn(async (id: string) => ({ name: id.toUpperCase(), soul: `soul-${id}` })),
    callAgent: vi.fn(async ({ agentId, upstream }: { agentId: string; name: string; soul: string; upstream: UpstreamMsg[]; signal: AbortSignal }) => {
      callOrder.push(agentId);
      return { text: `${agentId}:ok` };
    }),
    postMessage: vi.fn(async (m: { content: string; sender_name: string; sender_kind: 'agent' | 'system'; agent_id?: string }) => {
      posted.push({ content: m.content, sender_kind: m.sender_kind });
    }),
    callOrder,
    posted,
    ...over,
  };
  return deps;
}

const PLAN_NODES = [
  { id: 'n1', agentId: 'pm', name: '策划', acceptance: '选题 ≥3', risk: '撞车' },
  { id: 'n2', agentId: 'dev', name: '执行', acceptance: '落地 1 期', risk: '延期' },
];
const PLAN_EDGES = [{ source: 'n1', target: 'n2', mode: 'direct' }];

const team: TeamRunShape = {
  team_id: 'team-gate',
  members: ['pm', 'dev'],
  edges: [{ from: 'pm', to: 'dev', kind: 'sequential' }],
  policy_matrix: {},
};

describe('runTeamDagFanout — T05① 计划确认门', () => {
  it('pending 计划：零执行节点启动（callAgent/postMessage 零调用）+ 回调交出计划', async () => {
    registerPlan('team-gate', { prompt: '做一期推广', nodes: PLAN_NODES, edges: PLAN_EDGES });
    const seen: PlanGateRecord[] = [];
    const deps = mkDeps({ onPlanBlocked: (p) => seen.push(p) });
    const r = await runTeamDagFanout(team, deps, 'go');
    expect(r.planBlocked).toBe(true);
    expect(r.ranLayers).toBe(0);
    expect(r.perAgent).toEqual({});
    expect(deps.callOrder).toEqual([]);
    expect((deps.callAgent as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
    expect((deps.postMessage as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
    expect(seen).toHaveLength(1);
    expect(seen[0].status).toBe('pending');
  });

  it('rejected 计划同样拦（未确认即不执行）', async () => {
    registerPlan('team-gate', { nodes: PLAN_NODES, edges: PLAN_EDGES });
    decidePlan('team-gate', 'reject', { reason: '依赖不对' });
    const deps = mkDeps();
    const r = await runTeamDagFanout(team, deps, 'go');
    expect(r.planBlocked).toBe(true);
    expect(deps.callOrder).toEqual([]);
  });

  it('confirmed 计划放行：照常按层序执行', async () => {
    registerPlan('team-gate', { nodes: PLAN_NODES, edges: PLAN_EDGES });
    decidePlan('team-gate', 'confirm');
    const deps = mkDeps();
    const r = await runTeamDagFanout(team, deps, 'go');
    expect(r.planBlocked).toBeUndefined();
    expect(deps.callOrder).toEqual(['pm', 'dev']);
  });

  it('无计划记录：零回归照常执行', async () => {
    const deps = mkDeps();
    const r = await runTeamDagFanout(team, deps, 'go');
    expect(r.planBlocked).toBeUndefined();
    expect(deps.callOrder).toEqual(['pm', 'dev']);
  });

  it('team_id 缺失的团队不受门影响（零回归）', async () => {
    const noId: TeamRunShape = { members: ['pm', 'dev'], edges: team.edges, policy_matrix: {} };
    const deps = mkDeps();
    const r = await runTeamDagFanout(noId, deps, 'go');
    expect(r.planBlocked).toBeUndefined();
    expect(deps.callOrder).toEqual(['pm', 'dev']);
  });

  it('新计划登记会重新武装：确认过又生成新计划 → 再拦', async () => {
    registerPlan('team-gate', { nodes: PLAN_NODES, edges: PLAN_EDGES });
    decidePlan('team-gate', 'confirm');
    registerPlan('team-gate', { nodes: PLAN_NODES, edges: PLAN_EDGES });
    const deps = mkDeps();
    const r = await runTeamDagFanout(team, deps, 'go');
    expect(r.planBlocked).toBe(true);
    expect(deps.callOrder).toEqual([]);
  });
});
