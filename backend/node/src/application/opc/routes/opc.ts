/**
 * routes/opc/opc.ts — OPC OS HTTP API（单后端迁移·第三批 opc 域，31 条端点）。
 *
 * 逐条移植自 backend/python/shadowflow/api/opc/opc.py（挂载 prefix /api/opc）。
 * 响应形状对齐 FastAPI handler 原样返回 dict（**无 {data,meta} 信封**）；
 * 错误对齐 HTTPException：detail 为字符串 → 顶层 {"detail": "..."}。
 *
 * 语义保留（含 Python 的 500 语义——多数 company 端点不 catch CompanyError，
 * 未知公司走 FastAPI 默认 500；显式 catch 的端点（org/hire/fire/run/decide/
 * income）按 handler 的码表回 4xx）：
 *   company / departments / roster / hire / fire / org      — 组织
 *   projects / tasks / approvals / pnl / ledger / income    — 经营
 *   products / orders / pay / notify                        — 商务闭环
 *   models / seed                                           — 元数据 / 初始化
 */
import { Router, Request, Response, NextFunction } from 'express';
import * as company from './opc-company';
import { CompanyError } from './opc-company';
import * as orders from './opc-orders';
import { OrderError } from './opc-orders';
import * as pay from './opc-pay';
import { ensureSeed, PLAYBOOK } from './opc-seed';
import * as db from './opc-store';
import type { Row } from './opc-store';

const router = Router();

// ── helpers（对齐 opc.py 顶层函数） ──────────────────────────────────────────

function companyOrDefault(companyId?: string): Row {
  if (companyId) return company.companyOr404(companyId);
  const cs = company.listCompanies();
  if (!cs.length) throw new CompanyError('尚未创建公司', 404);
  return cs[0];
}

/**
 * CompanyError → HTTPException(status, message)。
 * Python 里只有部分 handler 显式 catch；未 catch 的 CompanyError 冒泡成
 * FastAPI 500（Internal Server Error）。Node 侧同构：注册了 catch 的路径走
 * statusOf，否则原样 throw 由 index.ts 的错误中间件回 500。
 */
function companyErr(res: Response, exc: CompanyError): void {
  res.status(exc.status).json({ detail: exc.message });
}

function orderErr(res: Response, exc: OrderError): void {
  res.status(exc.status).json({ detail: exc.message });
}

/** 包装 handler：未捕获 CompanyError/OrderError → 500（FastAPI 未 catch 冒泡语义）。 */
function h(fn: (req: Request, res: Response) => unknown): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    try {
      const out = fn(req, res);
      // async handler（placeOrder/payNotify 的 publicBase await）异常同样收口
      if (out instanceof Promise) out.catch(next);
    } catch (exc) {
      next(exc);
    }
  };
}

/** int(payload.get(...) or 0)：Python int() 语义（float 截断 / 非数值抛 ValueError）。 */
function toInt(v: unknown): number {
  if (typeof v === 'number') return Math.trunc(v);
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    if (Number.isNaN(n)) throw new TypeError(`invalid literal for int(): ${v}`);
    return Math.trunc(n);
  }
  if (typeof v === 'boolean') return v ? 1 : 0;
  return 0;
}

/** Query 参数 int（FastAPI Query 校验：非法 → 422）。 */
function queryInt(raw: unknown, def: number, ge: number, le: number): number {
  if (raw === undefined || raw === null || raw === '') return def;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < ge || n > le) {
    const err = new Error(
      `Input should be a finite integer between ${ge} and ${le}`,
    ) as Error & { status?: number };
    err.status = 422;
    throw err;
  }
  return n;
}

function queryIntLoose(raw: unknown, def: number, ge: number): number {
  if (raw === undefined || raw === null || raw === '') return def;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < ge) {
    const err = new Error(`Input should be a finite integer greater than or equal to ${ge}`) as Error & { status?: number };
    err.status = 422;
    throw err;
  }
  return n;
}

// ── meta ─────────────────────────────────────────────────────────────────────

router.get('/models', h((_req, res) => {
  res.json({ items: Object.entries(company.MODEL_CATALOG).map(([k, v]) => ({ ...v, id: k })) });
}));

