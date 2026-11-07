/**
 * craft-intake.test.ts — 代卖业务落库胶水契约测试（2026-11-07）。
 *
 * 覆盖：
 *   - applyCraftMarkers 作用域（非代卖群 no-op 原文返回）；
 *   - 全流程 transcript（CEO 上架 → 营销发帖/上链接 → 订单出单 → 快递寄出
 *     → 财务汇报）落库：商品/销售/运营动态/盈利口径齐全、文本剥标记；
 *   - 未上架商品出单 → 可见失败不抛；
 *   - isCraftGroup settings 引用匹配；
 *   - ingestProductMaterial 自动同步知识库（fetch 注入断言 pack 复用/去重
 *     路径/短消息跳过/fail-soft）。
 * 真实 SQLite（临时 cwd 隔离），记忆库 HTTP 用注入 fetch 假件。
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

let tmp: string;
let origCwd: string;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let intake: typeof import('../storage/craft-intake');
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let profit: typeof import('../storage/craft-profit');
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let settings: typeof import('../storage/settings');
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let sqlite: typeof import('../storage/sqlite');

beforeAll(async () => {
  origCwd = process.cwd();
  tmp = mkdtempSync(path.join(tmpdir(), 'sf-craft-intake-'));
  process.chdir(tmp);
  sqlite = await import('../storage/sqlite');
  sqlite._resetForTests();
  profit = await import('../storage/craft-profit');
  intake = await import('../storage/craft-intake');
  settings = await import('../storage/settings');
  sqlite.getDb();
  profit.listProducts(); // 触发 cp_* 懒建表
});

afterAll(() => {
  sqlite._resetForTests();
  process.chdir(origCwd);
  rmSync(tmp, { recursive: true, force: true });
});

beforeEach(() => {
  sqlite.getDb().exec('DELETE FROM cp_agent_events; DELETE FROM cp_sales; DELETE FROM cp_products;');
  settings.deleteSetting(intake.CRAFT_TEAM_KEY);
  intake._resetCraftPackCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** CEO→营销→订单→快递→财务 的一轮完整 agent 输出（含协议标记）。 */
const TRANSCRIPT = `收到你的产品资料了，先登记上架。
[intake] {"name":"苗绣杯垫","price":68,"artisan":30,"shipping":8,"marketing":5}
[intake] {"name":"手工编织篮","price":89,"artisan":42,"shipping":8,"marketing":6}

我先去小红书发帖推广。
[post] {"platform":"小红书","title":"山里来的温柔","text":"残障匠人手作苗绣杯垫"}

购买链接已挂上。
[link] {"product":"苗绣杯垫","url":"https://shop.example.com/1"}

订单来了。
[order] {"product":"苗绣杯垫","qty":2}

已联系快递员上门取件寄出。
[ship] {"product":"苗绣杯垫","qty":2,"tracking":"SF001"}

[report] {"summary":"本周净利 ¥70"}

请看盈利汇报：收入 136 元，净利 70 元。`;

describe('applyCraftMarkers — 标记落库', () => {
  it('非代卖群（scoped=false）no-op：原文原样、零副作用', () => {
    const r = intake.applyCraftMarkers('[order] {"product":"苗绣杯垫","qty":2}', { scoped: false });
    expect(r.applied).toEqual([]);
    expect(r.cleaned).toContain('[order]');
    expect(profit.listSales()).toHaveLength(0);
  });

  it('全流程 transcript：上架/销售/运营动态/盈利全落库，文本剥标记', () => {
    const r = intake.applyCraftMarkers(TRANSCRIPT, { scoped: true });
    // 7 个标记全部识别（2 上架 + 发帖 + 链接 + 出单 + 寄出 + 汇报）
    expect(r.applied.map((a) => a.tag)).toEqual([
      'intake', 'intake', 'post', 'link', 'order', 'ship', 'report',
    ]);
    expect(r.applied.every((a) => a.ok)).toBe(true);
    // 展示文本里协议标记被剥掉，正文保留
    expect(r.cleaned).not.toContain('[intake]');
    expect(r.cleaned).not.toContain('[order]');
    expect(r.cleaned).toContain('请看盈利汇报');

    // 商品上架（元→分）
    const products = profit.listProducts();
    expect(products.map((p) => p.name).sort()).toEqual(['手工编织篮', '苗绣杯垫']);
    expect(products.find((p) => p.name === '苗绣杯垫')).toMatchObject({
      price_cents: 6800,
      artisan_cents: 3000,
      shipping_cents: 800,
      marketing_cents: 500,
      profit_per_unit_cents: 2500,
    });

    // 销售按快照记账（2 件 × 每件盈利 2500）
    const sales = profit.listSales();
    expect(sales).toHaveLength(1);
    expect(sales[0]).toMatchObject({ product_name: '苗绣杯垫', qty: 2, profit_cents: 5000 });

    // 运营动态：营销 ×2（post+link）、订单 ×1、快递 ×1
    const events = profit.listAgentEvents(10);
    const kinds = events.map((e) => e.kind);
    expect(kinds.filter((k) => k === 'marketing')).toHaveLength(2);
    expect(kinds.filter((k) => k === 'order')).toHaveLength(1);
    expect(kinds.filter((k) => k === 'shipping')).toHaveLength(1);
    expect(events.some((e) => e.text.includes('小红书'))).toBe(true);
    expect(events.some((e) => e.text.includes('SF001'))).toBe(true);

    // 盈利口径可查（收入 = 136 元）
    const ov = profit.overview(30);
    expect(ov.revenue_cents).toBe(13600);
    expect(ov.profit_cents).toBe(5000);
  });

  it('未上架商品出单 → 可见失败（ok=false 带原因），不抛不落销售', () => {
    const r = intake.applyCraftMarkers('[order] {"product":"不存在的","qty":1}', { scoped: true });
    expect(r.applied[0]).toMatchObject({ tag: 'order', ok: false });
    expect(r.applied[0].error).toMatch(/还没上架/);
    expect(profit.listSales()).toHaveLength(0);
  });
});

