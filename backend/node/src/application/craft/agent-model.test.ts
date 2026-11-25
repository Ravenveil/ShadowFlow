/**
 * craft/agent 纯规则层单测：零 IO、不启 server、不碰磁盘。
 */

import { describe, it, expect } from 'vitest';
import {
  readAutoOpsConfig,
  normalizeAutoOpsInput,
  pickIndex,
  promoteCount,
  orderCount,
  unitsPerOrder,
  revenueText,
  AgentRoundError,
} from './agent-model';

describe('自动模式配置', () => {
  it('读配置：enabled 严格布尔，interval 非法回退 30', () => {
    expect(readAutoOpsConfig(undefined)).toEqual({ enabled: false, interval_min: 30 });
    expect(readAutoOpsConfig({ enabled: true, interval_min: 5 })).toEqual({ enabled: true, interval_min: 5 });
    expect(readAutoOpsConfig({ enabled: 'yes', interval_min: 0 })).toEqual({ enabled: false, interval_min: 30 });
  });

  it('interval 合法范围 1..1440，否则抛错', () => {
    const cur = { enabled: false, interval_min: 30 };
    expect(normalizeAutoOpsInput({ interval_min: 60 }, cur).interval_min).toBe(60);
    expect(() => normalizeAutoOpsInput({ interval_min: 0 }, cur)).toThrow(AgentRoundError);
    expect(() => normalizeAutoOpsInput({ interval_min: 1441 }, cur)).toThrow(AgentRoundError);
  });

  it('enabled 缺省沿用当前值', () => {
    const cur = { enabled: true, interval_min: 30 };
    expect(normalizeAutoOpsInput({}, cur).enabled).toBe(true);
    expect(normalizeAutoOpsInput({ enabled: false }, cur).enabled).toBe(false);
  });
});

describe('轮次参数规则（注入 rand 可复现）', () => {
  it('pickIndex 映射并钳位', () => {
    expect(pickIndex(() => 0, 5)).toBe(0);
    expect(pickIndex(() => 0.99, 5)).toBe(4);
  });

  it('promoteCount 1..2', () => {
    expect(promoteCount(() => 0)).toBe(1);
    expect(promoteCount(() => 0.9)).toBe(2);
  });

  it('orderCount 0..3', () => {
    expect(orderCount(() => 0)).toBe(0);
    expect(orderCount(() => 0.99)).toBe(3);
  });

  it('unitsPerOrder 1..3', () => {
    expect(unitsPerOrder(() => 0)).toBe(1);
    expect(unitsPerOrder(() => 0.99)).toBe(3);
  });

  it('入账金额文案', () => {
    expect(revenueText(8900, 2)).toBe('¥178.00');
    expect(revenueText(4500, 1)).toBe('¥45.00');
  });
});
