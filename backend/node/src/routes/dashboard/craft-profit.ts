/**
 * craft-profit.ts — 产品盈利看板路由（2026-11-07）。
 *
 * 挂载点：/api/craft-profit（server/src/index.ts 一行 app.use，proxyFallback
 * 之前）。数据全部来自 storage/craft-profit.ts（cp_products / cp_sales）。
 *
 * GET  /api/craft-profit/overview?days=30     → 收入/成本分项/盈利/每 100 元去向/环比
 * GET  /api/craft-profit/timeseries?days=30   → 每日盈利趋势（零值补齐）
 * GET  /api/craft-profit/products?days=30     → 商品盈利排行（含没卖出的）
 * GET  /api/craft-profit/sales?limit=20       → 最近销售流水
 * POST /api/craft-profit/products             → 上架商品（写，apiGuard）
 * POST /api/craft-profit/sales                → 记一笔销售（写，apiGuard）
 * POST /api/craft-profit/demo-seed            → 灌演示数据（写，apiGuard，幂等）
 * GET  /api/craft-profit/team/status          → 代卖团队引用（team/group id）
 * POST /api/craft-profit/team/setup           → 幂等搭建代卖 agent 团队（写，apiGuard）
 *
 * 口径在 storage 层算好（盈利 = 售价 − 给手艺人 − 快递 − 营销），
 * 路由只做参数整形与错误转译，前端不自己减。
 */

import { Router, Request, Response } from 'express';
import {
  CraftProfitError,
  createProduct,
  createSale,
  listProducts,
  listSales,
  overview,
  productBreakdown,
  seedDemo,
  timeseries,
} from '../../storage/craft-profit';
import {
  autoStatus,
  initAutoOps,
  listEvents,
  runRound,
  setAutoOps,
} from '../../storage/craft-profit-agent';
import { craftTeamStatus, setupCraftTeam } from '../../storage/craft-team-setup';
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
    res.json(timeseries(parseDays(req.query.days, 30)));
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

router.get('/sales', (req: Request, res: Response) => {
  try {
    res.json({ items: listSales(Number(req.query.limit)) });
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

// ── 写端点（上架 / 记销售 / 演示数据）────────────────────────────────────────
// 写接口默认只允许本机；远程调用需 SF_API_TOKEN（同 merchant-board 口径）。
router.use(apiGuard());

router.post('/products', (req: Request, res: Response) => {
  try {
    const b = body(req);
    res.status(201).json(
      createProduct({
        name: b.name,
        price_cents: b.price_cents,
        artisan_cents: b.artisan_cents,
        shipping_cents: b.shipping_cents,
        marketing_cents: b.marketing_cents,
      }),
    );
  } catch (err) {
    fail(res, err);
  }
});

router.post('/sales', (req: Request, res: Response) => {
  try {
    const b = body(req);
    res.status(201).json(createSale({ product_id: b.product_id, qty: b.qty }));
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
