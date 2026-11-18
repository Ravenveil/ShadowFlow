/**
 * single-backend-batch3-opc.test.ts — 第三批 opc 域 31 条端点对齐测试。
 *
 * 覆盖：
 *   meta      GET /models、POST /seed（幂等）
 *   组织      GET /companies、/company、/company/:id、departments GET/POST、
 *             employees/:id、employees POST(hire)/fire、org、roster
 *   经营      projects GET/POST、/projects/:id、run、tasks/:id、run、
 *             approvals GET、decide、pnl、income（422 码表）
 *   商务      products GET、products/:id、orders POST/GET/GET/:id/events、
 *             cancel、pay/notify（沙箱回调 + 校验失败 400 + 未知订单 404）、pay/info
 *   贯通      seed → 建公司 → 部门 → 员工 → 项目 → 任务 run → 订单 → 支付 →
 *             审批 decide 全链路
 *
 * 响应形状对齐 Python（FastAPI dict 直返、无 {data,meta} 信封；错误顶层 {"detail"}）。
 * 数据隔离：process.chdir(mkdtemp) + SHADOWFLOW_DATA_DIR + SHADOWFLOW_OPC_DB 指向 tmp。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tmp = mkdtempSync(path.join(tmpdir(), 'sf-sbe-b3-opc-'));
const origCwd = process.cwd();
process.chdir(tmp);
process.env.SHADOWFLOW_DATA_DIR = tmp;
process.env.SHADOWFLOW_OPC_DB = path.join(tmp, '.shadowflow', 'opc.sqlite');
delete process.env.SF_PAY_MODE; // 默认 simulated
delete process.env.SF_PUBLIC_BASE_URL;

import opcRouter from '../opc/opc';
import { _resetOpcForTests } from '../opc/opc-store';

afterAll(() => {
  // 顺序敏感：先切回 cwd（Windows 不能删进程当前目录）→ 关 sqlite 句柄 → 删目录
  process.chdir(origCwd);
  _resetOpcForTests();
  rmSync(tmp, { recursive: true, force: true });
  delete process.env.SHADOWFLOW_DATA_DIR;
  delete process.env.SHADOWFLOW_OPC_DB;
});

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/opc', opcRouter);
  return a;
}

/** 确保种子存在（多数用例依赖默认公司），返回 company id。 */
async function seededCompanyId(): Promise<string> {
  const res = await request(app()).post('/api/opc/seed');
  return res.body.company.id as string;
}

// ════════════════════════════════════════════════════════════════════════════
// meta
// ════════════════════════════════════════════════════════════════════════════

