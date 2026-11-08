/**
 * craft-profit.ts — 产品盈利看板路由（2026-11-07）。
 *
 * 挂载点：/api/craft-profit（server/src/index.ts 一行 app.use，proxyFallback
 * 之前）。数据全部来自 storage/craft-profit.ts（cp_products / cp_sales）。
 *
 * GET  /api/craft-profit/overview?days=30     → 收入/成本分项/盈利/每 100 元去向/环比
 * GET  /api/craft-profit/timeseries?days=30&product_id=? → 每日盈利趋势（零值补齐，可按商品）
 * GET  /api/craft-profit/products?days=30     → 商品盈利排行（含没卖出的）
 * GET  /api/craft-profit/products/:id?days=30 → 单商品追踪（聚合行，404 商品不存在）
 * GET  /api/craft-profit/sales?limit=20&product_id=? → 最近销售流水（可按商品）
 * POST /api/craft-profit/products             → 上架商品（写，apiGuard）
 * POST /api/craft-profit/sales                → 记一笔销售（写，apiGuard）
 * POST /api/craft-profit/demo-seed            → 灌演示数据（写，apiGuard，幂等）
 * GET  /api/craft-profit/team/status          → 代卖团队引用（team/group id）
 * POST /api/craft-profit/team/setup           → 幂等搭建代卖 agent 团队（写，apiGuard）
 *
 * 口径在 storage 层算好（盈利 = 售价 − 成本 − 快递），
 * 路由只做参数整形与错误转译，前端不自己减。
 */

import { Router, Request, Response } from 'express';
import {
  CraftProfitError,
  cancelSale,
  createProduct,
  createPublicOrder,
  createSale,
  deleteProduct,
  listProducts,
  listSales,
  markSaleDone,
  markSaleShipped,
  overview,
  paySale,
  productBreakdown,
  productDetail,
  seedDemo,
  timeseries,
} from '../../storage/craft-profit';
import { createShipment, markShipmentShipped } from '../../storage/ops-shipping';
import {
  autoStatus,
  initAutoOps,
  listEvents,
  runRound,
  setAutoOps,
} from '../../storage/craft-profit-agent';
import { craftTeamStatus, setupCraftTeam } from '../../storage/craft-team-setup';
import { deletePostsForProduct } from '../../storage/craft-posts';
import { apiGuard } from '../../middleware/api-guard';

const router = Router();

// 自动运营：settings 里开着就恢复定时器（重启后续跑）。
initAutoOps();

function parseDays(raw: unknown, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.round(n), 365);
}

function fail(res: Response, err: unknown): void {
  if (err instanceof CraftProfitError) {
    res.status(err.status).json({ error: { code: 'CRAFT_PROFIT_ERROR', message: err.message } });
    return;
  }
  res.status(500).json({ error: { code: 'INTERNAL', message: (err as Error).message } });
}

function body(req: Request): Record<string, unknown> {
  return (req.body ?? {}) as Record<string, unknown>;
}

