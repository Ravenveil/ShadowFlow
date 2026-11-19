import { describe, expect, it } from 'vitest';
import {
  addToBucket,
  bucketByDay,
  emptyBucket,
  estimateCostUsd,
  normalizeDimension,
  normalizeDurationMs,
  normalizeLimit,
  normalizeTokens,
  parsePriceTable,
  startOfDay,
} from './usage-model';

describe('成本估算口径', () => {
  const table = { 'gpt-x': { input: 3, output: 15 } };

  it('按每百万 token 单价线性折算', () => {
    expect(estimateCostUsd(1_000_000, 0, 'gpt-x', table)).toBeCloseTo(3, 6);
    expect(estimateCostUsd(0, 1_000_000, 'gpt-x', table)).toBeCloseTo(15, 6);
    expect(estimateCostUsd(500_000, 200_000, 'gpt-x', table)).toBeCloseTo(1.5 + 3, 6);
  });

  it('表里没有该模型 → 0（宁可少算不虚报）', () => {
    expect(estimateCostUsd(1000, 1000, 'unknown', table)).toBe(0);
    expect(estimateCostUsd(1000, 1000, 'gpt-x', undefined)).toBe(0);
  });

  it('零 token → 0', () => {
    expect(estimateCostUsd(0, 0, 'gpt-x', table)).toBe(0);
  });
});

describe('单价表解析', () => {
  it('只收 input/output 都是有限数字的条目', () => {
    const parsed = parsePriceTable({
      a: { input: 1, output: 2 },
      b: { input: '1', output: 2 },
      c: { input: 1 },
      d: null,
      e: { input: Infinity, output: 2 },
    });
    expect(parsed).toEqual({ a: { input: 1, output: 2 } });
  });

  it('无有效条目 → undefined', () => {
    expect(parsePriceTable(null)).toBeUndefined();
    expect(parsePriceTable('nope')).toBeUndefined();
    expect(parsePriceTable({})).toBeUndefined();
    expect(parsePriceTable({ x: { foo: 1 } })).toBeUndefined();
  });
});

describe('数值规整', () => {
  it('token 数非数/负数归 0，四舍五入', () => {
    expect(normalizeTokens(undefined)).toBe(0);
    expect(normalizeTokens('abc')).toBe(0);
    expect(normalizeTokens(-5)).toBe(0);
    expect(normalizeTokens(12.6)).toBe(13);
    expect(normalizeTokens('42')).toBe(42);
  });

  it('耗时同口径', () => {
    expect(normalizeDurationMs(undefined)).toBe(0);
    expect(normalizeDurationMs(-1)).toBe(0);
    expect(normalizeDurationMs(99.4)).toBe(99);
  });

  it('TopN 条数：非法回退默认，超上限截断', () => {
    expect(normalizeLimit(undefined)).toBe(10);
    expect(normalizeLimit(0)).toBe(10);
    expect(normalizeLimit(-3)).toBe(10);
    expect(normalizeLimit(5)).toBe(5);
    expect(normalizeLimit(10000)).toBe(200);
  });
});

describe('维度白名单', () => {
  it('白名单内原样，其余一律 model（防注入列名）', () => {
    expect(normalizeDimension('agent_id')).toBe('agent_id');
    expect(normalizeDimension('project_id')).toBe('project_id');
    expect(normalizeDimension('model')).toBe('model');
    expect(normalizeDimension('ts; DROP TABLE')).toBe('model');
    expect(normalizeDimension('')).toBe('model');
  });
});

describe('按天分桶', () => {
  it('本地零点归桶并累加', () => {
    const base = new Date(2026, 10, 19, 10, 0, 0).getTime();
    const later = new Date(2026, 10, 19, 23, 30, 0).getTime();
    const nextDay = new Date(2026, 10, 20, 1, 0, 0).getTime();
    const out = bucketByDay([
      { ts: base, input_tokens: 10, output_tokens: 5, cost_est_usd: 0.01 },
      { ts: later, input_tokens: 20, output_tokens: 5, cost_est_usd: 0.02 },
      { ts: nextDay, input_tokens: 1, output_tokens: 1, cost_est_usd: 0.5 },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].calls).toBe(2);
    expect(out[0].input_tokens).toBe(30);
    expect(out[0].cost_est_usd).toBeCloseTo(0.03, 6);
    expect(out[1].calls).toBe(1);
    expect(out[0].day).toBeLessThan(out[1].day);
  });

  it('空输入 → 空数组', () => {
    expect(bucketByDay([])).toEqual([]);
  });

  it('startOfDay 落在本地零点', () => {
    const noon = new Date(2026, 0, 15, 12, 34, 56).getTime();
    const start = new Date(startOfDay(noon));
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getDate()).toBe(15);
  });

  it('桶累加是纯函数', () => {
    const b = emptyBucket();
    const n = addToBucket(b, { input_tokens: 1, output_tokens: 2, cost_est_usd: 3 });
    expect(b).toEqual({ calls: 0, input_tokens: 0, output_tokens: 0, cost_est_usd: 0 });
    expect(n).toEqual({ calls: 1, input_tokens: 1, output_tokens: 2, cost_est_usd: 3 });
  });
});
