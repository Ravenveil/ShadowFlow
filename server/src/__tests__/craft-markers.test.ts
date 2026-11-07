/**
 * craft-markers.test.ts — 代卖输出协议标记解析纯函数单测（2026-11-07）。
 * 全离线零 IO。Run: npx vitest run --project=server craft-markers
 */
import { describe, expect, it } from 'vitest';
import { parseCraftMarkers } from '../lib/craft-markers';

describe('parseCraftMarkers — 标记识别与剥除', () => {
  it('单行紧凑 JSON：解析动作且从 cleaned 剥掉', () => {
    const text = '我来登记商品。\n[intake] {"name":"苗绣杯垫","price":68,"artisan":30,"shipping":8,"marketing":5}\n已登记！';
    const r = parseCraftMarkers(text);
    expect(r.markers).toHaveLength(1);
    expect(r.markers[0]).toMatchObject({ tag: 'intake', ok: true });
    expect(r.actions[0]).toEqual({
      kind: 'intake',
      name: '苗绣杯垫',
      price_cents: 6800,
      artisan_cents: 3000,
      shipping_cents: 800,
      marketing_cents: 500,
    });
    expect(r.cleaned).toBe('我来登记商品。\n已登记！');
  });

  it('多行美化 JSON（花括号配平跨行）也能解析', () => {
    const text = '[order]\n{\n  "product": "手工编织篮",\n  "qty": 2\n}\n记好了。';
    const r = parseCraftMarkers(text);
    expect(r.actions[0]).toEqual({ kind: 'order', product: '手工编织篮', qty: 2 });
    expect(r.cleaned).toBe('记好了。');
  });

  it('[craft:xxx] 别名等价；金额可用 *_cents 直给', () => {
    const r = parseCraftMarkers('[craft:intake] {"name":"竹编灯","price_cents":12800}');
    expect(r.actions[0]).toMatchObject({ kind: 'intake', name: '竹编灯', price_cents: 12800 });
    expect(r.actions[0]).toMatchObject({ artisan_cents: 0, shipping_cents: 0, marketing_cents: 0 });
    expect(r.cleaned).toBe('');
  });

  it('金额元→分四舍五入；qty 缺省 1、非法 qty 报错并剥标记', () => {
    const r = parseCraftMarkers(
      '[ship] {"product":"竹编灯","tracking":"SF001"}\n[order] {"product":"竹编灯","qty":0}',
    );
    expect(r.actions[0]).toEqual({ kind: 'ship', product: '竹编灯', qty: 1, tracking: 'SF001' });
    expect(r.markers[1]).toMatchObject({ tag: 'order', ok: false });
    expect(r.markers[1].error).toMatch(/qty/);
    expect(r.cleaned).toBe('');
  });

  it('行中出现 [order] 不算标记（行首锚定）', () => {
    const text = '用 [order] 这个词举例 [ship] {"product":"x"} 后半句';
    const r = parseCraftMarkers(text);
    expect(r.markers).toHaveLength(0);
    expect(r.cleaned).toBe(text);
  });

  it('无配平 JSON 的行不算标记，正文保留', () => {
    const text = '[order] 是个英文词，别误伤。\n[intake] {"name": 没闭合';
    const r = parseCraftMarkers(text);
    expect(r.markers).toHaveLength(0);
    expect(r.cleaned).toBe(text);
  });

  it('字段非法：标记剥掉、ok=false 带错误（可见不静默）', () => {
    const r = parseCraftMarkers('[intake] {"price":10}\n正文');
    expect(r.markers[0]).toMatchObject({ tag: 'intake', ok: false });
    expect(r.markers[0].error).toMatch(/name/);
    expect(r.cleaned).toBe('正文');
  });

  it('多标记 + 正文混排：正文保留、空行归一', () => {
    const text =
      '收到产品资料。\n\n\n[post] {"platform":"小红书","title":"山里来的温柔"}\n[link] {"product":"苗绣杯垫","url":"https://x/1"}\n\n\n加油！';
    const r = parseCraftMarkers(text);
    expect(r.actions.map((a) => a.kind)).toEqual(['post', 'link']);
    expect(r.actions[0]).toMatchObject({ kind: 'post', platform: '小红书', title: '山里来的温柔' });
    expect(r.cleaned).toBe('收到产品资料。\n\n加油！');
  });

  it('report 摘要解析', () => {
    const r = parseCraftMarkers('[report] {"summary":"本周净利 ¥320"}');
    expect(r.actions[0]).toEqual({ kind: 'report', summary: '本周净利 ¥320' });
    expect(r.cleaned).toBe('');
  });
});
