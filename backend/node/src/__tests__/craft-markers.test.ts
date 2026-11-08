/**
 * craft-markers.test.ts — 代卖输出协议标记解析纯函数单测（2026-11-07）。
 * 全离线零 IO。Run: npx vitest run --project=server craft-markers
 */
import { describe, expect, it } from 'vitest';
import { parseCraftMarkers } from '../lib/craft-markers';

describe('parseCraftMarkers — 标记识别与剥除', () => {
  it('单行紧凑 JSON：解析动作且从 cleaned 剥掉', () => {
    const text = '我来登记商品。\n[intake] {"name":"苗绣杯垫","price":68,"cost":20,"shipping":8}\n已登记！';
    const r = parseCraftMarkers(text);
    expect(r.markers).toHaveLength(1);
    expect(r.markers[0]).toMatchObject({ tag: 'intake', ok: true });
    expect(r.actions[0]).toEqual({
      kind: 'intake',
      name: '苗绣杯垫',
      price_cents: 6800,
      cost_cents: 2000,
      shipping_cents: 800,
    });
    expect(r.cleaned).toBe('我来登记商品。\n已登记！');
  });

  it('旧格式 artisan/marketing 兜底（口径切换前存量消息）：artisan 当成本、marketing 忽略', () => {
    const r = parseCraftMarkers(
      '[intake] {"name":"苗绣杯垫","price":68,"artisan":30,"shipping":8,"marketing":5}',
    );
    expect(r.actions[0]).toEqual({
      kind: 'intake',
      name: '苗绣杯垫',
      price_cents: 6800,
      cost_cents: 3000,
      shipping_cents: 800,
    });
    expect(r.cleaned).toBe('');
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
    expect(r.actions[0]).toMatchObject({ cost_cents: 0, shipping_cents: 0 });
    expect(r.cleaned).toBe('');
  });

  it('金额元→分四舍五入；qty 缺省 1、非法 qty 报错并剥标记', () => {
    const r = parseCraftMarkers(
      '[ship] {"product":"竹编灯","tracking":"SF001"}\n[order] {"product":"竹编灯","qty":0}',
    );
    expect(r.actions[0]).toEqual({
      kind: 'ship',
      product: '竹编灯',
      qty: 1,
      tracking: 'SF001',
      receiver_name: '',
      receiver_phone: '',
      receiver_address: '',
    });
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

describe('parseCraftMarkers — build-team / dispatch（总经理主控）', () => {
  it('[build-team] {} → 建团队动作并剥标记', () => {
    const r = parseCraftMarkers('我来搭建团队。\n[build-team] {}\n搭好了。');
    expect(r.markers[0]).toMatchObject({ tag: 'build-team', ok: true });
    expect(r.actions[0]).toEqual({ kind: 'build-team' });
    expect(r.cleaned).toBe('我来搭建团队。\n搭好了。');
  });

  it('[dispatch] to 字符串（、分隔）→ 成员名数组；@ 前缀剥掉', () => {
    const r = parseCraftMarkers(
      '[dispatch] {"to":"@营销专员、订单管家","text":"发帖推广并盯单"}',
    );
    expect(r.actions[0]).toEqual({
      kind: 'dispatch',
      to: ['营销专员', '订单管家'],
      text: '发帖推广并盯单',
    });
    expect(r.cleaned).toBe('');
  });

  it('[dispatch] to 数组同样合法；缺 to/text 报错并剥标记', () => {
    const ok = parseCraftMarkers('[dispatch] {"to":["快递联络员"],"text":"上门取件"}');
    expect(ok.actions[0]).toEqual({ kind: 'dispatch', to: ['快递联络员'], text: '上门取件' });
    const noTo = parseCraftMarkers('[dispatch] {"text":"没有对象"}\n正文');
    expect(noTo.markers[0]).toMatchObject({ tag: 'dispatch', ok: false });
    expect(noTo.markers[0].error).toMatch(/to/);
    const noText = parseCraftMarkers('[dispatch] {"to":"营销专员"}\n正文');
    expect(noText.markers[0]).toMatchObject({ tag: 'dispatch', ok: false });
    expect(noText.markers[0].error).toMatch(/text/);
    expect(noTo.cleaned).toBe('正文');
    expect(noText.cleaned).toBe('正文');
  });
});

// ── [post] media 协议扩展（2026-11-08）：craft_posts.images 同构，上限 18 ──

describe('[post] media 随帖媒体（可选载荷，零回归）', () => {
  it('旧标记不带 media → media 归一 []（字段形状不变）', () => {
    const r = parseCraftMarkers('[post] {"platform":"小红书","title":"山里来的温柔","text":"…"}');
    expect(r.actions[0]).toEqual({
      kind: 'post',
      platform: '小红书',
      title: '山里来的温柔',
      text: '…',
      media: [],
    });
  });

  it('对象项 {name,path,url,is_image} 同构透传；字符串项按路径简写', () => {
    const r = parseCraftMarkers(
      '[post] {"title":"T","text":"B","media":[' +
        '{"name":"苗绣.jpg","path":"C:/tmp/a.jpg","url":"/files/a.jpg","is_image":true},' +
        '{"path":"C:/tmp/b.jpg"},' +
        '"C:/tmp/c.jpg"]}',
    );
    expect((r.actions[0] as { media: unknown[] }).media).toEqual([
      { name: '苗绣.jpg', path: 'C:/tmp/a.jpg', url: '/files/a.jpg', is_image: true },
      { name: 'b.jpg', path: 'C:/tmp/b.jpg', url: '', is_image: true },
      { name: 'c.jpg', path: 'C:/tmp/c.jpg', url: '', is_image: true },
    ]);
  });

  it('上限 18 项；path/url 皆空或类型不合法的项跳过（fail-soft 不炸整条标记）', () => {
    const items = Array.from(
      { length: 20 },
      (_, i) => `{"name":"p${i}","path":"C:/tmp/${i}.jpg","url":"","is_image":true}`,
    ).join(',');
    const r = parseCraftMarkers(`[post] {"title":"T","text":"B","media":[${items}]}`);
    expect(r.markers[0]).toMatchObject({ tag: 'post', ok: true });
    expect((r.actions[0] as { media: unknown[] }).media).toHaveLength(18);

    const skip = parseCraftMarkers(
      '[post] {"title":"T","text":"B","media":[{"name":"空"},{"url":"x","is_image":false},123,"C:/ok.jpg"]}',
    );
    expect((skip.actions[0] as { media: unknown[] }).media).toEqual([
      { name: 'x', path: '', url: 'x', is_image: false },
      { name: 'ok.jpg', path: 'C:/ok.jpg', url: '', is_image: true },
    ]);
  });
});

// ── [draft] 商品字段占位词（2026-11-08 防编造：「待确认」不废稿）─────────────

describe('[draft] 商品字段占位词归一（防编造）', () => {
  it('占位词金额归 0、占位词商品名归空（确认面显示「待确认」）', () => {
    const r = parseCraftMarkers(
      '[draft] {"title":"T","body":"B","product_name":"待确认","price":"待确认","cost":"未知","shipping":"暂无"}',
    );
    expect(r.markers[0]).toMatchObject({ tag: 'draft', ok: true });
    expect(r.actions[0]).toEqual({
      kind: 'draft',
      title: 'T',
      body: 'B',
      topics: [],
      product_name: '',
      price_cents: 0,
      cost_cents: 0,
      shipping_cents: 0,
      images: [],
    });
  });

  it('数字/字符串数字/缺省零回归；乱写与负数仍报错（协议违规要可见）', () => {
    const ok = parseCraftMarkers(
      '[draft] {"title":"T","body":"B","price":"68","cost_cents":2500}',
    );
    expect(ok.actions[0]).toMatchObject({
      price_cents: 6800,
      cost_cents: 2500,
      shipping_cents: 0,
    });
    const bad = parseCraftMarkers('[draft] {"title":"T","body":"B","price":"abc"}');
    expect(bad.markers[0]!.ok).toBe(false);
    expect(bad.markers[0]!.error).toMatch(/金额/);
    const neg = parseCraftMarkers('[draft] {"title":"T","body":"B","price":-1}');
    expect(neg.markers[0]!.ok).toBe(false);
    expect(neg.markers[0]!.error).toMatch(/金额/);
  });

  it('intake 登记口径不变：占位词在 intake 仍报错（真实登记不许糊弄）', () => {
    const r = parseCraftMarkers('[intake] {"name":"杯垫","price":"待确认","cost":20,"shipping":8}');
    expect(r.markers[0]!.ok).toBe(false);
    expect(r.markers[0]!.error).toMatch(/金额/);
  });
});
