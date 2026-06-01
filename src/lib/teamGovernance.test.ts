/**
 * teamGovernance.test.ts — RACI 派生 + PolicyMatrix 派生 (2026-06-01).
 * 设计见 docs/architecture/team-governance-raci-policy-2026-06-01.md。
 */
import { describe, it, expect } from 'vitest';
import { deriveRaci, isAccountable, derivePolicyMatrix } from './teamGovernance';

describe('deriveRaci', () => {
  it('coordinator → gate=A, plan/approve=R', () => {
    const r = deriveRaci({ type: 'coordinator', title: '协调者' });
    expect(r.gate).toBe('A');
    expect(r.plan).toBe('R');
    expect(r.approve).toBe('R');
  });

  it('reviewer(标题/persona 含评审)→ review=R, approve=A', () => {
    const r = deriveRaci({ type: 'agent', title: '评审员', persona: 'critique reviewer' });
    expect(r.review).toBe('R');
    expect(r.approve).toBe('A');
  });

  it('普通 agent → draft=R;有工具则 tool=R', () => {
    const noTool = deriveRaci({ type: 'agent', title: '开发', toolsPicked: [] });
    expect(noTool.draft).toBe('R');
    expect(noTool.tool).toBe('C');
    const withTool = deriveRaci({ type: 'agent', title: '开发', toolsPicked: ['Bash'] });
    expect(withTool.tool).toBe('R');
  });

  it('已带 raci 时优先用它(不再现算),并过滤脏值', () => {
    const r = deriveRaci({ type: 'agent', raci: { plan: 'a', review: 'X', tool: 'R' } });
    expect(r.plan).toBe('A'); // 大小写归一
    expect(r.review).toBe('-'); // 非法值 → 无责
    expect(r.tool).toBe('R');
  });
});

describe('isAccountable', () => {
  it('任一职责是 A → true', () => {
    expect(isAccountable(deriveRaci({ type: 'coordinator' }))).toBe(true); // gate=A
    expect(isAccountable(deriveRaci({ type: 'agent', title: '开发', toolsPicked: [] }))).toBe(false);
  });
});

describe('derivePolicyMatrix — default deny / edge permit / A warn / coordinator permit', () => {
  const agents = [
    { id: 'co', isCoordinator: true, isAccountable: true },
    { id: 'a1', isCoordinator: false, isAccountable: false },
    { id: 'a2', isCoordinator: false, isAccountable: true }, // 拍板人
    { id: 'a3', isCoordinator: false, isAccountable: false },
  ];

  it('coordinator 收发一律 permit', () => {
    const m = derivePolicyMatrix(agents, []);
    expect(m['co']['a1']).toBe('permit');
    expect(m['a1']['co']).toBe('permit');
  });

  it('无声明边的非协调者交互 → deny', () => {
    const m = derivePolicyMatrix(agents, []);
    expect(m['a1']['a3']).toBe('deny');
    expect(m['a3']['a1']).toBe('deny');
  });

  it('有 DAG 边 → permit;边指向 A(拍板人)→ warn', () => {
    const m = derivePolicyMatrix(agents, [
      { from: 'a1', to: 'a3' }, // 普通 handoff
      { from: 'a1', to: 'a2' }, // 交到拍板人
    ]);
    expect(m['a1']['a3']).toBe('permit');
    expect(m['a1']['a2']).toBe('warn');
  });

  it('self(同 id)不产格子', () => {
    const m = derivePolicyMatrix(agents, []);
    expect(m['a1']['a1']).toBeUndefined();
  });
});