router.post('/seed', h((_req, res) => {
  // 幂等初始化：默认公司 + 商品目录。启动/首次访问时调用。
  const c = ensureSeed();
  res.json({ company: c, products: db.listProducts() });
}));

// ── company: 组织 ────────────────────────────────────────────────────────────

router.get('/company', h((_req, res) => {
  const c = companyOrDefault();
  res.json({ company: c, dashboard: company.dashboard(c.id) });
}));

router.get('/companies', h((_req, res) => {
  res.json({ items: company.listCompanies() });
}));

router.get('/company/:company_id', h((req, res) => {
  companyOrDefault(req.params.company_id);
  res.json({ dashboard: company.dashboard(req.params.company_id) });
}));

router.get('/company/:company_id/org', h((req, res) => {
  try {
    res.json(company.orgChart(req.params.company_id));
  } catch (exc) {
    if (exc instanceof CompanyError) return companyErr(res, exc);
    throw exc;
  }
}));

router.get('/company/:company_id/roster', h((req, res) => {
  companyOrDefault(req.params.company_id);
  res.json({ items: company.roster(req.params.company_id) });
}));

router.get('/company/:company_id/departments', h((req, res) => {
  companyOrDefault(req.params.company_id);
  res.json({ items: company.listDepartments(req.params.company_id) });
}));

router.post('/company/:company_id/departments', h((req, res) => {
  const co = companyOrDefault(req.params.company_id);
  const payload = (req.body ?? {}) as Row;
  const dept = company.createDepartment(
    co.id,
    payload.name || '新部门',
    payload.charter || '',
    null,
    toInt(payload.budget_cents || 0),
  );
  res.json({ department: dept });
}));

router.get('/company/:company_id/employees/:employee_id', h((req, res) => {
  const emp = company.getEmployee(req.params.employee_id);
  if (!emp || emp.company_id !== req.params.company_id) {
    return res.status(404).json({ detail: `员工不存在：${req.params.employee_id}` });
  }
  res.json({ employee: emp });
}));

router.post('/company/:company_id/employees', h((req, res) => {
  const payload = (req.body ?? {}) as Row;
  try {
    const skills = Array.isArray(payload.skills) ? payload.skills
      : payload.skills ? String(payload.skills) : [];
    const emp = company.hire(
      req.params.company_id,
      payload.name || '新员工',
      payload.role || 'writer',
      payload.department_id ?? null,
      payload.title || '',
      payload.seniority || 'mid',
      payload.system_prompt || '',
      skills as string[],
      (Array.isArray(payload.tools) ? payload.tools : payload.tools ? String(payload.tools) : []) as string[],
      (Array.isArray(payload.permissions) ? payload.permissions : payload.permissions ? String(payload.permissions) : []) as string[],
      payload.model_name || 'gpt-4o',
      toInt(payload.day_rate_cents || 1000),
    );
    res.json({ employee: emp });
  } catch (exc) {
    if (exc instanceof CompanyError) return companyErr(res, exc);
    throw exc;
  }
}));

router.post('/company/:company_id/employees/:employee_id/fire', h((req, res) => {
  const payload = (req.body ?? {}) as Row;
  try {
    res.json(company.fire(req.params.employee_id, payload.reassign_to ?? null));
  } catch (exc) {
    if (exc instanceof CompanyError) return companyErr(res, exc);
    throw exc;
  }
}));

// ── company: 项目 / 任务 ─────────────────────────────────────────────────────

router.get('/company/:company_id/projects', h((req, res) => {
  const limit = queryInt(req.query.limit, 50, 1, 200);
  companyOrDefault(req.params.company_id);
  res.json({ items: company.listProjects(req.params.company_id, limit) });
}));

router.post('/company/:company_id/projects', h((req, res) => {
  // 老板下一个目标，平台自动拆成任务并分派。
  const payload = (req.body ?? {}) as Row;
  const goal = String(payload.goal ?? '').trim();
  if (goal.length < 4) {
    return res.status(422).json({ detail: '请把业务目标说清楚，至少要一句话' });
  }
  const co = companyOrDefault(req.params.company_id);
  const name = payload.name || goal.slice(0, 24);
  const project = company.createProject(
    co.id, name, goal,
    payload.client_name || '',
    toInt(payload.budget_cents || 0),
    null,
    payload.order_id ?? null,
  );
  let tasks: Row[] = [];
  if (payload.auto_plan !== false) {
    tasks = company.planProject(project.id, PLAYBOOK);
  }
  res.json({ project: company.getProject(project.id), tasks });
}));