/** query 里的可选字符串（product_id 之类）：空串/非字符串一律当没传。 */
function qstr(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/** 订单对外视图（公开接口/管理端共用）：买家实付 = (单价 + 运费) × 件数；
 *  营收统计不含运费（只算 qty×单价），两套口径各自自洽。 */
function orderView(sale: import('../../storage/craft-profit').CraftSale) {
  return {
    order_id: sale.id,
    product_id: sale.product_id,
    product_name: sale.product_name,
    qty: sale.qty,
    price_cents: sale.price_cents,
    shipping_cents: sale.shipping_cents,
    total_cents: (sale.price_cents + sale.shipping_cents) * sale.qty,
    status: sale.status,
    paid_at: sale.paid_at,
    created_at: sale.created_at,
    buyer_name: sale.buyer_name,
    buyer_contact: sale.buyer_contact,
    address: sale.address,
    note: sale.note,
    express_company: sale.express_company,
    tracking: sale.tracking,
  };
}

/** 快递公司显示名 → 快递域承运商 id（联动建运单用；认不出兜底顺丰）。 */
function carrierFromCompany(company: string): string {
  const c = company.trim();
  if (!c) return 'sf';
  if (c.includes('顺丰')) return 'sf';
  if (c.includes('中通')) return 'zto';
  if (c.includes('圆通')) return 'yto';
  if (c.includes('京东')) return 'jd';
  if (c.includes('邮政') || c.toUpperCase().includes('EMS')) return 'ems';
  if (c.includes('德邦')) return 'debang';
  return 'sf';
}

// ── 读端点 ────────────────────────────────────────────────────────────────────

router.get('/overview', (req: Request, res: Response) => {
  try {
    res.json(overview(parseDays(req.query.days, 30)));
  } catch (err) {
    fail(res, err);
  }
});

router.get('/timeseries', (req: Request, res: Response) => {
  try {
    res.json(timeseries(parseDays(req.query.days, 30), qstr(req.query.product_id)));
  } catch (err) {
    fail(res, err);
  }
});

router.get('/products', (req: Request, res: Response) => {
  try {
    res.json({ items: productBreakdown(parseDays(req.query.days, 30)) });
  } catch (err) {
    fail(res, err);
  }
});

router.get('/products/:id', (req: Request, res: Response) => {
  try {
    res.json(productDetail(req.params.id, parseDays(req.query.days, 30)));
  } catch (err) {
    fail(res, err);
  }
});

router.get('/sales', (req: Request, res: Response) => {
  try {
    res.json({
      items: listSales(Number(req.query.limit), qstr(req.query.product_id), qstr(req.query.status)),
    });
  } catch (err) {
    fail(res, err);
  }
});

// ── 代卖运营智能体（自动经营：营销 → 出单 → 联系快递员寄出）─────────────────

router.get('/agent/events', (req: Request, res: Response) => {
  try {
    res.json({ items: listEvents(Number(req.query.limit)) });
  } catch (err) {
    fail(res, err);
  }
});

router.get('/agent/status', (_req: Request, res: Response) => {
  try {
    res.json(autoStatus());
  } catch (err) {
    fail(res, err);
  }
});

// ── 代卖 agent 团队（CEO+营销+订单+快递+财务 流水线，群聊驱动）──────────────
router.get('/team/status', (_req: Request, res: Response) => {
  res.json({ team: craftTeamStatus() });
});

// ── 扫码购买（公开下单，2026-11-08）──────────────────────────────────────────
// 顾客扫商品二维码 → 购买页 → 这里落单。刻意不挂 apiGuard：顾客的手机不在
// 回环，加 token 就没人买得动了。防线换成输入有界（storage 层 qty≤20/字段截断）
// + 每 IP 固定窗口限流（60s / 10 单，内存表，重启清零）。落单固定 pending
// 待发货，发货走 [ship] 流水线与内部单同一口径。
const ORDER_RATE_WINDOW_MS = 60_000;
const ORDER_RATE_MAX = 10;
const orderHits = new Map<string, { windowStart: number; count: number }>();

function allowOrder(ip: string): boolean {
  const now = Date.now();
  const rec = orderHits.get(ip);
  if (!rec || now - rec.windowStart > ORDER_RATE_WINDOW_MS) {
    orderHits.set(ip, { windowStart: now, count: 1 });
    if (orderHits.size > 1000) {
      for (const [k, v] of orderHits) {
        if (now - v.windowStart > ORDER_RATE_WINDOW_MS) orderHits.delete(k);
      }
    }
    return true;
  }
  rec.count += 1;
  return rec.count <= ORDER_RATE_MAX;
}

router.post('/public/orders', (req: Request, res: Response) => {
  if (!allowOrder(req.ip ?? req.socket?.remoteAddress ?? 'unknown')) {
    res.status(429).json({
      error: { code: 'RATE_LIMITED', message: '下单太频繁，请稍后再试' },
    });
    return;
  }
  try {
    const b = body(req);
    const sale = createPublicOrder({
      product_id: b.product_id,
      qty: b.qty ?? 1,
      buyer_name: b.buyer_name,
      buyer_contact: b.buyer_contact,
      address: b.address,
      note: b.note,
    });
    res.status(201).json({ data: orderView(sale) });
  } catch (err) {
    fail(res, err);
  }
});

// 演示支付（2026-11-08 普通支付按钮）：unpaid → pending 待发货。订单 id 是
// 不可猜 UUID，支付/取消不创建资源，不占下单限流窗（限流只防下单刷单）。
router.post('/public/orders/:id/pay', (req: Request, res: Response) => {
  try {
    res.json({ data: orderView(paySale(req.params.id)) });
  } catch (err) {
    fail(res, err);
  }
});

// 顾客取消待支付订单（回补库存）；已支付订单需走商家退款流程，接口拒绝。
router.post('/public/orders/:id/cancel', (req: Request, res: Response) => {
  try {
    res.json({ data: orderView(cancelSale(req.params.id)) });
  } catch (err) {
    fail(res, err);
  }
});

// ── 写端点（上架 / 记销售 / 演示数据）────────────────────────────────────────
// 写接口默认只允许本机；远程调用需 SF_API_TOKEN（同 merchant-board 口径）。
router.use(apiGuard());

router.post('/products', (req: Request, res: Response) => {
  try {
    const b = body(req);
    res.status(201).json(
      createProduct({
        name: b.name,
        subtitle: b.subtitle,
        price_cents: b.price_cents,
        market_price_cents: b.market_price_cents,
        cost_cents: b.cost_cents,
        shipping_cents: b.shipping_cents,
        stock: b.stock,
        intro: b.intro,
        images: b.images,
        // 商品图（2026-11-08 商品售卖列表）：/api/fs/chat-upload 返回的 url
        image_url: b.image_url,
      }),
    );
  } catch (err) {
    fail(res, err);
  }
});

// 删除商品（2026-11-08 商品售卖列表）：商家操作走 apiGuard。销售流水保留
// 金额快照（历史盈利不变），商品行硬删。返回 {data} 包装方便前端统一解包。
router.delete('/products/:id', (req: Request, res: Response) => {
  try {
    // 卡片与商品同生共死（2026-11-08）：商品消失时连删其博文卡（直挂/反引）。
    // 必须先删博文（source_post_id 反引依赖商品行还在）再删商品。
    deletePostsForProduct(req.params.id);
    deleteProduct(req.params.id);
    res.json({ data: { deleted: true, id: req.params.id } });
  } catch (err) {
    fail(res, err);
  }
});

router.post('/sales', (req: Request, res: Response) => {
  try {
    const b = body(req);
    res.status(201).json(
      createSale({
        product_id: b.product_id,
        qty: b.qty,
        status: b.status,
        buyer_name: b.buyer_name,
        buyer_contact: b.buyer_contact,
        address: b.address,
        note: b.note,
      }),
    );
  } catch (err) {
    fail(res, err);
  }
});

// ── 订单履约（2026-11-08 全生命周期）──────────────────────────────────────────
// 发货填快递公司+运单号 → shipped；联动快递域建运单（与 [ship] 标记同一
// ops_shipments 表，看板快递 tab 直接可见）。快递域 fail-soft，不阻断订单发货。

router.post('/sales/:id/ship', (req: Request, res: Response) => {
  try {
    const b = body(req);
    const company = qstr(b.express_company) ?? '';
    const tracking = qstr(b.tracking) ?? '';
    const sale = markSaleShipped(req.params.id, tracking, company);
    try {
      const shipment = createShipment({
        order_id: sale.id,
        carrier: carrierFromCompany(company),
        receiver_name: sale.buyer_name || '买家',
        receiver_phone: sale.buyer_contact,
        receiver_address: sale.address || '(买家未留地址)',
        weight_grams: 500 * sale.qty,
        remark: `小店订单「${sale.product_name}」×${sale.qty}`,
        mode: 'mock',
      });
      markShipmentShipped(shipment.id, tracking, `商家发货：${company} ${tracking}`.trim());
    } catch {
      /* 快递域不可用/运单重复 → 只影响快递域记录，不影响订单状态 */
    }
    res.json({ data: orderView(sale) });
  } catch (err) {
    fail(res, err);
  }
});

router.post('/sales/:id/complete', (req: Request, res: Response) => {
  try {
    res.json({ data: orderView(markSaleDone(req.params.id)) });
  } catch (err) {
    fail(res, err);
  }
});

// 商家取消待支付订单（回补库存）；已支付订单走退款流程，不在本接口。
router.post('/sales/:id/cancel', (req: Request, res: Response) => {
  try {
    res.json({ data: orderView(cancelSale(req.params.id)) });
  } catch (err) {
    fail(res, err);
  }
});

router.post('/demo-seed', (_req: Request, res: Response) => {
  try {
    res.json(seedDemo());
  } catch (err) {
    fail(res, err);
  }
});

router.post('/agent/run', (_req: Request, res: Response) => {
  try {
    res.json(runRound());
  } catch (err) {
    fail(res, err);
  }
});

router.post('/agent/auto', (req: Request, res: Response) => {
  try {
    const b = body(req);
    res.json(setAutoOps({ enabled: b.enabled, interval_min: b.interval_min }));
  } catch (err) {
    fail(res, err);
  }
});

router.post('/team/setup', (_req: Request, res: Response) => {
  setupCraftTeam()
    .then((result) => res.status(result.created ? 201 : 200).json(result))
    .catch((err) => fail(res, err));
});

export default router;
