/**
 * evidence.test.ts — 演示证据包契约测试（2026-11-06，功能线①③共同交付）。
 *
 * 真实 Express Router + 真实 SQLite（临时 cwd 隔离）。赛题要求「运行与演示材料
 * 能帮助评委核实效果」，所以这里守的是材料本身的可信度：
 *   - 空库也能导出，不 500；
 *   - 报告里的营收/毛利/对账/第一单与看板接口逐项一致，不另算一套；
 *   - 人机分工（冲突留痕、人工裁决、失败补跑）在材料里可核实；
 *   - 协作 DAG 留痕（异常终态 / 返工 / 人工审批拒绝）可逐条核实，
 *     且系统的 policy deny 不会被包装成「老板拍板」；
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
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let hopsStore: typeof import('../storage/agent-hops');

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
  hopsStore = await import('../storage/agent-hops');
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
    expect(r.memory.context_reads).toMatchObject({ total: 0, items: [] });
    expect(r.collaboration).toMatchObject({
      available: true, total: 0, failures: 0, reworks: 0, approval_rejections: 0, open: 0,
    });
    expect(r.human_decisions).toMatchObject({
      pending_conflicts: 0, resolutions: 0, failed_feedback: 0, pending_feedback: 0,
      hop_failures: 0, hop_approval_rejections: 0,
    });
    expect(r.notes.length).toBeGreaterThan(3);
    expect(r.reproduction.endpoints).toContain('GET /api/merchant/evidence.md');
    expect(r.reproduction.endpoints).toContain('GET /api/merchant/evidence/scorecard.md');
  });

  it('评委速览一页：四个维度与加分项齐备，空库诚实标注待补证据', async () => {
    const res = await request(app()).get('/api/merchant/evidence/scorecard.md');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/markdown');
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="shadowflow-scorecard-.*\.md"/);
    const md = res.text;
    expect(md).toContain('# ShadowFlow · 评委速览（一页）');
    for (const dim of ['创新性（35）', '商业化潜力（25）', '完成度（25）', '原创性（15）']) {
      expect(md).toContain(dim);
    }
    for (const bonus of [
      '第一单（真实或模拟交易）', '人机分工清晰',
      '跨多个生产力场景形成完整闭环', '项目可被他人复用',
    ]) {
      expect(md).toContain(bonus);
    }
    expect(md).toContain('不代替评委打分');
    // 空库必须自曝缺口，不能把没跑过的链路写成「已展示」
    expect(md).toContain('待跑通');
    expect(md).toContain('第一单五步链路未通');
    expect(md).toContain('本区间没有协作交接');
    // 材料只提供证据，绝不替评委给自己打分
    expect(md).not.toMatch(/得分\s*\d|自评|已获\s*\d+\s*分/);
  });

  it('Markdown 与 CSV 都带附件头，空库也给出说明而不是空白文件', async () => {
    const md = await request(app()).get('/api/merchant/evidence.md');
    expect(md.status).toBe(200);
    expect(md.headers['content-type']).toContain('text/markdown');
    expect(md.headers['content-disposition']).toMatch(/attachment; filename="shadowflow-evidence-.*\.md"/);
    expect(md.text).toContain('# ShadowFlow · 一人公司演示证据包');
    expect(md.text).toContain('区间内还没有订单');
    expect(md.text).toContain('## 四、协作执行留痕');
    expect(md.text).toContain('本区间未发生 DAG 交接');
    expect(md.text).toContain('本区间没有协作交接记录');

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

  it('协作 DAG 也留下真实 hop：正常交接 / 失败 / 返工 / 人工审批拒绝 / 系统策略拦截 / 悬挂', async () => {
    // 用编排层自己的 openHop / settleHop 造数据，detail 与线上真实写入一致；
    // evidence 只负责读，不碰这些写入函数以外的编排层代码。
    const turn = hopsStore.nextTurnSeq('grp-ev');
    const open = (from: string, to: string) =>
      hopsStore.openHop({ group_id: 'grp-ev', turn_seq: turn, from_agent: from, to_agent: to });

    const ok = open('pm', 'arch');
    hopsStore.settleHop(ok, 'done', { outputChars: 120 });

    const failed = open('arch', 'dev');
    hopsStore.settleHop(failed, 'failed', { detail: 'agent 超时无响应' });

    const rework = open('qa', 'dev');
    hopsStore.settleHop(rework, 'done', { detail: 'rework round 1', outputChars: 80 });

    // 同样记 denied，但只有「审批被拒」这一条是老板拍板，policy deny 是系统策略。
    const approval = open('dev', 'qa');
    hopsStore.settleHop(approval, 'denied', { detail: '审批被拒：dev 未获批准，交接未发生' });
    const policy = open('arch', 'qa');
    hopsStore.settleHop(policy, 'denied', { detail: 'policy deny' });

    open('pm', 'qa'); // 未结算：验证 open 计数，不改状态

    const r = (await request(app()).get('/api/merchant/evidence')).body;
    expect(r.collaboration.available).toBe(true);
    expect(r.collaboration.total).toBe(6);
    expect(r.collaboration.by_status).toMatchObject({ done: 2, failed: 1, denied: 2, pending: 1 });
    expect(r.collaboration.settled).toBe(5);
    expect(r.collaboration.open).toBe(1);
    expect(r.collaboration.failures).toBe(3); // failed 1 + denied 2
    expect(r.collaboration.reworks).toBe(1);
    expect(r.collaboration.approval_rejections).toBe(1);
    expect(r.collaboration.events).toHaveLength(6);
    expect(r.collaboration.events[0].created_at).toBeLessThanOrEqual(r.collaboration.events[5].created_at);
    expect(r.human_decisions.hop_failures).toBe(3);
    expect(r.human_decisions.hop_approval_rejections).toBe(1);
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

  it('失败反馈可核实：队列表带失败原因，速览提示人工补跑后重新导出', async () => {
    // 真实失败由 processFeedbackRow 的 catch 落成 failed + error；公开 API 没法
    // 确定性逼出写回异常，这里直接种一条失败态（与 demo-exception-replay 同一手法，
    // 只写队列表、不造假表），验证「失败可补跑」这条闭环在材料里看得见原因。
    sqlite.getDb()
      .prepare(
        `INSERT INTO memory_feedback_queue
           (id, subject_type, subject_id, text_hash, text, source, source_ref,
            status, keys_json, actions_json, conflicts, error, actor, created_at)
         VALUES ('fb-fail-1', 'customer', 'cust-ev', 'hash-fail-1', '行业做的是烘焙',
                 'test', 'case-failed-feedback', 'failed', '[]', '[]', 0,
                 '模拟写回失败：库忙超时', 'system', ?)`,
      )
      .run(Date.now());

    const r = (await request(app()).get('/api/merchant/evidence')).body;
    expect(r.human_decisions.failed_feedback).toBeGreaterThanOrEqual(1);
    const failed = r.memory.feedback.items.find((i: { status: string }) => i.status === 'failed');
    expect(failed?.error).toContain('模拟写回失败');

    const md = (await request(app()).get('/api/merchant/evidence.md')).text;
    expect(md).toContain('失败原因');
    expect(md).toContain('模拟写回失败：库忙超时');

    const card = (await request(app()).get('/api/merchant/evidence/scorecard.md')).text;
    expect(card).toContain('条写回失败');
    expect(card).toContain('补跑待处理 / 失败');
  });

  it('Markdown 是能直接当答辩附件的中文材料', async () => {
    const md = (await request(app()).get('/api/merchant/evidence.md')).text;
    expect(md).toContain('## 〇、评委速览（对照赛题评分表）');
    expect(md).toContain('## 一、业务闭环：第一单与经营口径');
    expect(md).toContain('## 二、账实核对');
    expect(md).toContain('## 三、人机分工与异常处理');
    expect(md).toContain('## 四、协作执行留痕');
    expect(md).toContain('## 六、口径与边界');
    expect(md).toContain('## 七、复现与复用');
    // 协作章：异常、返工、审批拒绝、明细交接方向都能逐条核实
    expect(md).toContain('异常终态');
    expect(md).toContain('人工审批拒绝');
    expect(md).toContain('rework round 1');
    expect(md).toContain('审批被拒：dev 未获批准');
    expect(md).toContain('policy deny');
    expect(md).toContain('pm → arch');
    expect(md).toContain('状态分布：');
    expect(md).toContain('失败 1');
    // 口径边界里必须说清「系统策略拦截不算老板决策」，防止评审被误导
    expect(md).toContain('系统策略 deny 与人工审批拒绝都记为 denied，只有后者算人的决策');
    expect(md).toContain('¥199.00');
    expect(md).toContain('账实一致');
    expect(md).toContain('人工裁决');
    expect(md).toContain('五步全通');
    expect(md).toContain('POST /api/merchant/products');
    // 表格里出现背调过的商品名与裁决操作者
    expect(md).toContain('handoff');
  });

  it('评委速览与七章报告同源：数字一致、状态不美化', async () => {
    const report = (await request(app()).get('/api/merchant/evidence')).body;
    const md = (await request(app()).get('/api/merchant/evidence.md')).text;
    const card = (await request(app()).get('/api/merchant/evidence/scorecard.md')).text;

    // 卷首速览与独立一页共用 scorecardBody，同一份数字不会漂移
    expect(md).toContain('## 〇、评委速览（对照赛题评分表）');
    expect(card).toContain(`营收 ${evidence.yuan(report.merchant.overview.revenue_cents)}`);
    expect(card).toContain(`客单价 ${evidence.yuan(report.merchant.overview.avg_order_cents)}`);
    expect(md).toContain(`客单价 ${evidence.yuan(report.merchant.overview.avg_order_cents)}`);
    expect(card).toContain(`人工裁决 ${report.human_decisions.resolutions} 次`);
    expect(card).toContain(`交接 hop ${report.collaboration.total}`);
    expect(card).toContain(`异常 ${report.collaboration.failures}`);
    expect(card).toContain('第一单五步全通');
    expect(card).toContain('有数据');
    // 账实核对的结论在三种材料里必须一致
    const verdict = report.merchant.reconcile.balanced ? '账实一致' : '账实有差额';
    expect(card).toContain(verdict);
    expect(md).toContain(verdict);
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
    // 协作 hop 与经营数字共用同一个窗口，不能把区间外的交接混进附件
    expect(empty.body.collaboration.total).toBe(0);
    expect(evidence.evidenceOrdersCsv({ start: future }).trim().split('\r\n')).toHaveLength(1);

    const past = new Date(Date.now() - 86400000).toISOString();
    const full = await request(app()).get(`/api/merchant/evidence?start=${encodeURIComponent(past)}`);
    expect(full.body.merchant.orders.total).toBe(2);
    expect(full.body.window.from).toBe(Date.parse(past));
    // 记忆流水与协作 hop 复用同一个窗口，不另造时间定义
    expect(full.body.memory.audit.total).toBeGreaterThan(0);
    expect(full.body.collaboration.total).toBe(6);
  });

  it('导出只读：导出前后两条线 + 协作 hop 的数据完全一致', async () => {
    const beforeMerchant = (await request(app()).get('/api/merchant/stats')).body;
    const beforeMemory = (await request(app()).get('/api/memory/handoff/stats')).body;
    const hopRows = () => sqlite.getDb().prepare('SELECT * FROM agent_hops ORDER BY id').all();
    const beforeHops = hopRows();
    await request(app()).get('/api/merchant/evidence');
    await request(app()).get('/api/merchant/evidence.md');
    await request(app()).get('/api/merchant/evidence/scorecard.md');
    await request(app()).get('/api/merchant/evidence/orders.csv');
    expect((await request(app()).get('/api/merchant/stats')).body).toEqual(beforeMerchant);
    expect((await request(app()).get('/api/memory/handoff/stats')).body).toEqual(beforeMemory);
    expect(hopRows()).toEqual(beforeHops); // 只读汇总，绝不改写编排层留下的状态
  });

  it('脏参数一律 4xx，不出现 5xx，也不静默忽略错误区间', async () => {
    const bad = [
      '/api/merchant/evidence?start=not-a-date',
      '/api/merchant/evidence?start=2030-01-01&end=2020-01-01',
      '/api/merchant/evidence.md?start=not-a-date',
      '/api/merchant/evidence/scorecard.md?start=not-a-date',
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

describe('记忆消费留痕：「记忆被用上」在材料里可核实', () => {
  it('没消费记录时速览提示补跑；一次 contextFor 后 JSON / 报告 / 速览三处同步出现', async () => {
    // 此时已有画像写回 / 交接包（供给侧有数据），但还没人读过记忆（消费侧为 0），
    // 速览必须自曝这个缺口，不能让评委以为「记忆被用上了」是既成事实。
    const before = (await request(app()).get('/api/merchant/evidence/scorecard.md')).text;
    expect(before).toContain('还没有记忆消费记录');
    expect(before).toContain('GET /api/memory/handoff/context');

    // 接班 agent 真实拉一次上下文（公开路径，消费留痕自动落库）
    const read = await request(app()).get('/api/memory/handoff/context?agent=交付岗&scope_key=&task_type=');
    expect(read.status).toBe(200);

    const r = (await request(app()).get('/api/merchant/evidence')).body;
    expect(r.memory.context_reads.total).toBeGreaterThanOrEqual(1);
    const mine = r.memory.context_reads.items.filter((i: { agent: string }) => i.agent === '交付岗');
    expect(mine.length).toBeGreaterThanOrEqual(1);
    expect(mine[mine.length - 1].item_count).toBe(read.body.count);
    expect(mine[mine.length - 1].sources).toEqual(read.body.sources);

    const md = (await request(app()).get('/api/merchant/evidence.md')).text;
    expect(md).toContain('记忆消费留痕');
    expect(md).toContain('交付岗');

    const card = (await request(app()).get('/api/merchant/evidence/scorecard.md')).text;
    expect(card).toContain(`记忆消费 ${r.memory.context_reads.total} 次`);
    expect(card).not.toContain('还没有记忆消费记录');
    // 评委能照着复现端点核消费留痕
    expect(r.reproduction.endpoints).toContain('GET /api/memory/handoff/context/reads');
  });
});
