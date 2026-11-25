/**
 * craft/profit 纯规则层单测：零 IO、不启 server、不碰磁盘。
 * 核心：盈利口径 + 报表边界规则。
 */

import { describe, it, expect } from 'vitest';
import {
  profitPerUnit,
  withProductProfit,
  withSaleProfit,
  parseCents,
  parseQty,
  parseDays,
  parseListLimit,
  pctDelta,
  share,
  buildOverview,
  buildTimeseries,
  startOfDay,
  CraftProfitError,
  DAY_MS,
  type Sums,
} from './profit-model';

const zeroSums: Sums = { sales_count: 0, units: 0, revenue_cents: 0, cost_cents: 0, shipping_cents: 0 };

describe('盈利口径（核心不变量）', () => {
  it('每件盈利 = 售价 − 成本 − 快递', () => {
    expect(profitPerUnit({ price_cents: 8900, cost_cents: 4200, shipping_cents: 800 })).toBe(3900);
  });

  it('商品附加字段', () => {
    const p = withProductProfit({ id: 'x', name: 'n', price_cents: 100, cost_cents: 30, shipping_cents: 10, created_at: 0 });
    expect(p.profit_per_unit_cents).toBe(60);
  });

  it('销售行附加字段 = 单件盈利 × 件数', () => {
    const s = withSaleProfit({ price_cents: 100, cost_cents: 30, shipping_cents: 10, qty: 3 });
    expect(s.profit_cents).toBe(180);
  });
});

describe('输入校验', () => {
  it('金额非负整数', () => {
    expect(parseCents(100, 'x')).toBe(100);
    expect(() => parseCents(-1, 'x')).toThrow(CraftProfitError);
    expect(() => parseCents(1.5, 'x')).toThrow(CraftProfitError);
  });

  it('数量 1..999', () => {
    expect(parseQty(3)).toBe(3);
    expect(() => parseQty(0)).toThrow();
    expect(() => parseQty(1000)).toThrow();
  });

  it('天数规整 1..365', () => {
    expect(parseDays(30)).toBe(30);
    expect(parseDays(0)).toBe(30);
    expect(parseDays(999)).toBe(365);
  });

  it('limit 规整', () => {
    expect(parseListLimit(10)).toBe(10);
    expect(parseListLimit(9999)).toBe(500);
    expect(parseListLimit(-1)).toBe(20);
  });
});

describe('报表边界规则', () => {
  it('环比：上期 0 本期 0 → 0；上期 0 本期>0 → null（新增）', () => {
    expect(pctDelta(0, 0)).toBe(0);
    expect(pctDelta(100, 0)).toBeNull();
  });

  it('环比：正常计算保留 1 位小数', () => {
    expect(pctDelta(150, 100)).toBe(50);
    expect(pctDelta(90, 100)).toBe(-10);
  });

  it('份额：总额 0 → 0（不画假 100%）', () => {
    expect(share(50, 0)).toBe(0);
    expect(share(25, 100)).toBe(25);
  });

  it('overview：盈利/毛利/每100/环比', () => {
    const cur: Sums = { sales_count: 2, units: 5, revenue_cents: 10000, cost_cents: 4000, shipping_cents: 1000 };
    const window = { from: 100, to: 200 };
    const o = buildOverview(30, window, cur, zeroSums);
    expect(o.profit_cents).toBe(5000);
    expect(o.margin_pct).toBe(50);
    expect(o.per100).toEqual({ cost: 40, shipping: 10, profit: 50 });
    expect(o.delta_pct.profit).toBeNull(); // 上期 0
  });

  it('overview：日期窗口透传', () => {
    const o = buildOverview(7, { from: 1, to: 2 }, zeroSums, zeroSums);
    expect(o.days).toBe(7);
    expect(o.window).toEqual({ from: 1, to: 2 });
  });
});

describe('趋势零点归桶', () => {
  it('startOfDay 归到本地零点', () => {
    const d = new Date(2026, 0, 15, 23, 30);
    expect(startOfDay(d.getTime())).toBe(new Date(2026, 0, 15, 0, 0, 0, 0).getTime());
  });

  it('凌晨的单算前一天', () => {
    const early = new Date(2026, 0, 15, 1, 0).getTime();
    expect(startOfDay(early)).toBe(new Date(2026, 0, 15, 0, 0, 0, 0).getTime());
  });

  it('零值补齐：空销售也生成每日序列', () => {
    const from = new Date(2026, 0, 1, 12).getTime();
    const to = new Date(2026, 0, 3, 12).getTime();
    const r = buildTimeseries(3, { from, to }, []);
    expect(r.series.length).toBeGreaterThanOrEqual(3);
    expect(r.series.every((p) => p.units === 0 && p.profit_cents === 0)).toBe(true);
  });

  it('销售按天聚合', () => {
    const day = new Date(2026, 0, 1, 15).getTime();
    const rows = [
      { qty: 2, price_cents: 100, cost_cents: 30, shipping_cents: 10, created_at: day },
      { qty: 1, price_cents: 100, cost_cents: 30, shipping_cents: 10, created_at: day + 1000 },
    ];
    const r = buildTimeseries(1, { from: day - DAY_MS, to: day + DAY_MS }, rows);
    const bucket = r.series.find((p) => p.day === startOfDay(day))!;
    expect(bucket.units).toBe(3);
    expect(bucket.profit_cents).toBe(180);
  });
});
