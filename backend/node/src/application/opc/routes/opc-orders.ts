/**
 * opc-orders.ts — OPC 订单编排层（移植自 services/opc_orders.py）。
 *
 * 状态机（单向，除退款）：
 *     created -> pending_payment -> paid -> running -> delivered
 *                                       \-> failed
 *     任意态 -> cancelled（未付款）/ refunded（已付款，需人工）
 *
 * 设计原则：订单不认识引擎内部，只认两件事 —— project_id 和最终交付物。
 *
 * 与 backend-poc 原版的差异（同 Python 版）：无「无公司时退回单人 run」
 * 兼容路径，无公司显式 503。
 */
import * as db from './opc-store';
import {
  CompanyError, addIncome, createProject, decideApproval, getProject,
  listCompanies, listTasks, planProject, runProject,
} from './opc-company';
import { PayNotConfigured, createPaymentWithBase, info as payInfo, publicBase } from './opc-pay';
import { PLAYBOOK } from './opc-seed';
import type { Row } from './opc-store';

// 订单进入这些状态后不再接受重复支付回调
const SETTLED = new Set(['paid', 'running', 'delivered', 'failed', 'refunded']);

export class OrderError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function clean(text: string, limit = 2000): string {
  return (text ?? '').trim().slice(0, limit);
}

export async function placeOrder(
  productId: string, buyerName = '', contact = '', requirement = '',
): Promise<Row> {
  // 建单 + 出支付凭据。未配置真实网关时直接拒绝，不产生脏单。
  const info = payInfo();
  if (!info.configured) throw new OrderError(info.note as string, 503);

  const product = db.getProduct(productId);
  if (!product || !product.active) {
    throw new OrderError(`服务不存在或已下架：${productId}`, 404);
  }

  const req = clean(requirement);
  if (req.length < 4) {
    throw new OrderError('请至少用一句话描述你要交付的内容', 422);
  }

  let order = db.createOrder({
    id: db.newId('ord'),
    product_id: product.id,
    product_name: product.name,
    buyer_name: clean(buyerName, 60),
    contact: clean(contact, 120),
    requirement: req,
    amount_cents: product.price_cents,
    status: 'created',
    created_at: db.now(),
  }) as Row;
  db.emitOrder(order.id, 'order.created', {
    product: { id: product.id, name: product.name },
    amount_cents: product.price_cents,
    requirement: req,
  });

  let payment: Row;
  try {
    const base = await publicBase();
    payment = createPaymentWithBase(order, base);
  } catch (exc) {
    if (exc instanceof PayNotConfigured) {
      db.updateOrder(order.id, { status: 'failed' });
      db.emitOrder(order.id, 'order.failed', { reason: String(exc.message) });
      throw new OrderError(exc.message, 503);
    }
    throw exc;
  }

  order = db.updateOrder(order.id, {
    status: 'pending_payment',
    pay_provider: payment.provider,
    pay_txn_id: payment.txn_id,
  }) as Row;
  db.emitOrder(order.id, 'order.pending_payment', {
    provider: payment.provider, mode: payment.mode, txn_id: payment.txn_id,
  });
  return { order, payment };
}

export function markPaid(
  orderId: string, txnId = '', provider: string | null = null, channel = 'callback',
): Row {
  void provider; // Python 版收参不落库，仅 txn_id 入库
  // 支付成功 -> 立刻立项派工。
  let order = db.getOrder(orderId);
  if (!order) throw new OrderError(`订单不存在：${orderId}`, 404);
  if (SETTLED.has(order.status)) return { order, idempotent: true };

  const product = db.getProduct(order.product_id);
  if (!product) throw new OrderError('订单关联的服务已不存在', 409);

  order = db.updateOrder(orderId, {
    status: 'paid',
    paid_at: db.now(),
    pay_txn_id: txnId || order.pay_txn_id || '',
  }) as Row;
  db.emitOrder(orderId, 'order.paid', {
    amount_cents: order.amount_cents, channel, txn_id: order.pay_txn_id,
  });

  const companies = listCompanies();
  if (!companies.length) {
    // 无旧版单人 run 路径：没有公司就没法交付，宁可拒也不吞单
    db.updateOrder(orderId, { status: 'failed' });
    db.emitOrder(orderId, 'order.failed', { reason: 'no_company' });
    throw new OrderError('平台尚未创建经营公司，无法派工交付', 503);
  }

  const project = createProject(
    companies[0].id,
    `${product.name}｜${order.buyer_name || '客户'}`,
    order.requirement,
    order.buyer_name || '',
    order.amount_cents,
    null,
    orderId,
  );
  const tasks = planProject(project.id, PLAYBOOK);
  order = db.updateOrder(orderId, { project_id: project.id, status: 'running' }) as Row;
  db.emitOrder(orderId, 'order.dispatched', {
    project_id: project.id, tasks: tasks.length, team: '增长工场',
  });
  // 后台推进项目（Python 是 daemon thread；Node 用 detached 定时器不阻塞返回）
  setTimeout(() => { try { executeProject(project.id); } catch { /* 后台失败不影响订单接口 */ } }, 0);
  return { order, idempotent: false };
}