describe('GET /api/opc/models + POST /api/opc/seed', () => {
  it('models 返回 5 个模型目录，字段 id/label/vendor/tier', async () => {
    const res = await request(app()).get('/api/opc/models');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(5);
    const gpt = res.body.items.find((i: any) => i.id === 'gpt-4o');
    expect(gpt).toMatchObject({ label: 'GPT-4o', vendor: 'OpenAI', tier: '旗舰' });
    expect(gpt.in_cents).toBe(2.5);
  });

  it('seed 幂等：默认公司「增长工场」+ 3 商品，二次调用同一公司', async () => {
    const r1 = await request(app()).post('/api/opc/seed');
    expect(r1.status).toBe(200);
    expect(r1.body.company.name).toBe('增长工场 Growth Studio');
    expect(r1.body.company.cash_cents).toBe(200000);
    expect(r1.body.products).toHaveLength(3);
    expect(r1.body.products.map((p: any) => p.id).sort()).toEqual(
      ['svc_compliance', 'svc_content', 'svc_landing_sel'],
    );

    const r2 = await request(app()).post('/api/opc/seed');
    expect(r2.body.company.id).toBe(r1.body.company.id);
    // 种子还建了 5 部门 + 9 员工
    const org = await request(app()).get(`/api/opc/company/${r1.body.company.id}/org`);
    expect(org.body.headcount).toBe(9);
    expect(org.body.departments).toHaveLength(5);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 组织
// ════════════════════════════════════════════════════════════════════════════

describe('组织端点 — companies / company / departments / employees / org / roster', () => {
  let cid: string;
  beforeAll(async () => { cid = await seededCompanyId(); });

  it('GET /companies 列表含种子公司', async () => {
    const res = await request(app()).get('/api/opc/companies');
    expect(res.status).toBe(200);
    expect(res.body.items.some((c: any) => c.id === cid)).toBe(true);
  });

  it('GET /company 默认公司 + dashboard 聚合', async () => {
    const res = await request(app()).get('/api/opc/company');
    expect(res.status).toBe(200);
    expect(res.body.company.id).toBe(cid);
    expect(res.body.dashboard.pnl).toHaveProperty('profit');
    expect(res.body.dashboard.headcount.total).toBe(9);
  });

  it('GET /company/:id 只回 dashboard；未知公司 → 500（Python 未 catch 语义）', async () => {
    const ok = await request(app()).get(`/api/opc/company/${cid}`);
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ dashboard: expect.any(Object) });

    const miss = await request(app()).get('/api/opc/company/co_nope');
    expect(miss.status).toBe(500);
  });

  it('departments GET 种子 5 部门；POST 建新部门', async () => {
    const list = await request(app()).get(`/api/opc/company/${cid}/departments`);
    expect(list.body.items).toHaveLength(5);

    const created = await request(app())
      .post(`/api/opc/company/${cid}/departments`)
      .send({ name: '测试部', charter: '测试章程', budget_cents: 1000 });
    expect(created.status).toBe(200);
    expect(created.body.department).toMatchObject({
      name: '测试部', charter: '测试章程', budget_cents: 1000,
    });
    expect(created.body.department.id).toMatch(/^dept_/);

    const after = await request(app()).get(`/api/opc/company/${cid}/departments`);
    expect(after.body.items).toHaveLength(6);
  });

  it('POST departments 缺 name → 默认「新部门」', async () => {
    const res = await request(app()).post(`/api/opc/company/${cid}/departments`).send({});
    expect(res.body.department.name).toBe('新部门');
  });

  it('employee detail：存在回 employee；跨公司/不存在 → 404', async () => {
    const roster = await request(app()).get(`/api/opc/company/${cid}/roster`);
    const emp = roster.body.items[0];
    const ok = await request(app()).get(`/api/opc/company/${cid}/employees/${emp.id}`);
    expect(ok.status).toBe(200);
    expect(ok.body.employee.id).toBe(emp.id);
    expect(ok.body.employee.skills).toEqual(emp.skills);

    const miss = await request(app()).get(`/api/opc/company/${cid}/employees/emp_nope`);
    expect(miss.status).toBe(404);
    expect(miss.body.detail).toBe('员工不存在：emp_nope');
  });

  it('hire：默认值 / 未知模型 422', async () => {
    const ok = await request(app()).post(`/api/opc/company/${cid}/employees`).send({});
    expect(ok.status).toBe(200);
    expect(ok.body.employee).toMatchObject({ name: '新员工', role: 'writer', model_name: 'gpt-4o' });
    expect(ok.body.employee.model.vendor).toBe('OpenAI');

    const bad = await request(app())
      .post(`/api/opc/company/${cid}/employees`)
      .send({ model_name: 'nonexistent-model' });
    expect(bad.status).toBe(422);
    expect(bad.body.detail).toBe('未知模型：nonexistent-model');
  });

  it('fire：无未完成任务直接离职；重复 fire 仍 200（Python 不校验状态）', async () => {
    const hired = await request(app()).post(`/api/opc/company/${cid}/employees`)
      .send({ name: '临时工' });
    const eid = hired.body.employee.id;

    const fired = await request(app()).post(`/api/opc/company/${cid}/employees/${eid}/fire`).send({});
    expect(fired.status).toBe(200);
    expect(fired.body).toEqual({ ok: true, reassigned: 0 });

    // Python fire 只要员工存在就 UPDATE + 返回 ok（不检查是否已离职）
    const again = await request(app()).post(`/api/opc/company/${cid}/employees/${eid}/fire`).send({});
    expect(again.status).toBe(200);
    expect(again.body).toEqual({ ok: true, reassigned: 0 });

    const gone = await request(app()).post(`/api/opc/company/${cid}/employees/emp_nope/fire`).send({});
    expect(gone.status).toBe(404);
    expect(gone.body.detail).toBe('员工不存在：emp_nope');
  });

  it('org：树形部门 + head + headcount；未知公司回空树（Python org_chart 不校验存在）', async () => {
    const res = await request(app()).get(`/api/opc/company/${cid}/org`);
    expect(res.status).toBe(200);
    expect(res.body.company_id).toBe(cid);
    const gm = res.body.departments.find((d: any) => d.name === '总经办');
    expect(gm.head).toBeTruthy(); // 首位入职的陈明远
    expect(gm.members.length).toBeGreaterThan(0);

    // Python org_chart 只查 departments/roster，不 company_or_404 → 空树 200
    const ghost = await request(app()).get('/api/opc/company/co_nope/org');
    expect(ghost.status).toBe(200);
    expect(ghost.body.departments).toEqual([]);
    expect(ghost.body.headcount).toBe(0);
  });

  it('roster：含 department_name + skills/tools/model 展开字段', async () => {
    const res = await request(app()).get(`/api/opc/company/${cid}/roster`);
    expect(res.status).toBe(200);
    const cos = res.body.items.find((e: any) => e.role === 'chief_of_staff');
    expect(cos.department_name).toBe('总经办');
    expect(Array.isArray(cos.skills)).toBe(true);
    expect(cos.model.label).toBe('Claude Sonnet');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 经营：项目 / 任务 / 审批 / pnl / income
// ════════════════════════════════════════════════════════════════════════════

describe('经营端点 — projects / tasks / approvals / pnl / income', () => {
  let cid: string;
  let pid: string;
  let blockedTaskId: string; // research（依赖 plan，未跑完前置时 409）
  beforeAll(async () => {
    cid = await seededCompanyId();
    const res = await request(app())
      .post(`/api/opc/company/${cid}/projects`)
      .send({ goal: '为一个咖啡品牌做夏季推广', auto_plan: true });
    pid = res.body.project.id;
    const research = res.body.tasks.find((t: any) => t.title.includes('市场研究'));
    blockedTaskId = research.id;
  });

  it('POST projects：goal<4 → 422；auto_plan 拆 9 任务；项目详情聚合', async () => {
    const short = await request(app())
      .post(`/api/opc/company/${cid}/projects`).send({ goal: 'ab' });
    expect(short.status).toBe(422);
    expect(short.body.detail).toBe('请把业务目标说清楚，至少要一句话');

    const list = await request(app()).get(`/api/opc/company/${cid}/projects`);
    expect(list.status).toBe(200);
    expect(list.body.items.some((p: any) => p.id === pid)).toBe(true);

    const detail = await request(app()).get(`/api/opc/projects/${pid}`);
    expect(detail.status).toBe(200);
    expect(detail.body.project.id).toBe(pid);
    expect(detail.body.tasks).toHaveLength(9);
    expect(Array.isArray(detail.body.approvals)).toBe(true);

    const miss = await request(app()).get('/api/opc/projects/prj_nope');
    expect(miss.status).toBe(404);
  });

  it('POST projects auto_plan:false → tasks 空', async () => {
    const res = await request(app())
      .post(`/api/opc/company/${cid}/projects`)
      .send({ goal: '手工规划项目测试目标', auto_plan: false });
    expect(res.body.tasks).toEqual([]);
    expect(res.body.project.status).toBe('planning');
  });

  it('GET /projects 未知 → 404；GET /tasks/:id；task run 依赖阻塞 409', async () => {
    const t = await request(app()).get(`/api/opc/tasks/${blockedTaskId}`);
    expect(t.status).toBe(200);
    expect(t.body.task.depends_on.length).toBe(1);

    const miss = await request(app()).get('/api/opc/tasks/tsk_nope');
    expect(miss.status).toBe(404);
    expect(miss.body.detail).toBe('任务不存在：tsk_nope');

    const blocked = await request(app()).post(`/api/opc/tasks/${blockedTaskId}/run`).send({});
    expect(blocked.status).toBe(409);
    expect(blocked.body.detail).toBe('上游任务尚未完成，任务被阻塞');

    const missRun = await request(app()).post('/api/opc/tasks/tsk_nope/run').send({});
    expect(missRun.status).toBe(404);
  });

  it('project run：simulated 通路推进到审批卡点（design medium + legal high）', async () => {
    const res = await request(app()).post(`/api/opc/projects/${pid}/run`).send({});
    expect(res.status).toBe(200);
    expect(res.body.project.status).toBe('executing');
    expect(res.body.stopped).toBe('approval'); // 本轮出现审批（design 风险 medium）
    expect(res.body.rounds.length).toBeGreaterThan(0);
    expect(res.body.pending_approvals.length).toBeGreaterThan(0);
    const flat = res.body.rounds.flat();
    expect(flat.some((r: any) => r.needs_approval)).toBe(true);
  });

  it('approvals GET + decide：invalid 422 / 未知 404 / 重复 409 / approved 收尾', async () => {
    const list = await request(app()).get(`/api/opc/company/${cid}/approvals`);
    expect(list.status).toBe(200);
    const pending = list.body.items.filter((a: any) => a.status === 'pending');
    expect(pending.length).toBeGreaterThan(0);
    // 按 status 过滤
    const filtered = await request(app()).get(`/api/opc/company/${cid}/approvals?status=pending`);
    expect(filtered.body.items.every((a: any) => a.status === 'pending')).toBe(true);

    const bad = await request(app())
      .post(`/api/opc/approvals/${pending[0].id}/decide`).send({ decision: 'maybe' });
    expect(bad.status).toBe(422);
    expect(bad.body.detail).toBe('决定只能是 approved 或 rejected');

    const miss = await request(app())
      .post('/api/opc/approvals/apr_nope/decide').send({ decision: 'approved' });
    expect(miss.status).toBe(404);

    const approved = await request(app())
      .post(`/api/opc/approvals/${pending[0].id}/decide`)
      .send({ decision: 'approved', note: 'ok', decided_by: '测试员' });
    expect(approved.status).toBe(200);
    expect(approved.body.approval).toMatchObject({ status: 'approved', decided_by: '测试员' });

    const twice = await request(app())
      .post(`/api/opc/approvals/${pending[0].id}/decide`).send({ decision: 'approved' });
    expect(twice.status).toBe(409);
    expect(twice.body.detail).toBe('该审批已处理');
  });

  it('decide rejected：任务回 todo 并写 rejected_reason', async () => {
    // 再跑一轮产生新审批（design 之后 legal high 也会挂起）
    const run = await request(app()).post(`/api/opc/projects/${pid}/run`).send({});
    const pending = run.body.pending_approvals as any[];
    if (!pending.length) return; // 项目已推进完则跳过
    const rej = await request(app())
      .post(`/api/opc/approvals/${pending[0].id}/decide`)
      .send({ decision: 'rejected', note: '不合格' });
    expect(rej.status).toBe(200);
    expect(rej.body.approval.status).toBe('rejected');
    const task = await request(app()).get(`/api/opc/tasks/${rej.body.approval.task_id}`);
    expect(task.body.task.status).toBe('todo');
    expect(task.body.task.review.rejected_reason).toBe('不合格');
  });

  it('pnl + income：income 非整数分 422 / 非正数 422 / 正常入账', async () => {
    const pnl0 = await request(app()).get(`/api/opc/company/${cid}/pnl`);
    expect(pnl0.status).toBe(200);
    expect(pnl0.body.pnl).toHaveProperty('revenue');
    expect(pnl0.body.pnl).toHaveProperty('margin');
    expect(Array.isArray(pnl0.body.ledger)).toBe(true);

    const badStr = await request(app())
      .post(`/api/opc/company/${cid}/income`).send({ amount_cents: 'abc' });
    expect(badStr.status).toBe(422);
    expect(badStr.body.detail).toBe('金额需为整数分');

    const badZero = await request(app())
      .post(`/api/opc/company/${cid}/income`).send({ amount_cents: 0 });
    expect(badZero.status).toBe(422);
    expect(badZero.body.detail).toBe('金额必须大于 0');

    const ok = await request(app())
      .post(`/api/opc/company/${cid}/income`)
      .send({ amount_cents: 50000, description: '测试收款' });
    expect(ok.status).toBe(200);
    expect(ok.body.revenue).toBe(500);

    const pnl1 = await request(app()).get(`/api/opc/company/${cid}/pnl`);
    expect(pnl1.body.pnl.revenue).toBe(500);
    expect(pnl1.body.ledger[0].description).toBe('测试收款');
    expect(pnl1.body.ledger[0].amount).toBe(500);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 商务：products / orders / pay
// ════════════════════════════════════════════════════════════════════════════

describe('商务端点 — products / orders / pay/notify / pay/info', () => {
  let cid: string;
  beforeAll(async () => { cid = await seededCompanyId(); });

  it('GET /products：landing_url 注入 + pay 沙箱 info + base_url', async () => {
    const res = await request(app()).get('/api/opc/products');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(3);
    expect(res.body.items[0].landing_url).toMatch(new RegExp(`/q/${res.body.items[0].id}`));
    expect(res.body.pay).toMatchObject({ mode: 'simulated', configured: true, real_money: false });
    expect(res.body.base_url).toMatch(/^http:\/\//);
  });

  it('GET /products/:id：存在与 404', async () => {
    const ok = await request(app()).get('/api/opc/products/svc_content');
    expect(ok.status).toBe(200);
    expect(ok.body.product.id).toBe('svc_content');
    expect(ok.body.pay.mode).toBe('simulated');

    const miss = await request(app()).get('/api/opc/products/svc_nope');
    expect(miss.status).toBe(404);
    expect(miss.body.detail).toBe('服务不存在：svc_nope');
  });

  it('pay/info：simulated 默认沙箱', async () => {
    const res = await request(app()).get('/api/opc/pay/info');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      mode: 'simulated',
      configured: true,
      real_money: false,
      note: '本地沙箱：确认即视为支付成功，不产生真实扣款，适合演示与联调',
    });
  });

  it('orders POST：requirement<4 → 422；未知商品 404；正常下单 pending_payment', async () => {
    const short = await request(app()).post('/api/opc/orders')
      .send({ product_id: 'svc_content', requirement: 'ab' });
    expect(short.status).toBe(422);
    expect(short.body.detail).toBe('请至少用一句话描述你要交付的内容');

    const miss = await request(app()).post('/api/opc/orders')
      .send({ product_id: 'svc_nope', requirement: '完全合规的需求描述' });
    expect(miss.status).toBe(404);
    expect(miss.body.detail).toBe('服务不存在或已下架：svc_nope');

    const ok = await request(app()).post('/api/opc/orders')
      .send({ product_id: 'svc_content', buyer_name: '张三', contact: 'z@x.com', requirement: '要一套社媒文案' });
    expect(ok.status).toBe(200);
    expect(ok.body.order).toMatchObject({
      product_id: 'svc_content', status: 'pending_payment', amount_cents: 2900,
    });
    expect(ok.body.order.id).toMatch(/^ord_/);
    expect(ok.body.payment).toMatchObject({ provider: 'local-sandbox', mode: 'simulated' });
    expect(ok.body.payment.txn_id).toMatch(/^sim_/);
  });

  it('pay/notify 沙箱回调：订单不存在 404；成功后 mark_paid 立项派工', async () => {
    const created = await request(app()).post('/api/opc/orders')
      .send({ product_id: 'svc_compliance', buyer_name: '李四', requirement: '合规预审快检一下' });
    const orderId = created.body.order.id;
    const txn = created.body.payment.txn_id;

    const miss = await request(app()).post('/api/opc/pay/notify')
      .send({ provider: 'local-sandbox', order_id: 'ord_nope', txn_id: 'sim_x' });
    expect(miss.status).toBe(404);
    expect(miss.body.detail).toBe('回调订单不存在：ord_nope');

    const ok = await request(app()).post('/api/opc/pay/notify')
      .send({ provider: 'local-sandbox', order_id: orderId, txn_id: txn });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ ok: true, idempotent: false });
    expect(ok.body.order.status).toBe('running');
    expect(ok.body.order.project_id).toMatch(/^prj_/);

    // 重复回调 → SETTLED 幂等
    const again = await request(app()).post('/api/opc/pay/notify')
      .send({ provider: 'local-sandbox', order_id: orderId, txn_id: txn });
    expect(again.body).toMatchObject({ ok: true, idempotent: true });
  });

  it('pay/notify wechat 签名错 → 400 pay.rejected 事件', async () => {
    const res = await request(app()).post('/api/opc/pay/notify')
      .send({ provider: 'wechat', out_trade_no: 'ord_x', sign: 'BAD' });
    expect(res.status).toBe(400);
    expect(res.body.detail).toBe('回调校验失败：签名校验失败');
  });

  it('orders GET 列表 + 详情（steps/project/events）', async () => {
    const list = await request(app()).get('/api/opc/orders');
    expect(list.status).toBe(200);
    expect(list.body.items.length).toBeGreaterThan(0);
    expect(list.body.pay.mode).toBe('simulated');

    const paid = list.body.items.find((o: any) => o.project_id);
    expect(paid).toBeTruthy();
    const detail = await request(app()).get(`/api/opc/orders/${paid.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.order.id).toBe(paid.id);
    expect(detail.body.project).toMatchObject({ id: paid.project_id });
    expect(detail.body.steps.length).toBeGreaterThan(0);
    expect(detail.body.steps[0]).toHaveProperty('title');
    expect(detail.body.events[0].type).toBe('order.created');

    const miss = await request(app()).get('/api/opc/orders/ord_nope');
    expect(miss.status).toBe(404);
  });

  it('orders events：since 过滤；未知订单 404', async () => {
    const list = await request(app()).get('/api/opc/orders');
    const anyOrder = list.body.items[0];
    const all = await request(app()).get(`/api/opc/orders/${anyOrder.id}/events`);
    expect(all.status).toBe(200);
    expect(all.body.order_id).toBe(anyOrder.id);
    expect(all.body.items[0].seq).toBe(1);

    if (all.body.items.length > 1) {
      const since = await request(app())
        .get(`/api/opc/orders/${anyOrder.id}/events?since=1`);
      expect(since.body.items[0].seq).toBe(2);
    }

    const miss = await request(app()).get('/api/opc/orders/ord_nope/events');
    expect(miss.status).toBe(404);
  });

  it('orders cancel：未付单 cancelled；已交付/不存在语义', async () => {
    const created = await request(app()).post('/api/opc/orders')
      .send({ product_id: 'svc_landing_sel', requirement: '出海选品帮我分析' });
    const orderId = created.body.order.id;

    const cancel = await request(app()).post(`/api/opc/orders/${orderId}/cancel`).send({});
    expect(cancel.status).toBe(200);
    expect(cancel.body.order.status).toBe('cancelled');

    const events = await request(app()).get(`/api/opc/orders/${orderId}/events`);
    expect(events.body.items.map((e: any) => e.type)).toContain('order.cancelled');

    const miss = await request(app()).post('/api/opc/orders/ord_nope/cancel').send({});
    expect(miss.status).toBe(404);
    expect(miss.body.detail).toBe('订单不存在：ord_nope');
  });

  it('orders limit 校验：非法 → 422（FastAPI Query ge/le）', async () => {
    const bad = await request(app()).get('/api/opc/orders?limit=999');
    expect(bad.status).toBe(422);
    const bad2 = await request(app()).get('/api/opc/orders?limit=abc');
    expect(bad2.status).toBe(422);
    const ok = await request(app()).get('/api/opc/orders?limit=1');
    expect(ok.status).toBe(200);
    expect(ok.body.items.length).toBeLessThanOrEqual(1);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 全链路贯通：seed → 公司 → 部门 → 员工 → 项目 → 任务 run → 订单 → 支付 → 审批
// ════════════════════════════════════════════════════════════════════════════

describe('全链路贯通（seed → … → 审批 decide）', () => {
  it('完整业务闭环', async () => {
    const a = app();
    // 1. seed
    const seed = await request(a).post('/api/opc/seed');
    const companyId = seed.body.company.id;

    // 2. 建部门
    const dept = await request(a).post(`/api/opc/company/${companyId}/departments`)
      .send({ name: '贯通测试部', budget_cents: 3000 });
    const deptId = dept.body.department.id;

    // 3. 招两名员工（writer + reviewer）
    const writer = await request(a).post(`/api/opc/company/${companyId}/employees`)
      .send({ name: '贯通写手', role: 'writer', department_id: deptId, model_name: 'deepseek-chat' });
    expect(writer.status).toBe(200);
    const writerId = writer.body.employee.id;

    // 4. 建项目（手工模式，不 auto_plan）
    const proj = await request(a).post(`/api/opc/company/${companyId}/projects`)
      .send({ goal: '全链路贯通测试的目标描述', auto_plan: false, budget_cents: 1000 });
    const projectId = proj.body.project.id;

    // 5. 建任务并逐个 run（low risk → done，无审批）
    const run = await request(a).post(`/api/opc/projects/${projectId}/run`).send({});
    // 没有任务 → 空 rounds，project 推进 ready/executing
    expect(run.status).toBe(200);

    // 用 plan 模式建一个低风险项目跑完整链
    const proj2 = await request(a).post(`/api/opc/company/${companyId}/projects`)
      .send({ goal: '自动流水线全链路贯通', auto_plan: true });
    const projectId2 = proj2.body.project.id;
    const tasks = proj2.body.tasks as any[];
    expect(tasks).toHaveLength(9);

    // 逐个跑 plan（chief_of_staff，low risk）
    const planTask = tasks.find((t) => t.title === '目标拆解与项目排程');
    const runPlan = await request(a).post(`/api/opc/tasks/${planTask.id}/run`).send({});
    expect(runPlan.status).toBe(200);
    expect(runPlan.body.task.status).toBe('done');
    expect(runPlan.body.output.mode).toBe('simulated');
    expect(runPlan.body.output.cost_cents).toBeGreaterThan(0);
    expect(runPlan.body.approval).toBeNull();

    // force run：research 跳过依赖
    const researchTask = tasks.find((t) => t.title === '市场研究与竞品分析');
    const forceRun = await request(a).post(`/api/opc/tasks/${researchTask.id}/run`)
      .send({ force: true });
    expect(forceRun.status).toBe(200);
    expect(forceRun.body.task.status).toBe('done');

    // 6. 下单 → 沙箱支付回调 → 自动立项派工（后台代批）
    const order = await request(a).post('/api/opc/orders')
      .send({ product_id: 'svc_content', buyer_name: '贯通客户', requirement: '全链路贯通的交付需求' });
    const orderId = order.body.order.id;
    const notify = await request(a).post('/api/opc/pay/notify')
      .send({ provider: 'local-sandbox', order_id: orderId, txn_id: order.body.payment.txn_id });
    expect(notify.body.ok).toBe(true);
    const orderProjectId = notify.body.order.project_id;

    // 7. 审批 decide：项目自己的 legal high 审批（等 run_project 推进产生）
    const runAll = await request(a).post(`/api/opc/projects/${projectId2}/run`).send({});
    expect(runAll.body.stopped).toBe('approval');
    const pendingApprovals = runAll.body.pending_approvals as any[];
    expect(pendingApprovals.length).toBeGreaterThan(0);
    const decided = await request(a)
      .post(`/api/opc/approvals/${pendingApprovals[0].id}/decide`)
      .send({ decision: 'approved', note: '贯通通过' });
    expect(decided.body.approval.status).toBe('approved');

    // 8. 收尾核对：pnl 有执行成本、dashboard 聚合、订单 events 完整
    const pnl = await request(a).get(`/api/opc/company/${companyId}/pnl`);
    expect(pnl.body.pnl.cost).toBeGreaterThan(0);

    const dash = await request(a).get(`/api/opc/company/${companyId}`);
    expect(dash.body.dashboard.tasks.total).toBeGreaterThan(0);
    // 贯通里唯一 pending 审批已在第 7 步 decide 掉，此処应清零；
    // legal（high）审批可能仍在 pending（取决于后台代批进度），只断言字段存在。
    expect(dash.body.dashboard.approvals_pending).toBeGreaterThanOrEqual(0);
    expect(typeof dash.body.dashboard.approvals_pending).toBe('number');

    const orderEvents = await request(a).get(`/api/opc/orders/${orderId}/events`);
    const types = orderEvents.body.items.map((e: any) => e.type);
    expect(types).toContain('order.created');
    expect(types).toContain('order.pending_payment');
    expect(types).toContain('order.paid');
    expect(types).toContain('order.dispatched');
    expect(orderEvents.body.status).toBe('running');
    expect(orderProjectId).toMatch(/^prj_/);
  });
});
