import { describe, expect, it } from 'vitest';
import {
  alreadyShipped,
  canAdvanceTracking,
  checkReceiver,
  checkWeight,
  eventKey,
  normalizeMode,
  RANK,
  trimTo,
} from './shipping-model';

describe('运单状态机', () => {
  it('状态次序 pending < shipped < in_transit < delivered，failed 不参与', () => {
    expect(RANK.pending).toBe(0);
    expect(RANK.shipped).toBe(1);
    expect(RANK.in_transit).toBe(2);
    expect(RANK.delivered).toBe(3);
    expect(RANK.failed).toBeUndefined();
  });

  it('已有面单号且已到 shipped 及以上时禁止重复交运', () => {
    expect(alreadyShipped('shipped', 'SF123')).toBe(true);
    expect(alreadyShipped('delivered', 'SF123')).toBe(true);
    expect(alreadyShipped('pending', 'SF123')).toBe(false);
    expect(alreadyShipped('shipped', null)).toBe(false);
    expect(alreadyShipped('failed', 'SF123')).toBe(false);
  });

  it('轨迹只前进不回退，未定义状态不推进', () => {
    expect(canAdvanceTracking('shipped', 'in_transit')).toBe(true);
    expect(canAdvanceTracking('pending', 'delivered')).toBe(true);
    expect(canAdvanceTracking('in_transit', 'shipped')).toBe(false);
    expect(canAdvanceTracking('delivered', 'delivered')).toBe(false);
    expect(canAdvanceTracking('shipped', 'weird')).toBe(false);
    expect(canAdvanceTracking('failed', 'shipped')).toBe(true);
  });

  it('轨迹去重键用 NUL 分隔，避免拼接歧义', () => {
    expect(eventKey('shipped', 'abc')).toBe('shipped\u0000abc');
    expect(eventKey('ship', 'pedabc')).not.toBe(eventKey('shipped', 'abc'));
  });
});

describe('收件信息校验', () => {
  it('姓名必填', () => {
    const r = checkReceiver({ name: '', phone: '13800000000', address: '某某路 1 号 2 单元' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('INVALID_RECEIVER_NAME');
  });

  it('电话按数字位数算，至少 6 位（符号/空格不算）', () => {
    const short = checkReceiver({ name: '张三', phone: '+86 1-23', address: '某某路 1 号 2 单元' });
    expect(short.ok).toBe(false);
    if (!short.ok) expect(short.code).toBe('INVALID_RECEIVER_PHONE');

    const ok = checkReceiver({ name: '张三', phone: '+1 (415) 555-0123', address: '某某路 1 号 2 单元' });
    expect(ok.ok).toBe(true);
  });

  it('地址过短不寄', () => {
    const r = checkReceiver({ name: '张三', phone: '13800000000', address: '北京' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('INVALID_RECEIVER_ADDRESS');
  });
});

describe('运单输入规整', () => {
  it('重量非负，四舍五入到整克', () => {
    expect(checkWeight(undefined)).toEqual({ ok: true, grams: 0 });
    expect(checkWeight('12.6')).toEqual({ ok: true, grams: 13 });
    const bad = checkWeight(-1);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.code).toBe('INVALID_WEIGHT');
    expect(checkWeight('abc').ok).toBe(false);
  });

  it('只有 real 走真发，其余一律 mock（安全默认）', () => {
    expect(normalizeMode('real')).toBe('real');
    expect(normalizeMode('mock')).toBe('mock');
    expect(normalizeMode(undefined)).toBe('mock');
    expect(normalizeMode('REAL')).toBe('mock');
  });

  it('文本截断：非字符串当空串', () => {
    expect(trimTo('  abc  ', 10)).toBe('abc');
    expect(trimTo('abcdef', 3)).toBe('abc');
    expect(trimTo(123, 10)).toBe('');
  });
});
