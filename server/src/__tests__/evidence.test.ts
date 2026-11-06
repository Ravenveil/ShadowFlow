/**
 * evidence.test.ts — 演示证据包契约测试（2026-11-06，功能线①③共同交付）。
 *
 * 真实 Express Router + 真实 SQLite（临时 cwd 隔离）。赛题要求「运行与演示材料
 * 能帮助评委核实效果」，所以这里守的是材料本身的可信度：
 *   - 空库也能导出，不 500；
 *   - 报告里的营收/毛利/对账/第一单与看板接口逐项一致，不另算一套；
 *   - 人机分工（冲突留痕、人工裁决、失败补跑）在材料里可核实；
 *   - CSV 中文不乱码、公式注入被挡、区间与页面一致；
 *   - 导出是**只读**的：导出前后库里的计数一模一样。
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

let tmp: string;
let origCwd: string;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let merchantRouter: typeof import('../routes/merchant-board').default;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let handoffRouter: typeof import('../routes/memory-handoff').default;
let sqlite: typeof import('../storage/sqlite');
let evidence: typeof import('../storage/evidence');

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/merchant', merchantRouter);
  a.use('/api/memory/handoff', handoffRouter);
  return a;
}

beforeAll(async () => {
  origCwd = process.cwd();
  tmp = mkdtempSync(path.join(tmpdir(), 'sf-evidence-'));
  process.chdir(tmp);
  sqlite = await import('../storage/sqlite');
  sqlite._resetForTests();
  merchantRouter = (await import('../routes/merchant-board')).default;
  handoffRouter = (await import('../routes/memory-handoff')).default;
  evidence = await import('../storage/evidence');
  sqlite.getDb();
});

afterAll(() => {
  sqlite._resetForTests();
  process.chdir(origCwd);
  rmSync(tmp, { recursive: true, force: true });
});

describe('空库：演示前刚摆好库时材料也不能报错', () => {
  it('JSON 结构齐全，数字为 0 而不是凭空编造', async () => {
    const res = await request(app()).get('/api/merchant/evidence');
    expect(res.status).toBe(200);
    const r = res.body;
    expect(r.schema_version).toBe('evidence-1');
    expect(r.window.label).toContain('全部');
    expect(r.merchant.overview.revenue_cents).toBe(0);
    expect(r.merchant.overview.orders_total).toBe(0);
    expect(r.merchant.reconcile.balanced).toBe(true);
    expect(r.merchant.first_order.complete).toBe(false);
    expect(r.memory.audit.total).toBe(0);
    expect(r.memory.conflicts).toEqual([]);
    expect(r.human_decisions).toMatchObject({
      pending_conflicts: 0, resolutions: 0, failed_feedback: 0, pending_feedback: 0,
    });
    expect(r.notes.length).toBeGreaterThan(3);
    expect(r.reproduction.endpoints).toContain('GET /api/merchant/evidence.md');
  });

  it('Markdown 与 CSV 都带附件头，空库也给出说明而不是空白文件', async () => {
    const md = await request(app()).get('/api/merchant/evidence.md');
    expect(md.status).toBe(200);
    expect(md.headers['content-type']).toContain('text/markdown');
    expect(md.headers['content-disposition']).toMatch(/attachment; filename="shadowflow-evidence-.*\.md"/);
    expect(md.text).toContain('# ShadowFlow · 一人公司演示证据包');
    expect(md.text).toContain('区间内还没有订单');

    const csv = await request(app()).get('/api/merchant/evidence/orders.csv');
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.headers['content-disposition']).toMatch(/attachment; filename="shadowflow-evidence-.*\.csv"/);
    expect(csv.text).toContain('订单号');
  });
});

describe('真实闭环 + 人机分工：材料必须能逐项核实', () => {
  let productId = '';

  it('跑通第一单、制造退款、冲突裁决、反馈写回与交接接班', async () => {
    // 商品名故意以 = 开头：验证 CSV 公式注入防护，也验证报告不把它当公式执行。
    const p = await request(app())
      .post('/api/merchant/products')
      .send({ name: '=SUM(1+1) 手冲咖啡', price_cents: 19900, cost_cents: 4300 });
    expect(p.status).toBe(201);
    productId = p.body.id;

    const v = await request(app())
      .post('/api/merchant/visits')
      .send({ visitor_id: 'v-ev-1', channel: 'wechat', trace_id: 'ev-first' });
    const o1 = await request(app())
      .post('/api/merchant/orders')
      .send({ product_id: productId, visit_id: v.body.id, trace_id: 'ev-first' });
    expect((await request(app()).post(`/api/merchant/orders/${o1.body.id}/pay`)
      .send({ pay_txn_id: 'txn-ev-1' })).status).toBe(200);

    // 第二单成交后全额退款：报告里应看到退款被扣、成本被冲回。
    const o2 = await request(app())
      .post('/api/merchant/orders')
      .send({ product_id: productId, trace_id: 'ev-refund' });
    expect((await request(app()).post(`/api/merchant/orders/${o2.body.id}/pay`)
      .send({ pay_txn_id: 'txn-ev-2' })).status).toBe(200);
    expect((await request(app()).post(`/api/merchant/orders/${o2.body.id}/refund`).send({})).status).toBe(200);

    // 同置信不同说法 → 系统只留 conflict，不替老板改画像。
    await request(app()).post('/api/memory/handoff/profiles/writeback')
      .send({ subject_id: 'cust-ev', key: 'budget', value: '预算 800', confidence: 0.7, source: 'manual' });
    const conflict = await request(app()).post('/api/memory/handoff/profiles/writeback')
      .send({ subject_id: 'cust-ev', key: 'budget', value: '预算 3000', confidence: 0.7, source: 'feedback', evidence: '客户后来改口' });
    expect(conflict.body.action).toBe('conflict');

    const resolved = await request(app()).post('/api/memory/handoff/profiles/conflicts/resolve')
      .send({ subject_id: 'cust-ev', key: 'budget', decision: 'accept', actor: 'boss' });
    expect(resolved.status).toBe(200);

    // 反馈队列是后加的模块：在 main 基线上这个端点还不存在（404）。
    // 证据包对它是可选依赖，两种基线下都必须能导出，所以两种结果都接受。
    const fb = await request(app()).post('/api/memory/handoff/feedback')
      .send({ subject_id: 'cust-ev', text: '客户偏好简洁一点，预算 800 以内', source: 'crm', source_ref: 'ticket-ev-1' });
    expect([201, 404]).toContain(fb.status);

    const h = await request(app()).post('/api/memory/handoff').send({
      shift_id: 'shift-ev-1', from_agent: 'A', to_agent: 'B', summary: '夜班接手演示单',
    });
    expect(h.status).toBe(201);
    expect((await request(app()).post(`/api/memory/handoff/${h.body.handoff.id}/accept`)
      .send({ to_agent: 'B' })).status).toBe(200);
  });

  it('报告里的经营数字与看板接口逐项一致（不另算一套口径）', async () => {
    const r = (await request(app()).get('/api/merchant/evidence')).body;
    const ov = (await request(app()).get('/api/merchant/overview')).body;
    const rec = (await request(app()).get('/api/merchant/reconcile')).body;
    const chain = (await request(app()).get('/api/merchant/first-order')).body;

    expect(r.merchant.overview.revenue_cents).toBe(ov.revenue_cents);
    expect(r.merchant.overview.cost_cents).toBe(ov.cost_cents);
    expect(r.merchant.overview.gross_profit_cents).toBe(ov.gross_profit_cents);
    expect(r.merchant.overview.avg_order_cents).toBe(ov.avg_order_cents);
    expect(r.merchant.reconcile.balanced).toBe(rec.balanced);
    expect(r.merchant.reconcile.balanced).toBe(true);
    expect(r.merchant.first_order.complete).toBe(chain.complete);
    expect(r.merchant.first_order.complete).toBe(true);
    // 两单成交、一单退款：营收只留没退的那单，成本同理。
    expect(r.merchant.overview.revenue_cents).toBe(19900);
    expect(r.merchant.overview.cost_cents).toBe(4300);
    expect(r.merchant.orders.total).toBe(2);
    expect(r.merchant.orders.shown).toBe(2);
  });

  it('人机分工可在材料里核实：写回流水分动作、人工裁决被单独计数', async () => {
    const r = (await request(app()).get('/api/merchant/evidence')).body;
    expect(r.memory.stats.handoffs).toBeGreaterThanOrEqual(1);
    expect(r.memory.stats.accepted).toBeGreaterThanOrEqual(1);
    // 队列模块上线后有真实计数；未上线时必须记 0 并在口径里说明，不能装作有数据。
    if (r.memory.feedback.available) {
      expect(r.memory.feedback.stats.total).toBeGreaterThanOrEqual(1);
    } else {
      expect(r.memory.feedback.stats.total).toBe(0);
      expect(r.notes.join(' ')).toContain('尚未启用');
    }
    expect(r.memory.audit.total).toBeGreaterThanOrEqual(3);
    expect(r.memory.audit.by_action.conflict).toBeGreaterThanOrEqual(1);
    expect(r.memory.audit.resolutions).toBeGreaterThanOrEqual(1);
    expect(r.human_decisions.resolutions).toBe(r.memory.audit.resolutions);
    expect(r.human_decisions.note).toContain('不覆盖');
    // 裁决动作进入了 append-only 流水，且带 actor。
    expect(r.memory.audit.events.some((e: { actor: string }) => e.actor === 'boss')).toBe(true);
  });

  it('Markdown 是能直接当答辩附件的中文材料', async () => {
    const md = (await request(app()).get('/api/merchant/evidence.md')).text;
    expect(md).toContain('## 一、业务闭环：第一单与经营口径');
    expect(md).toContain('## 二、账实核对');
    expect(md).toContain('## 三、人机分工与异常处理');
    expect(md).toContain('## 五、口径与边界');
    expect(md).toContain('## 六、复现与复用');
    expect(md).toContain('¥199.00');
    expect(md).toContain('账实一致');
    expect(md).toContain('人工裁决');
    expect(md).toContain('五步全通');
    expect(md).toContain('POST /api/merchant/products');
    // 表格里出现背调过的商品名与裁决操作者
    expect(md).toContain('handoff');
  });

  it('CSV：UTF-8 BOM + 表头 + 行数正确 + 公式注入被挡 + 数值列可直接求和', async () => {
    const csv = evidence.evidenceOrdersCsv({});
    expect(csv.charCodeAt(0)).toBe(0xfeff); // Excel 打开中文不乱码
    const lines = csv.trim().split('\r\n');
    expect(lines[0]).toContain('订单号');
    expect(lines[0]).toContain('毛利(元)');
    expect(lines).toHaveLength(3); // 表头 + 两单
    expect(csv).toContain('"\'=SUM(1+1) 手冲咖啡"');
    expect(csv).not.toContain('"=SUM(1+1)');
    expect(csv).toContain('199.00,43.00,156.00');
    expect(csv).toContain('已退款');
  });

  it('区间与看板同源：导出窗口外的单不会混进附件', async () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    const empty = await request(app()).get(`/api/merchant/evidence?start=${encodeURIComponent(future)}`);
    expect(empty.status).toBe(200);
    expect(empty.body.merchant.orders.total).toBe(0);
    expect(evidence.evidenceOrdersCsv({ start: future }).trim().split('\r\n')).toHaveLength(1);

    const past = new Date(Date.now() - 86400000).toISOString();
    const full = await request(app()).get(`/api/merchant/evidence?start=${encodeURIComponent(past)}`);
    expect(full.body.merchant.orders.total).toBe(2);
    expect(full.body.window.from).toBe(Date.parse(past));
    // 记忆流水复用同一个窗口，不另造时间定义
    expect(full.body.memory.audit.total).toBeGreaterThan(0);
  });

  it('导出只读：导出前后两张线的计数完全一致', async () => {
    const beforeMerchant = (await request(app()).get('/api/merchant/stats')).body;
    const beforeMemory = (await request(app()).get('/api/memory/handoff/stats')).body;
    await request(app()).get('/api/merchant/evidence');
    await request(app()).get('/api/merchant/evidence.md');
    await request(app()).get('/api/merchant/evidence/orders.csv');
    expect((await request(app()).get('/api/merchant/stats')).body).toEqual(beforeMerchant);
    expect((await request(app()).get('/api/memory/handoff/stats')).body).toEqual(beforeMemory);
  });

  it('脏参数一律 4xx，不出现 5xx，也不静默忽略错误区间', async () => {
    const bad = [
      '/api/merchant/evidence?start=not-a-date',
      '/api/merchant/evidence?start=2030-01-01&end=2020-01-01',
      '/api/merchant/evidence.md?start=not-a-date',
      '/api/merchant/evidence/orders.csv?start=not-a-date',
    ];
    for (const url of bad) {
      const res = await request(app()).get(url);
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
      expect(res.body.error.code).toBe('MERCHANT_ERROR');
    }
    const oddLimit = await request(app()).get('/api/merchant/evidence?limit=abc');
    expect(oddLimit.status).toBe(200); // limit 收敛到默认值，不是错误
  });
});
