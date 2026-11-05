/**
 * merchant-board.ts — 功能线①「商家数据看板」路由（2026-11-05）。
 *
 * 挂载点：/api/merchant（server/src/index.ts 一行 app.use，必须排在
 * proxyFallback 之前）。这是外接模块：主入口只加 import + app.use 两行，
 * 不改任何既有逻辑，也不依赖 ③ 的 memory-handoff 或队友的 dashboard。
 *
 * GET  /api/merchant/stats                  → 各表计数
 * GET  /api/merchant/overview               → 营收/成本/毛利/毛利率/客单价/首单
 * GET  /api/merchant/orders/timeseries      → 订单流水分时（零值补齐 + 峰值）
 * GET  /api/merchant/traffic/curve          → 客流曲线（PV/UV/转化/分渠道）
 * GET  /api/merchant/ledger                 → 收支流水
 * GET  /api/merchant/orders                 → 订单列表（含状态，可按 status 筛）
 * GET  /api/merchant/reconcile              → 账实对账
 * GET  /api/merchant/first-order            → 第一单五步链路
 * GET  /api/merchant/products               → 商品列表
 * POST /api/merchant/products               → 建商品（管理）
 * POST /api/merchant/visits                 → 落地页埋点
 * POST /api/merchant/orders                 → 下单
 * POST /api/merchant/orders/:id/pay         → 支付（演示用模拟回调）
 * POST /api/merchant/orders/:id/refund      → 退款
 *
 * IMPORTANT: 字面量路径全部注册在 /:id 之前，避免 Express 把 "stats" 当 id。
 */

import { Router, Request, Response } from 'express';
import {
  MerchantError,
  createOrder,
  createProduct,
  firstOrderChain,
  listLedger,
  listOrders,
  listProducts,
  orderTimeseries,
  overview,
  payOrder,
  recordVisit,
  reconcile,
  refundOrder,
  stats,
  trafficCurve,
} from '../storage/merchant-board';
import { apiGuard } from '../middleware/api-guard';

const router = Router();

// 写接口（建商品 / 下单 / 支付 / 退款）默认只允许本机；远程调用需 SF_API_TOKEN。
router.use(apiGuard());

function fail(res: Response, err: unknown): void {
  if (err instanceof MerchantError) {
    res.status(err.status).json({ error: { code: 'MERCHANT_ERROR', message: err.message } });
    return;
  }
  res.status(500).json({ error: { code: 'INTERNAL', message: (err as Error).message } });
}

function str(v: unknown, max = 256): string {
  return typeof v === 'string' ? v.slice(0, max) : '';
}

function body(req: Request): Record<string, unknown> {
  return (req.body ?? {}) as Record<string, unknown>;
}

// ── 读端点 ────────────────────────────────────────────────────────────────────

router.get('/stats', (_req: Request, res: Response) => {
  try {
    res.json(stats());
  } catch (err) {
    fail(res, err);
  }
});

router.get('/overview', (_req: Request, res: Response) => {
  try {
    res.json(overview());
  } catch (err) {
    fail(res, err);
  }
});

router.get('/orders/timeseries', (req: Request, res: Response) => {
  try {
    res.json(orderTimeseries({ granularity: req.query.granularity, start: req.query.start, end: req.query.end }));
  } catch (err) {
    fail(res, err);
  }
});

router.get('/traffic/curve', (req: Request, res: Response) => {
  try {
    res.json(trafficCurve({ granularity: req.query.granularity, start: req.query.start, end: req.query.end }));
  } catch (err) {
    fail(res, err);
  }
});

router.get('/ledger', (req: Request, res: Response) => {
  try {
    res.json(listLedger(Number(req.query.limit), str(req.query.kind, 32)));
  } catch (err) {
    fail(res, err);
  }
});

// 订单列表（含状态）。以前只有聚合，业务想知道「第 3 单是待付还是已退」只能翻流水反推。
// 注意：这个路径以前没有注册，GET /api/merchant/orders 会落到 proxyFallback 被转给
// 旧 Python 后端，返回 503 PYTHON_BACKEND_UNAVAILABLE —— 看起来像服务挂了。
router.get('/orders', (req: Request, res: Response) => {
  try {
    res.json(listOrders({ limit: req.query.limit, status: str(req.query.status, 16) }));
  } catch (err) {
    fail(res, err);
  }
});

router.get('/reconcile', (_req: Request, res: Response) => {
  try {
    res.json(reconcile());
  } catch (err) {
    fail(res, err);
  }
});

router.get('/first-order', (req: Request, res: Response) => {
  try {
    res.json(firstOrderChain(str(req.query.trace_id, 128)));
  } catch (err) {
    fail(res, err);
  }
});

router.get('/products', (_req: Request, res: Response) => {
  try {
    res.json(listProducts());
  } catch (err) {
    fail(res, err);
  }
});

// ── 写端点 ────────────────────────────────────────────────────────────────────

router.post('/products', (req: Request, res: Response) => {
  try {
    const b = body(req);
    res.status(201).json(createProduct({ name: b.name, price_cents: b.price_cents, cost_cents: b.cost_cents }));
  } catch (err) {
    fail(res, err);
  }
});

router.post('/visits', (req: Request, res: Response) => {
  try {
    const b = body(req);
    res.status(201).json(recordVisit({ visitor_id: b.visitor_id, channel: b.channel, trace_id: b.trace_id }));
  } catch (err) {
    fail(res, err);
  }
});

router.post('/orders', (req: Request, res: Response) => {
  try {
    const b = body(req);
    res.status(201).json(createOrder({ product_id: b.product_id, visit_id: b.visit_id, trace_id: b.trace_id }));
  } catch (err) {
    fail(res, err);
  }
});

router.post('/orders/:id/pay', (req: Request, res: Response) => {
  try {
    res.json(payOrder(req.params.id, body(req).pay_txn_id));
  } catch (err) {
    fail(res, err);
  }
});

router.post('/orders/:id/refund', (req: Request, res: Response) => {
  try {
    res.json(refundOrder(req.params.id));
  } catch (err) {
    fail(res, err);
  }
});

export default router;
