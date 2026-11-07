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
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let social: typeof import('../storage/social-publish');
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let opsShip: typeof import('../storage/ops-shipping');

beforeAll(async () => {
  origCwd = process.cwd();
  tmp = mkdtempSync(path.join(tmpdir(), 'sf-craft-intake-'));
  process.chdir(tmp);
  sqlite = await import('../storage/sqlite');
  sqlite._resetForTests();
  profit = await import('../storage/craft-profit');
  intake = await import('../storage/craft-intake');
  settings = await import('../storage/settings');
  social = await import('../storage/social-publish');
  opsShip = await import('../storage/ops-shipping');
  sqlite.getDb();
  profit.listProducts(); // 触发 cp_* 懒建表
  social.listAccounts(); // 触发 sp_* 懒建表
  opsShip.listShipments(); // 触发 ops_* 懒建表
});

afterAll(() => {
  sqlite._resetForTests();
  process.chdir(origCwd);
  rmSync(tmp, { recursive: true, force: true });
});

beforeEach(() => {
  sqlite.getDb().exec(
    'DELETE FROM cp_agent_events; DELETE FROM cp_sales; DELETE FROM cp_products;' +
      'DELETE FROM sp_publish_log; DELETE FROM sp_posts; DELETE FROM sp_accounts;' +
      'DELETE FROM ops_ship_events; DELETE FROM ops_shipments;',
  );
  settings.deleteSetting(intake.CRAFT_TEAM_KEY);
  intake._resetCraftPackCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** CEO→营销→订单→快递→财务 的一轮完整 agent 输出（含协议标记）。 */
const TRANSCRIPT = `收到你的产品资料了，先登记上架。
[intake] {"name":"苗绣杯垫","price":68,"cost":30,"shipping":8}
[intake] {"name":"手工编织篮","price":89,"cost":42,"shipping":8}

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
  it('非代卖群（scoped=false）no-op：原文原样、零副作用', async () => {
    const r = await intake.applyCraftMarkers('[order] {"product":"苗绣杯垫","qty":2}', { scoped: false });
    expect(r.applied).toEqual([]);
    expect(r.cleaned).toContain('[order]');
    expect(profit.listSales()).toHaveLength(0);
  });

  it('全流程 transcript：上架/销售/运营动态/盈利全落库，文本剥标记', async () => {
    const r = await intake.applyCraftMarkers(TRANSCRIPT, { scoped: true });
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
      cost_cents: 3000,
      shipping_cents: 800,
      profit_per_unit_cents: 3000,
    });

    // 销售按快照记账（2 件 × 每件盈利 3000）；[ship] 后状态已发货、回填运单号
    const sales = profit.listSales();
    expect(sales).toHaveLength(1);
    expect(sales[0]).toMatchObject({
      product_name: '苗绣杯垫',
      qty: 2,
      profit_cents: 6000,
      status: 'shipped',
      tracking: 'SF001',
    });

    // 运营动态：营销 ×2（post+link）、订单 ×1、快递 ×1
    const events = profit.listAgentEvents(10);
    const kinds = events.map((e) => e.kind);
    expect(kinds.filter((k) => k === 'marketing')).toHaveLength(2);
    expect(kinds.filter((k) => k === 'order')).toHaveLength(1);
    expect(kinds.filter((k) => k === 'shipping')).toHaveLength(1);
    expect(events.some((e) => e.text.includes('小红书'))).toBe(true);
    expect(events.some((e) => e.text.includes('SF001'))).toBe(true);

    // 社媒发布域：2 帖（发帖 + 链接帖）均已 mock 发布
    const posts = social.listPosts();
    expect(posts).toHaveLength(2);
    expect(posts.every((p) => p.status === 'published')).toBe(true);

    // 快递域：1 张运单（顺丰 mock 交运），关联到销售订单
    const ships = opsShip.listShipments();
    expect(ships).toHaveLength(1);
    expect(ships[0]).toMatchObject({ carrier: 'sf', order_id: sales[0].id, status: 'shipped' });
    expect(ships[0].tracking_no).toBeTruthy();

    // 盈利口径可查（收入 = 136 元）
    const ov = profit.overview(30);
    expect(ov.revenue_cents).toBe(13600);
    expect(ov.profit_cents).toBe(6000);
  });

  it('未上架商品出单 → 可见失败（ok=false 带原因），不抛不落销售', async () => {
    const r = await intake.applyCraftMarkers('[order] {"product":"不存在的","qty":1}', { scoped: true });
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

  it('总经理 DM 恒定作用域（团队未建时 [build-team] 也要能发）', () => {
    settings.deleteSetting(intake.CRAFT_TEAM_KEY);
    expect(
      intake.isCraftGroup({ kind: 'dm', agent_ids: ['agent-shadow-secretary'] }),
    ).toBe(true);
    // 非总经理 DM 不命中
    expect(intake.isCraftGroup({ kind: 'dm', agent_ids: ['agent-x'] })).toBe(false);
    // 群聊不能只靠 secretary 在 roster 命中（要走 settings 引用）
    expect(
      intake.isCraftGroup({ kind: 'group', agent_ids: ['agent-shadow-secretary'] }),
    ).toBe(false);
  });
});

describe('applyCraftMarkers — 流程动作透传（build-team/dispatch）', () => {
  it('[build-team]/[dispatch] 剥标记并透传 actions（标记须行首）', async () => {
    const r = await intake.applyCraftMarkers(
      '[build-team] {}\n好的\n[dispatch] {"to":"商品文案师","text":"写详情页"}\n已派出',
      { scoped: true },
    );
    expect(r.actions).toEqual([
      { kind: 'build-team' },
      { kind: 'dispatch', to: ['商品文案师'], text: '写详情页' },
    ]);
    expect(r.cleaned).toBe('好的\n已派出');
    expect(r.applied.map((a) => a.tag)).toEqual(['build-team', 'dispatch']);
    expect(r.applied.every((a) => a.ok)).toBe(true);
  });

  it('dispatch 缺 to/text → ok=false 可见失败，动作不透传', async () => {
    const r = await intake.applyCraftMarkers('[dispatch] {"to":"商品文案师"}', { scoped: true });
    expect(r.applied[0]).toMatchObject({ tag: 'dispatch', ok: false });
    expect(r.applied[0].error).toMatch(/缺 to|缺 text|缺少/);
    expect(r.actions).toEqual([]);
    expect(r.cleaned).toBe('');
  });

  it('既有业务动作（intake 等）照旧透传 actions（顺序保留）', async () => {
    const r = await intake.applyCraftMarkers('[intake] {"name":"杯垫","price":28}', { scoped: true });
    expect(r.actions).toEqual([expect.objectContaining({ kind: 'intake', name: '杯垫', price_cents: 2800 })]);
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