function executeProject(projectId: string, autoApprove = true): void {
  // 后台推进项目：已付款订单走「自动验收」，审批留痕但系统代老板放行。
  for (let i = 0; i < 12; i++) {
    let res: Row;
    try {
      res = runProject(projectId);
    } catch {
      return;
    }
    if (res.stopped !== 'approval' || !autoApprove) return;
    const pending = (res.pending_approvals ?? []) as Row[];
    if (!pending.length) return;
    for (const a of pending) {
      try {
        decideApproval(a.id, 'approved', '已付款订单，系统代为验收', '系统代批');
      } catch (exc) {
        if (!(exc instanceof CompanyError)) throw exc;
      }
    }
  }
}

function projectDeliverable(projectId: string): Row | null {
  const project = getProject(projectId);
  if (!project) return null;
  const tasks = listTasks({ project_id: projectId });
  const done = tasks.filter((t) => t.status === 'done');

  let summary = '';
  let body = '';
  const tail = done.length ? ((done[done.length - 1].output ?? {}).text ?? '') : '';
  for (const t of tasks) {
    const out = (t.output ?? {}).text ?? '';
    if (!out) continue;
    // 交付说明优先取「客户跟进与交付说明」这类收口任务，而不是合规结论
    if (t.title.includes('交付')) summary = out;
    if (out.length > body.length) body = out;
  }
  summary = summary || tail || body;

  const finalText = (
    summary
    + (body && body !== summary ? '\n\n—— 正文 ——\n' + body : '')
  ).trim();

  return {
    project_id: projectId,
    status: project.status,
    final_text: finalText,
    nodes: tasks.map((t) => ({
      title: t.title, agent: t.assignee ? t.assignee.title : null,
      status: t.status, round: null,
    })),
    iterations: [],
    evidence: {
      events: tasks.length,
      checkpoints: tasks.filter((t) => (t.review ?? {}).required).length,
      iterations: done.length,
    },
    cost_cents: project.cost_cents,
  };
}

export function syncOrder(orderId: string): Row | null {
  // 惰性推进：读订单时顺手把项目的终态回填。
  let order = db.getOrder(orderId);
  if (!order || (order.status !== 'paid' && order.status !== 'running')) return order;

  const projectId = order.project_id;
  if (!projectId) return order;
  const project = getProject(projectId);
  if (!project) return order;
  if (project.status === 'delivered') {
    const payload = projectDeliverable(projectId);
    order = db.updateOrder(orderId, {
      status: 'delivered',
      delivered_at: db.now(),
      deliverable_json: JSON.stringify(payload),
    }) as Row;
    db.emitOrder(orderId, 'order.delivered', {
      project_id: projectId,
      evidence: (payload ?? {}).evidence ?? {},
      preview: ((payload ?? {}).final_text ?? '').slice(0, 120),
    });
    // 交付即确认收入：钱进公司账本，毛利才算得出来
    if (project.company_id) {
      addIncome(
        project.company_id,
        projectId,
        order.amount_cents,
        `${order.buyer_name || '客户'} · ${order.product_name || '服务'}`,
        '订单收入',
        orderId,
      );
    }
  } else if (project.status === 'failed') {
    order = db.updateOrder(orderId, { status: 'failed' }) as Row;
    db.emitOrder(orderId, 'order.failed', { project_id: projectId });
  }
  return order;
}

export function cancelOrder(orderId: string, reason = 'buyer_cancelled'): Row {
  let order = db.getOrder(orderId);
  if (!order) throw new OrderError(`订单不存在：${orderId}`, 404);
  if (order.status === 'delivered') {
    throw new OrderError('已交付的订单不能取消', 409);
  }
  if (order.status === 'paid' || order.status === 'running') {
    order = db.updateOrder(orderId, { status: 'refunded' }) as Row;
    db.emitOrder(orderId, 'order.refunded', { reason, manual: true });
    return order;
  }
  order = db.updateOrder(orderId, { status: 'cancelled' }) as Row;
  db.emitOrder(orderId, 'order.cancelled', { reason });
  return order;
}
