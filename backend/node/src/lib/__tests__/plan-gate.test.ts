/**
 * lib/__tests__/plan-gate.test.ts — T05① 计划确认门（存储/状态机/通知）。
 *
 * 用 SF_PLAN_GATE_PATH 指到 tmp 文件隔离，不碰仓库 .shadowflow/。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  registerPlan,
  decidePlan,
  getPlan,
  isPlanGateBlocking,
  planGateNotice,
} from '../plan-gate';

let tmpDir: string;
const OLD_ENV = process.env.SF_PLAN_GATE_PATH;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-plan-gate-test-'));
  process.env.SF_PLAN_GATE_PATH = path.join(tmpDir, 'plan-gate.json');
});

afterEach(() => {
  if (OLD_ENV === undefined) delete process.env.SF_PLAN_GATE_PATH;
  else process.env.SF_PLAN_GATE_PATH = OLD_ENV;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const NODES = [
  { id: 'n1', agentId: 'alpha', name: '策划', role: '出选题', acceptance: '选题清单 ≥3 条', risk: '选题撞车' },
  { id: 'n2', agentId: 'beta', name: '文案', role: '写正文', acceptance: '成稿 800 字', risk: '口吻不统一' },
];
const EDGES = [{ source: 'n1', target: 'n2', mode: 'direct' }];

describe('plan-gate registerPlan', () => {
  it('登记落 pending，plan_id 唯一，字段透传（含 acceptance/risk）', () => {
    const r = registerPlan('team-a', { prompt: ' 做一期手工银饰推广 ', nodes: NODES, edges: EDGES });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.status).toBe('pending');
    expect(r.plan.team_id).toBe('team-a');
    expect(r.plan.prompt).toBe('做一期手工银饰推广');
    expect(r.plan.nodes).toHaveLength(2);
    expect(r.plan.nodes[0].acceptance).toBe('选题清单 ≥3 条');
    expect(r.plan.nodes[1].risk).toBe('口吻不统一');
    expect(getPlan('team-a')?.plan_id).toBe(r.plan.plan_id);
  });

  it('再次登记替换旧计划且重新回 pending（确认过也要重确认）', () => {
    const first = registerPlan('team-a', { nodes: NODES, edges: EDGES });
    if (!first.ok) throw new Error('first register failed');
    decidePlan('team-a', 'confirm');
    const second = registerPlan('team-a', { nodes: NODES, edges: [] });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.plan.plan_id).not.toBe(first.plan.plan_id);
    expect(second.plan.status).toBe('pending');
    expect(second.plan.edges).toEqual([]);
  });

  it('轻校验：空节点 / 重复 id / 边引用未知节点 / 非法 team id → INVALID_PLAN', () => {
    expect(registerPlan('team-a', { nodes: [], edges: [] })).toMatchObject({ ok: false, code: 'INVALID_PLAN' });
    expect(
      registerPlan('team-a', { nodes: [{ id: 'n1' }, { id: 'n1' }], edges: [] }),
    ).toMatchObject({ ok: false, code: 'INVALID_PLAN' });
    expect(
      registerPlan('team-a', { nodes: [{ id: 'n1' }], edges: [{ source: 'n1', target: 'ghost', mode: 'direct' }] }),
    ).toMatchObject({ ok: false, code: 'INVALID_PLAN' });
    expect(registerPlan('../evil', { nodes: NODES, edges: [] })).toMatchObject({ ok: false, code: 'INVALID_PLAN' });
    // 失败不落盘
    expect(getPlan('team-a')).toBeNull();
  });

  it('文本字段 trim + 截断（prompt 500 / acceptance、risk 200），缺省省略', () => {
    const r = registerPlan('team-a', {
      prompt: 'x'.repeat(600),
      nodes: [{ id: 'n1', acceptance: 'a'.repeat(300), risk: '   ' }],
      edges: [],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.prompt).toHaveLength(500);
    expect(r.plan.nodes[0].acceptance).toHaveLength(200);
    expect(r.plan.nodes[0].risk).toBeUndefined();
  });

  it('mode 非法值回退 direct', () => {
    const r = registerPlan('team-a', {
      nodes: [{ id: 'n1' }, { id: 'n2' }],
      edges: [{ source: 'n1', target: 'n2', mode: 'weird' }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.edges[0].mode).toBe('direct');
  });
});

describe('plan-gate decidePlan', () => {
  it('confirm → confirmed；reject → rejected 且记原因（截 200）', () => {
    registerPlan('team-a', { nodes: NODES, edges: EDGES });
    const c = decidePlan('team-a', 'confirm');
    expect(c).toMatchObject({ ok: true, plan: { status: 'confirmed' } });

    registerPlan('team-b', { nodes: NODES, edges: EDGES });
    const r = decidePlan('team-b', 'reject', { reason: '  依赖顺序不对  ' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.status).toBe('rejected');
    expect(r.plan.reject_reason).toBe('依赖顺序不对');
    expect(typeof r.plan.decided_at).toBe('number');

    const long = decidePlan('team-b', 'reject', { reason: 'y'.repeat(300) });
    expect(long.ok).toBe(true);
    if (!long.ok) return;
    expect(long.plan.reject_reason).toHaveLength(200);
  });

  it('无计划 → NOT_FOUND；plan_id 过期 → STALE（不改状态）', () => {
    expect(decidePlan('ghost-team', 'confirm')).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    const r = registerPlan('team-a', { nodes: NODES, edges: [] });
    if (!r.ok) throw new Error('register failed');
    expect(decidePlan('team-a', 'confirm', { planId: 'stale-id' })).toMatchObject({ ok: false, code: 'STALE' });
    expect(getPlan('team-a')?.status).toBe('pending');
    expect(decidePlan('team-a', 'confirm', { planId: r.plan.plan_id })).toMatchObject({ ok: true });
  });
});

describe('plan-gate isPlanGateBlocking', () => {
  it('无计划放行；pending/rejected 拦；confirmed 放行', () => {
    expect(isPlanGateBlocking(null)).toBe(false);
    registerPlan('team-a', { nodes: NODES, edges: [] });
    expect(isPlanGateBlocking(getPlan('team-a'))).toBe(true);
    decidePlan('team-a', 'reject');
    expect(isPlanGateBlocking(getPlan('team-a'))).toBe(true);
    decidePlan('team-a', 'confirm');
    expect(isPlanGateBlocking(getPlan('team-a'))).toBe(false);
  });
});

describe('plan-gate planGateNotice', () => {
  it('五要素齐显：任务/负责人/依赖/交付标准/风险 + 确认指引', () => {
    registerPlan('team-a', { prompt: '推广手工银饰', nodes: NODES, edges: EDGES });
    const plan = getPlan('team-a');
    expect(plan).not.toBeNull();
    const msg = planGateNotice(plan!);
    expect(msg).toContain('任务：');
    expect(msg).toContain('策划');
    expect(msg).toContain('负责人：alpha');
    expect(msg).toContain('依赖：');
    expect(msg).toContain('策划 → 文案（direct）');
    expect(msg).toContain('交付标准：选题清单 ≥3 条');
    expect(msg).toContain('风险：口吻不统一');
    expect(msg).toContain('/api/teams/team-a/plan/confirm');
    expect(msg).toContain('不启动任何执行节点');
  });

  it('缺失字段显示「待补」不编造', () => {
    registerPlan('team-a', { nodes: [{ id: 'n1' }], edges: [] });
    const msg = planGateNotice(getPlan('team-a')!);
    expect(msg).toContain('负责人：待补');
    expect(msg).toContain('交付标准：待补');
    expect(msg).toContain('风险：待补');
    expect(msg).toContain('（无）');
  });

  it('rejected 计划的通知带「已被退回」', () => {
    registerPlan('team-a', { nodes: NODES, edges: [] });
    decidePlan('team-a', 'reject');
    expect(planGateNotice(getPlan('team-a')!)).toContain('已被退回');
  });
});