router.get('/projects/:project_id', h((req, res) => {
  const p = company.getProject(req.params.project_id);
  if (!p) return res.status(404).json({ detail: `项目不存在：${req.params.project_id}` });
  const tasks = company.listTasks({ project_id: req.params.project_id });
  const approvals = company
    .listApprovals(p.company_id, null, 100)
    .filter((a) => a.project_id === req.params.project_id);
  res.json({ project: p, tasks, approvals });
}));

router.post('/projects/:project_id/run', h((req, res) => {
  const payload = (req.body ?? {}) as Row;
  try {
    res.json(company.runProject(
      req.params.project_id,
      toInt(payload.max_rounds || 12),
      toInt(payload.workers || 3),
    ));
  } catch (exc) {
    if (exc instanceof CompanyError) return companyErr(res, exc);
    throw exc;
  }
}));

router.get('/tasks/:task_id', h((req, res) => {
  const t = company.getTask(req.params.task_id);
  if (!t) return res.status(404).json({ detail: `任务不存在：${req.params.task_id}` });
  res.json({ task: t });
}));

router.post('/tasks/:task_id/run', h((req, res) => {
  const payload = (req.body ?? {}) as Row;
  try {
    res.json(company.runTask(req.params.task_id, Boolean(payload.force)));
  } catch (exc) {
    if (exc instanceof CompanyError) return companyErr(res, exc);
    throw exc;
  }
}));

// ── approvals ────────────────────────────────────────────────────────────────

router.get('/company/:company_id/approvals', h((req, res) => {
  companyOrDefault(req.params.company_id);
  const status = typeof req.query.status === 'string' ? req.query.status : '';
  res.json({ items: company.listApprovals(req.params.company_id, status || null) });
}));

router.post('/approvals/:approval_id/decide', h((req, res) => {
  const payload = (req.body ?? {}) as Row;
  try {
    const a = company.decideApproval(
      req.params.approval_id,
      payload.decision || '',
      payload.note || '',
      payload.decided_by || '老板',
    );
    res.json({ approval: a });
  } catch (exc) {
    if (exc instanceof CompanyError) return companyErr(res, exc);
    throw exc;
  }
}));

// ── pnl / ledger ─────────────────────────────────────────────────────────────

router.get('/company/:company_id/pnl', h((req, res) => {
  companyOrDefault(req.params.company_id);
  res.json({ pnl: company.pnl(req.params.company_id), ledger: company.ledgerEntries(req.params.company_id, 50) });
}));

router.post('/company/:company_id/income', h((req, res) => {
  const payload = (req.body ?? {}) as Row;
  let amount: number;
  try {
    amount = toInt(payload.amount_cents || 0);
  } catch {
    return res.status(422).json({ detail: '金额需为整数分' });
  }
  if (amount <= 0) return res.status(422).json({ detail: '金额必须大于 0' });
  try {
    res.json(company.addIncome(
      req.params.company_id,
      payload.project_id ?? null,
      amount,
      payload.description || '项目收款',
      payload.category || '项目收入',
      payload.ref_id ?? null,
    ));
  } catch (exc) {
    if (exc instanceof CompanyError) return companyErr(res, exc);
    throw exc;
  }
}));

// ── commerce: products / orders / pay ────────────────────────────────────────

router.get('/products', h(async (_req, res) => {
  const base = await pay.publicBase();
  const items = db.listProducts().map((p) => ({ ...p, landing_url: `${base}/q/${p.id}` }));
  res.json({ items, pay: pay.info(), base_url: base });
}));

router.get('/products/:product_id', h(async (req, res) => {
  const p = db.getProduct(req.params.product_id);
  if (!p) return res.status(404).json({ detail: `服务不存在：${req.params.product_id}` });
  const base = await pay.publicBase();
  res.json({
    product: { ...p, landing_url: `${base}/q/${p.id}` },
    pay: pay.info(),
  });
}));

