/**
 * craft-products.ts — 商品目录路由（2026-11-08，craft 域扩展）。
 *
 * 挂载点：/api/craft-products（server/src/index.ts 一行 app.use，proxyFallback
 * 之前）。数据复用 storage/craft-profit.ts 的 cp_products（扩展 image_url/
 * status/source_post_id 列，不另建目录表）——盈利口径端点仍在
 * /api/craft-profit/products，本路由是流水线/看板用的目录 CRUD 面。
 *
 * POST  /api/craft-products        → 建商品（写，apiGuard）
 * GET   /api/craft-products?status= → 商品列表（active|off_shelf 过滤）
 * PATCH /api/craft-products/:id    → 更新商品（写，apiGuard；status 两个方向
 *                                     都合法：active ↔ off_shelf）
 *
 * 响应字段 product_id 与 id 同值（cp_products.id 的别名，契约面向流水线
 * 用 product_id，兼容盈利域旧字段名 id）。source_post_id 的存在性校验放
 * 本层（storage 不引 craft_posts，避免循环依赖）。
 */

import { Router, Request, Response } from 'express';
import {
  CraftProfitError,
  createProduct,
  getProduct,
  listProducts,
  updateProduct,
} from '../../storage/craft-profit';
import { getPost } from '../../storage/craft-posts';
import { apiGuard } from '../../middleware/api-guard';

const router = Router();

/** storage 错误 → 统一错误码（404 商品不存在 / 400 参数 / 422 引用不存在）。 */
function codeFor(status: number): string {
  if (status === 404) return 'PRODUCT_NOT_FOUND';
  if (status === 422) return 'POST_NOT_FOUND';
  return 'INVALID_INPUT';
}

function fail(res: Response, err: unknown): void {
  if (err instanceof CraftProfitError) {
    res.status(err.status).json({ error: { code: codeFor(err.status), message: err.message } });
    return;
  }
  res.status(500).json({ error: { code: 'INTERNAL', message: (err as Error).message } });
}

function body(req: Request): Record<string, unknown> {
  return (req.body ?? {}) as Record<string, unknown>;
}

/** 契约输出：product_id 是 id 的别名（同值），其余是 cp_products 扩展全量。 */
function out(p: ReturnType<typeof createProduct>): Record<string, unknown> {
  return { ...p, product_id: p.id };
}

/** source_post_id 存在性校验：空跳过；有值必须是已存在的博文（422）。 */
function ensurePostRef(v: unknown): void {
  const s = typeof v === 'string' ? v.trim() : '';
  if (!s) return;
  if (!getPost(s)) {
    throw new CraftProfitError(`来源博文不存在: ${s}`, 422);
  }
}

// ── 读端点 ────────────────────────────────────────────────────────────────────

router.get('/', (req: Request, res: Response) => {
  try {
    const status = typeof req.query.status === 'string' && req.query.status.trim()
      ? req.query.status.trim()
      : undefined;
    res.json({ items: listProducts(status ? { status } : {}).map(out) });
  } catch (err) {
    fail(res, err);
  }
});

/** 单条读（看板/流水线取单商品目录用；不在最小契约里，顺手挂上）。 */
router.get('/:id', (req: Request, res: Response) => {
  try {
    const p = getProduct(req.params.id);
    if (!p) throw new CraftProfitError('product not found', 404);
    res.json(out(p));
  } catch (err) {
    fail(res, err);
  }
});

// ── 写端点（建商品 / 更新商品）──────────────────────────────────────────────
// 写接口默认只允许本机；远程调用需 SF_API_TOKEN（同 craft-profit 口径）。
router.use(apiGuard());

router.post('/', (req: Request, res: Response) => {
  try {
    const b = body(req);
    ensurePostRef(b.source_post_id);
    res.status(201).json(out(createProduct(b)));
  } catch (err) {
    fail(res, err);
  }
});

router.patch('/:id', (req: Request, res: Response) => {
  try {
    const b = body(req);
    ensurePostRef(b.source_post_id);
    res.json(out(updateProduct(req.params.id, b)));
  } catch (err) {
    fail(res, err);
  }
});

export default router;
