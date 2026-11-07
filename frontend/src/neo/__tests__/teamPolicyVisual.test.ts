/**
 * teamPolicyVisual — 策略矩阵 ↔ DAG 边/节点染色纯函数测试（2026-11-06）。
 */
import { describe, expect, it } from 'vitest';
import {
  POLICY_COLOR,
  POLICY_RANK,
  buildAgentPolicyColor,
  buildPairPolicyColor,
  edgeVisualFor,
  lookupPairPolicy,
  policyPairKey,
} from '../projections/teamPolicyVisual';

describe('policyPairKey — 无向对键', () => {
  it('排序拼接，双向同键', () => {
    expect(policyPairKey('b', 'a')).toBe(policyPairKey('a', 'b'));
    expect(policyPairKey('a', 'b')).toBe('a|b');
  });
});

describe('buildPairPolicyColor — 矩阵 → 成员对染色表', () => {
  it('收录显式配置的对；同对双向配置取更严', () => {
    const m = {
      a1: { a2: 'permit' },
      a2: { a1: 'deny' }, // 与上一行同对（反向），取更严 deny
      a3: { a3: 'deny' }, // 自环忽略
      a4: { a5: 'bogus' as unknown as string }, // 未知值忽略
    };
    const map = buildPairPolicyColor(m);
    expect(map.get(policyPairKey('a1', 'a2'))).toBe('deny');
    expect(map.size).toBe(1);
  });

  it('null/undefined/空矩阵 → 空 map', () => {
    expect(buildPairPolicyColor(null).size).toBe(0);
    expect(buildPairPolicyColor(undefined).size).toBe(0);
    expect(buildPairPolicyColor({}).size).toBe(0);
  });
});

describe('lookupPairPolicy — 成员对查询', () => {
  it('双向同键命中；未配置返回 null；自环/空入参返回 null', () => {
    const pair = buildPairPolicyColor({ x: { y: 'warn' } });
    expect(lookupPairPolicy(pair, 'x', 'y')).toBe('warn');
    expect(lookupPairPolicy(pair, 'y', 'x')).toBe('warn');
    expect(lookupPairPolicy(pair, 'x', 'z')).toBeNull();
    expect(lookupPairPolicy(pair, 'x', 'x')).toBeNull();
    expect(lookupPairPolicy(null, 'x', 'y')).toBeNull();
  });
});

describe('buildAgentPolicyColor — agent 维度最严态（自 TeamPanel 迁入）', () => {
  it('双向聚合取更严；自环忽略', () => {
    const map = buildAgentPolicyColor({ a: { b: 'warn' }, c: { a: 'deny' } });
    expect(map.get('a')).toBe('deny');
    expect(map.get('b')).toBe('warn');
    expect(map.get('c')).toBe('deny');
    expect(map.has('d')).toBe(false);
  });

  it('null → 空 map', () => {
    expect(buildAgentPolicyColor(null).size).toBe(0);
  });
});

describe('edgeVisualFor — mode × 策略 → 边视觉', () => {
  it('有策略时策略色优先：permit 绿 / warn 琥珀 / deny 红加粗', () => {
    expect(edgeVisualFor('direct', 'permit', 'APPROVE_CLS')).toEqual({
      style: { stroke: POLICY_COLOR.permit, strokeWidth: 1.8 },
    });
    expect(edgeVisualFor('direct', 'warn', 'APPROVE_CLS')).toEqual({
      style: { stroke: POLICY_COLOR.warn, strokeWidth: 1.8 },
    });
    expect(edgeVisualFor('direct', 'deny', 'APPROVE_CLS')).toEqual({
      style: { stroke: POLICY_COLOR.deny, strokeWidth: 2.4 },
    });
  });

  it('策略 + approve：虚线 className 保留，颜色随策略', () => {
    const v = edgeVisualFor('approve', 'deny', 'APPROVE_CLS');
    expect(v.className).toBe('APPROVE_CLS');
    expect(v.style?.stroke).toBe(POLICY_COLOR.deny);
  });

  it('无策略沿用 mode 视觉：approve 警示虚线 / conditional 强调虚线 / direct 默认', () => {
    const a = edgeVisualFor('approve', null, 'APPROVE_CLS', 'COND_CLS');
    expect(a.className).toBe('APPROVE_CLS');
    expect(a.style?.stroke).toContain('--t-warn');

    const c = edgeVisualFor('conditional', null, 'APPROVE_CLS', 'COND_CLS');
    expect(c.className).toBe('COND_CLS');
    expect(c.style?.stroke).toContain('--t-accent');

    expect(edgeVisualFor('direct', null, 'APPROVE_CLS', 'COND_CLS')).toEqual({});
    expect(edgeVisualFor('conditional', null, 'APPROVE_CLS')).toEqual({});
  });

  it('POLICY_RANK 严格序：deny > warn > permit', () => {
    expect(POLICY_RANK.deny).toBeGreaterThan(POLICY_RANK.warn);
    expect(POLICY_RANK.warn).toBeGreaterThan(POLICY_RANK.permit);
  });
});