router.post('/orders', h(async (req, res) => {
  const payload = (req.body ?? {}) as Row;
  try {
    res.json(await orders.placeOrder(
      payload.product_id ?? '',
      payload.buyer_name ?? '',
      payload.contact ?? '',
      payload.requirement ?? '',
    ));
  } catch (exc) {
    if (exc instanceof OrderError) return orderErr(res, exc);
    throw exc;
  }
}));

router.get('/orders', h((req, res) => {
  // FastAPI Query(50, ge=1, le=200)
  const limit = queryInt(req.query.limit, 50, 1, 200);
  const items = db.listOrders(limit).map((o) => orders.syncOrder(o.id) ?? o);
  res.json({ items, pay: pay.info() });
}));

router.get('/orders/:order_id', h((req, res) => {
  const o = orders.syncOrder(req.params.order_id);
  if (!o) return res.status(404).json({ detail: `订单不存在：${req.params.order_id}` });
  const steps: Row[] = [];
  let project: Row | null = null;
  if (o.project_id) {
    project = company.getProject(o.project_id);
    for (const t of company.listTasks({ project_id: o.project_id })) {
      steps.push({
        title: t.title,
        agent: t.assignee ? t.assignee.title : null,
        status: t.status,
        round: null,
      });
    }
  }
  res.json({
    order: o,
    project: project ? { id: project.id, status: project.status } : null,
    steps,
    events: db.orderEventsSince(req.params.order_id, 0),
  });
}));

router.get('/orders/:order_id/events', h((req, res) => {
  const o = db.getOrder(req.params.order_id);
  if (!o) return res.status(404).json({ detail: `订单不存在：${req.params.order_id}` });
  const since = queryIntLoose(req.query.since, 0, 0);
  res.json({
    order_id: req.params.order_id,
    status: o.status,
    items: db.orderEventsSince(req.params.order_id, since),
  });
}));

router.post('/orders/:order_id/cancel', h((req, res) => {
  const payload = (req.body ?? {}) as Row;
  try {
    res.json({ order: orders.cancelOrder(req.params.order_id, payload.reason ?? 'buyer_cancelled') });
  } catch (exc) {
    if (exc instanceof OrderError) return orderErr(res, exc);
    throw exc;
  }
}));

router.post('/pay/notify', h(async (req, res) => {
  // 统一支付回调：沙箱与真实网关共用这一条路由、同一套校验。
  const payload = (req.body ?? {}) as Row;
  const provider = (payload.provider as string) || pay.mode();
  const [ok, txnId, orderId, reason] = pay.verifyCallback(provider, payload);
  if (!ok) {
    if (orderId) db.emitOrder(orderId, 'pay.rejected', { provider, reason });
    return res.status(400).json({ detail: `回调校验失败：${reason}` });
  }
  if (!db.getOrder(orderId)) {
    return res.status(404).json({ detail: `回调订单不存在：${orderId}` });
  }
  try {
    const result = orders.markPaid(orderId, txnId, provider);
    res.json({ ok: true, idempotent: result.idempotent, order: result.order });
  } catch (exc) {
    if (exc instanceof OrderError) return orderErr(res, exc);
    throw exc;
  }
}));

router.get('/pay/info', h((_req, res) => {
  res.json(pay.info());
}));

// 未捕获异常统一出口。语义对齐 FastAPI（Starlette ServerErrorMiddleware）：
//   - queryInt 校验失败（带 status，非 Company/OrderError）→ 按其 status 回
//   - CompanyError/OrderError 冒泡到这里 = Python handler 没 catch →
//     FastAPI 顶层无对应 exception_handler → 500 纯文本 "Internal Server
//     Error"（未知公司 GET /company 在 Python 实测就是 500，忠实复刻）。
router.use((err: Error & { status?: number }, _req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) return next(err);
  if (err.status && !(err instanceof CompanyError) && !(err instanceof OrderError)) {
    return res.status(err.status).json({ detail: err.message });
  }
  console.error('[opc] internal error:', err.message);
  res.status(500).type('text').send('Internal Server Error');
});

export default router;