describe('isCraftGroup — 代卖群作用域', () => {
  it('settings 引用 team_id 命中才生效；缺省/不匹配 false', () => {
    expect(intake.isCraftGroup({ team_id: 'team-1' })).toBe(false);
    settings.setSetting(intake.CRAFT_TEAM_KEY, { team_id: 'team-1', group_id: 'g1' });
    expect(intake.isCraftGroup({ team_id: 'team-1', group_id: 'gX' })).toBe(true);
    expect(intake.isCraftGroup({ team_id: 'team-2', group_id: 'g1' })).toBe(true);
    expect(intake.isCraftGroup({ team_id: 'team-2', group_id: 'g2' })).toBe(false);
    expect(intake.isCraftGroup({ team_id: null, group_id: 'g2' })).toBe(false);
  });
});

describe('ingestProductMaterial — 产品资料自动同步知识库', () => {
  function stubKb(log: string[]) {
    let packCreated = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const u = String(url);
        const method = (init?.method ?? 'GET').toUpperCase();
        log.push(`${method} ${new URL(u).pathname}`);
        if (u.endsWith('/api/memory-bank/packs') && method === 'GET') {
          return {
            ok: true,
            json: async () => ({ data: { packs: packCreated ? [{ pack_id: 'p1', name: intake.CRAFT_PACK_NAME }] : [] } }),
          };
        }
        if (u.endsWith('/api/memory-bank/packs') && method === 'POST') {
          packCreated = true;
          return { ok: true, json: async () => ({ data: { pack_id: 'p1' } }) };
        }
        if (/\/packs\/p1\/text$/.test(u) && method === 'POST') {
          return { ok: true, json: async () => ({ data: { ingested: true } }) };
        }
        return { ok: false, json: async () => ({}) };
      }),
    );
  }

  it('首条资料建 pack、后续复用缓存；文本发到 /packs/{id}/text', async () => {
    const log: string[] = [];
    stubKb(log);
    const p1 = await intake.ingestProductMaterial('手工编织篮，售价88元，天然藤条纯手工，可收纳可装饰。');
    expect(p1).toBe('p1');
    expect(log).toEqual([
      'GET /api/memory-bank/packs',
      'POST /api/memory-bank/packs',
      'POST /api/memory-bank/packs/p1/text',
    ]);
    const p2 = await intake.ingestProductMaterial('苗绣杯垫，苗族手作，直径 10cm，售价 68 元。');
    expect(p2).toBe('p1');
    // 第二条只发 text（pack 已缓存）
    expect(log[3]).toBe('POST /api/memory-bank/packs/p1/text');
  });

  it('短消息/命令不同步，零 fetch', async () => {
    const log: string[] = [];
    stubKb(log);
    expect(await intake.ingestProductMaterial('好的')).toBeNull();
    expect(await intake.ingestProductMaterial('/help 看看帮助')).toBeNull();
    expect(log).toEqual([]);
  });

  it('记忆库不可达 fail-soft：返回 null 不抛', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }));
    expect(await intake.ingestProductMaterial('这是一段足够长的产品介绍文本，同步失败也不该抛错。')).toBeNull();
  });
});
