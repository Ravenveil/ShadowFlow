/**
 * commerce/merchant 纯规则层单测：零 IO、不启 server、不碰磁盘。
 * 核心：营收/毛利/客单价口径 + 分桶边界。
 */

import { describe, it, expect } from 'vitest';
import {
  DAY_MS,
  HOUR_MS,
  bucketSize,
  dayStart,
  bucketKey,
  nextBucket,
  timeWindow,
  rangeWindow,
  rangeClause,
  pctDelta,
  buildOverviewCore,
  wantsCompare,
  conversionRate,
  parseCents,
  MerchantDomainError,
} from './merchant-model';

describe('核心口径（不变量）', () => {
  it('营收=income−refund，成本=expense，毛利=营收−成本', () => {
    const o = buildOverviewCore(
      { from: null, to: null },
      { income: 10000, refund: 2000, expense: 3000 },
      { total: 5, paid: 3, refunded: 1 },
    );
    expect(o.revenue_cents).toBe(8000);
    expect(o.cost_cents).toBe(3000);
    expect(o.gross_profit_cents).toBe(5000);
    expect(o.gross_margin_pct).toBe(62.5);
  });

  it('客单价=净营收/未退款成交单数（退款不进分母）', () => {
    const o = buildOverviewCore(
      { from: null, to: null },
      { income: 10000, refund: 2000, expense: 0 },
      { total: 5, paid: 2, refunded: 1 },
    );
    expect(o.paid_orders).toBe(2);
    expect(o.transacted_orders).toBe(3);
    expect(o.avg_order_cents).toBe(4000); // 8000/2，不是 8000/3
  });

  it('无营收时毛利率 null、客单价 0（不编造）', () => {
    const o = buildOverviewCore(
      { from: null, to: null },
      { income: 0, refund: 0, expense: 100 },
      { total: 1, paid: 0, refunded: 0 },
    );
    expect(o.gross_margin_pct).toBeNull();
    expect(o.avg_order_cents).toBe(0);
  });

  it('环比：上期 0 → 0/null', () => {
    expect(pctDelta(0, 0)).toBe(0);
    expect(pctDelta(100, 0)).toBeNull();
    expect(pctDelta(150, 100)).toBe(50);
  });
});

describe('分桶规则', () => {
  it('bucketSize 映射', () => {
    expect(bucketSize('15m')).toBe(15 * 60 * 1000);
    expect(bucketSize('hour')).toBe(HOUR_MS);
    expect(bucketSize('day')).toBe(DAY_MS);
    expect(bucketSize('x')).toBe(DAY_MS);
  });

  it('dayStart 本地零点', () => {
    const d = new Date(2026, 5, 15, 14, 30);
    expect(dayStart(d.getTime())).toBe(new Date(2026, 5, 15).getTime());
  });

  it('bucketKey day 用本地零点，hour 按 epoch 整除', () => {
    const ts = new Date(2026, 5, 15, 14, 37).getTime();
    expect(bucketKey(ts, DAY_MS)).toBe(new Date(2026, 5, 15).getTime());
    expect(bucketKey(ts, HOUR_MS)).toBe(Math.floor(ts / HOUR_MS) * HOUR_MS);
  });

  it('nextBucket day 走 dayStart', () => {
    const key = new Date(2026, 5, 15).getTime();
    expect(nextBucket(key, DAY_MS)).toBe(new Date(2026, 5, 16).getTime());
  });

  it('timeWindow 校验：start>=end 抛错', () => {
    const now = () => new Date(2026, 5, 15, 12).getTime();
    expect(() => timeWindow('2026-06-15T13:00:00', undefined, 'day', now)).toThrow(MerchantDomainError);
  });

  it('timeWindow 桶数上限', () => {
    const now = () => new Date(2026, 5, 15).getTime();
    expect(() => timeWindow('2020-01-01', '2026-06-15', '15m', now)).toThrow(MerchantDomainError);
  });
});

describe('区间与工具', () => {
  it('rangeWindow：不给全量 null', () => {
    expect(rangeWindow(undefined, undefined)).toEqual({ from: null, to: null });
  });

  it('rangeWindow：纯数字当毫秒，start>=end 抛错', () => {
    expect(rangeWindow('1000', '2000')).toEqual({ from: 1000, to: 2000 });
    expect(() => rangeWindow('2000', '1000')).toThrow();
  });

  it('rangeClause 拼 WHERE + 参数顺序', () => {
    const params: unknown[] = [];
    const sql = rangeClause('created_at', 100, 200, params);
    expect(sql).toBe(' AND created_at >= ? AND created_at < ?');
    expect(params).toEqual([100, 200]);
  });

  it('wantsCompare 多形态', () => {
    expect(wantsCompare(1)).toBe(true);
    expect(wantsCompare('true')).toBe(true);
    expect(wantsCompare(0)).toBe(false);
  });

  it('conversionRate uv=0 时 0', () => {
    expect(conversionRate(5, 0)).toBe(0);
    expect(conversionRate(1, 4)).toBe(25);
  });

  it('parseCents 非负整数', () => {
    expect(parseCents(100, 'x')).toBe(100);
    expect(() => parseCents(-1, 'x')).toThrow(MerchantDomainError);
  });
});
