/**
 * merchant-board.ts — 功能线①「商家数据看板」路由（2026-11-05）。
 *
 * 挂载点：/api/merchant（server/src/index.ts 一行 app.use，必须排在
 * proxyFallback 之前）。这是外接模块：主入口只加 import + app.use 两行，
 * 不改任何既有逻辑，也不依赖 ③ 的 memory-handoff 或队友的 dashboard。
 *
 * GET  /api/merchant/stats                  → 各表计数
 * GET  /api/merchant/overview               → 营收/成本/毛利/毛利率/客单价/首单
 *                                             （?start&end 可选，缺省为全量；
 *                                               &compare=1 额外返回上一等长区间的环比）
 * GET  /api/merchant/orders/timeseries      → 订单流水分时（零值补齐 + 峰值）
 * GET  /api/merchant/traffic/curve          → 客流曲线（PV/UV/转化/分渠道）
 * GET  /api/merchant/ledger                 → 收支流水
 * GET  /api/merchant/orders                 → 订单列表（status 筛 + offset 分页
 *                                             + start/end 区间，返回 total/has_more）
 * GET  /api/merchant/reconcile              → 账实对账（差额逐项给出 issues）
 * GET  /api/merchant/evidence               → 演示证据包（①③ 留痕汇总，JSON）
 * GET  /api/merchant/evidence.md            → 同上，可下载的 Markdown 答辩材料
 * GET  /api/merchant/evidence/scorecard.md → 一页评委速览（评分维度 → 可核实证据）
 * GET  /api/merchant/evidence/orders.csv   → 区间内订单明细 CSV（UTF-8 BOM）
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
import {
  buildEvidence,
  evidenceFilename,
  evidenceMarkdown,
  evidenceOrdersCsv,
  evidenceScorecard,
} from '../storage/evidence';
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

router.get('/overview', (req: Request, res: Response) => {
  try {
    res.json(overview({ start: req.query.start, end: req.query.end, compare: req.query.compare }));
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

// 订单列表（含状态 + 分页 + 时间区间）。以前只有聚合，业务想知道「第 3 单是待付还是已退」
// 只能翻流水反推；而 limit 又封顶 500，单量一大就再也翻不到老单。
// 注意：这个路径以前没有注册，GET /api/merchant/orders 会落到 proxyFallback 被转给
// 旧 Python 后端，返回 503 PYTHON_BACKEND_UNAVAILABLE —— 看起来像服务挂了。
router.get('/orders', (req: Request, res: Response) => {
  try {
    res.json(
      listOrders({
        limit: req.query.limit,
        offset: req.query.offset,
        status: str(req.query.status, 16),
        start: req.query.start,
        end: req.query.end,
      }),
    );
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

// ── 演示证据包：把 ①③ 的留痕合成一份可核实、可下载的答辩材料 ──────────────────
// 纯只读；非法 start/end 由 overview()/listOrders() 抛 MerchantError(400)，
// 这里不重复解析时间，页面与附件就不会出现两套口径。
function evidenceQuery(req: Request) {
  return { start: req.query.start, end: req.query.end, limit: req.query.limit };
}

router.get('/evidence/orders.csv', (req: Request, res: Response) => {
  try {
    const csv = evidenceOrdersCsv(evidenceQuery(req));
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="${evidenceFilename('csv')}"`);
    res.send(csv);
  } catch (err) {
    fail(res, err);
  }
});

router.get('/evidence.md', (req: Request, res: Response) => {
  try {
    const report = buildEvidence(evidenceQuery(req));
    res.set('Content-Type', 'text/markdown; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="${evidenceFilename('md', report.generated_at)}"`);
    res.send(evidenceMarkdown(report));
  } catch (err) {
    fail(res, err);
  }
});

// 一页速览与七章报告共用同一份 buildEvidence：数字、窗口、口径完全一致，
// 不会出现「首页说五步全通、正文说未通」这种现场露馅的两套说法。
router.get('/evidence/scorecard.md', (req: Request, res: Response) => {
  try {
    const report = buildEvidence(evidenceQuery(req));
    res.set('Content-Type', 'text/markdown; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="${evidenceFilename('scorecard', report.generated_at)}"`);
    res.send(evidenceScorecard(report));
  } catch (err) {
    fail(res, err);
  }
});

router.get('/evidence', (req: Request, res: Response) => {
  try {
    res.json(buildEvidence(evidenceQuery(req)));
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
