/**
 * ops.ts — 代运营域路由（2026-11-07）。
 *
 * 挂载点：/api/ops（server/src/index.ts 一行 app.use，必须排在 proxyFallback
 * 之前）。外接模块：不改任何既有逻辑。
 *
 * 产业方向（手工艺人代运营）：对方只上架商品，我们跑完整条链路 ——
 *   ① 上架商品（复用 /api/merchant/products，本域只读计数）
 *   ② 自动生营销帖（复用 social 域：商品 → 按平台风味的文案）
 *   ③ 多平台分发（本域编排：一次调用按平台/账号批量建帖 + 发布）
 *   ④ 快递寄出（本域新增：建运单 → 交运取面单 → 同步轨迹）
 *
 *   GET  /api/ops/overview                     → 四步各自进度（智能体决策入口）
 *   POST /api/ops/marketing/launch             → 一键分发：商品 → 多账号建帖并发布
 *                                                （已发过的账号跳过 = 幂等）
 *   GET  /api/ops/carriers                     → 六家承运商规格 + real 凭证契约
 *   GET  /api/ops/shipments                    → 运单列表（?status= 筛选）
 *   POST /api/ops/shipments                    → 建运单（一单一份，收件信息必填）
 *   GET  /api/ops/shipments/:id                → 运单详情 + 轨迹事件
 *   POST /api/ops/shipments/:id/ship           → 交运取面单（失败不 5xx，可重试）
 *   POST /api/ops/shipments/:id/track          → 同步轨迹（事件去重，只前进不回退）
 *
 * IMPORTANT: 字面量路径全部注册在 /:id 之前，避免 Express 把 "shipments" 当 id。
 */

import { Router, Request, Response } from 'express';
import { CARRIERS, realEnvContract } from '../../lib/shipping';
import { marketingCopy } from '../../lib/social-platforms/copy';
import {
  SocialPublishError,
  createPost,
  getAccount,
  getProductBrief,
  listAccounts,
  listPosts,
  publishPost,
  type AccountRow,
} from '../../storage/social-publish';
import {
  OpsShipError,
  createShipment,
  getShipment,
  listShipEvents,
  listShipments,
  shipShipment,
  stats as shipStats,
  syncShipmentTracking,
} from '../../storage/ops-shipping';
import { listProducts } from '../../storage/merchant-board';
import { apiGuard } from '../../middleware/api-guard';

const router = Router();

// 写接口（一键分发 / 建运单 / 交运 / 同步轨迹）默认只允许本机；远程需 SF_API_TOKEN。
router.use(apiGuard());

function fail(res: Response, err: unknown): void {
  if (err instanceof SocialPublishError || err instanceof OpsShipError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }
  res.status(500).json({ error: { code: 'INTERNAL', message: (err as Error).message } });
}

function body(req: Request): Record<string, unknown> {
  return (req.body ?? {}) as Record<string, unknown>;
}

function str(v: unknown, max = 256): string {
  return typeof v === 'string' ? v.slice(0, max) : '';
}

function strList(v: unknown, max = 64): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    if (typeof item !== 'string') continue;
    const s = item.trim().slice(0, max);
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

/** 一键分发里单个目标的结果（成功/失败/跳过都是结构化对象，不 5xx）。 */
interface LaunchItem {
  account_id: string;
  platform: string;
  post_id: string | null;
  status: string;
  external_id: string | null;
  code: string | null;
  error: string | null;
  /** 该商品在这个账号上此前已发布 → 本次未重复发。 */
  skipped: boolean;
}

// ── 全流程进度 ────────────────────────────────────────────────────────────────

/**
 * 四步进度汇总。智能体每轮先读这个：哪一步是空的，就把动作放在那一步上
 * （没有商品 → 先上架；有商品没帖 → 生成；有帖没发 → 分发；有单没运单 → 寄出）。
 */
router.get('/overview', (_req: Request, res: Response) => {
  try {
    const products = listProducts();
    const posts = listPosts();
    const byStatus = (s: string): number => posts.filter((p) => p.status === s).length;
    const ship = shipStats();

    res.json({
      steps: [
        {
          key: 'listing',
          name: '上架商品',
          count: products.length,
          done: products.length > 0,
          next_hint: 'POST /api/merchant/products',
        },
        {
          key: 'copywriting',
          name: '生成营销帖',
          count: posts.length,
          done: posts.length > 0,
          next_hint: 'POST /api/ops/marketing/launch（带 product_id，文案由平台风味模板生成）',
        },
        {
          key: 'distribution',
          name: '多平台分发',
          count: byStatus('published'),
          done: byStatus('published') > 0,
          next_hint: 'POST /api/ops/marketing/launch（带 platforms 或 account_ids）',
        },
        {
          key: 'fulfillment',
          name: '快递寄出',
          count: ship.shipments,
          done: ship.shipped + ship.in_transit + ship.delivered > 0,
          next_hint: 'POST /api/ops/shipments → POST /api/ops/shipments/:id/ship',
        },
      ],
      products: products.length,
      posts: {
        total: posts.length,
        draft: byStatus('draft'),
        publishing: byStatus('publishing'),
        published: byStatus('published'),
        failed: byStatus('failed'),
      },
      shipments: ship,
      accounts: listAccounts().length,
    });
  } catch (err) {
    fail(res, err);
  }
});

// ── 一键分发（商品 → 多平台营销帖） ───────────────────────────────────────────

router.post('/marketing/launch', async (req: Request, res: Response) => {
  try {
    const b = body(req);
    const productId = str(b.product_id, 64);
    if (!productId) {
      res
        .status(400)
        .json({ error: { code: 'INVALID_PRODUCT_ID', message: 'product_id 不能为空' } });
      return;
    }
    const product = getProductBrief(productId);
    if (!product) {
      res
        .status(404)
        .json({ error: { code: 'PRODUCT_NOT_FOUND', message: `商品不存在: ${productId}` } });
      return;
    }

    const accountIds = strList(b.account_ids);
    const platforms = strList(b.platforms, 32);
    if (accountIds.length === 0 && platforms.length === 0) {
      res.status(400).json({
        error: {
          code: 'INVALID_TARGETS',
          message: '至少要给 platforms（按平台自动选账号）或 account_ids（指定账号）',
        },
      });
      return;
    }

    // 目标账号集合：显式 account_ids 优先；platforms 取该平台第一个 active 账号。
    const items: LaunchItem[] = [];
    const targets: AccountRow[] = [];
    const seen = new Set<string>();

    for (const id of accountIds) {
      const account = getAccount(id);
      if (!account) {
        items.push({
          account_id: id,
          platform: '',
          post_id: null,
          status: 'failed',
          external_id: null,
          code: 'ACCOUNT_NOT_FOUND',
          error: `账号不存在: ${id}`,
          skipped: false,
        });
        continue;
      }
      if (!seen.has(account.id)) {
        seen.add(account.id);
        targets.push(account);
      }
    }

    const allAccounts = listAccounts();
    for (const platform of platforms) {
      const hit = allAccounts.find((a) => a.platform === platform && a.status === 'active');
      if (!hit) {
        items.push({
          account_id: '',
          platform,
          post_id: null,
          status: 'failed',
          external_id: null,
          code: 'NO_ACCOUNT',
          error: `平台 ${platform} 没有可用的发布账号，先 POST /api/social-publish/accounts 建号`,
          skipped: false,
        });
        continue;
      }
      if (!seen.has(hit.id)) {
        seen.add(hit.id);
        targets.push(hit);
      }
    }

    // 幂等：同一商品 + 同一账号若已有帖子，复用而不是再建一条；
    // 已发布的直接跳过（营销帖重复发到真实平台是不可逆的）。
    const existingPosts = listPosts();
    for (const account of targets) {
      const prior = existingPosts.find(
        (p) => p.account_id === account.id && p.product_id === productId,
      );
      if (prior && prior.status === 'published') {
        items.push({
          account_id: account.id,
          platform: account.platform,
          post_id: prior.id,
          status: 'published',
          external_id: prior.external_id,
          code: null,
          error: null,
          skipped: true,
        });
        continue;
      }

      let postId = prior?.id ?? '';
      if (!postId) {
        const copy = marketingCopy(
          { name: product.name, price_cents: product.price_cents },
          account.platform,
        );
        postId = createPost({
          account_id: account.id,
          title: copy.title,
          content: copy.content,
          product_id: productId,
        }).id;
      }

      try {
        const result = await publishPost(postId);
        items.push({
          account_id: account.id,
          platform: account.platform,
          post_id: postId,
          status: result.post.status,
          external_id: result.receipt.external_id ?? null,
          code: result.receipt.code ?? null,
          error: result.receipt.error ?? null,
          skipped: false,
        });
      } catch (err) {
        // 单账号失败不拖垮整批：其余平台该发还发。
        items.push({
          account_id: account.id,
          platform: account.platform,
          post_id: postId,
          status: 'failed',
          external_id: null,
          code: err instanceof SocialPublishError ? err.code : 'PUBLISH_ERROR',
          error: (err as Error).message,
          skipped: false,
        });
      }
    }

    res.json({
      product: { id: productId, name: product.name, price_cents: product.price_cents },
      items,
      summary: {
        targets: items.length,
        published: items.filter((i) => i.status === 'published' && !i.skipped).length,
        skipped: items.filter((i) => i.skipped).length,
        failed: items.filter((i) => i.status === 'failed').length,
      },
    });
  } catch (err) {
    fail(res, err);
  }
});

// ── 承运商自描述 ──────────────────────────────────────────────────────────────

router.get('/carriers', (_req: Request, res: Response) => {
  res.json({
    carriers: CARRIERS.map((c) => ({
      ...c,
      modes: ['mock', 'real'],
      real_env: realEnvContract(c.id) ?? null,
    })),
  });
});

// ── 运单 ──────────────────────────────────────────────────────────────────────

router.get('/shipments', (req: Request, res: Response) => {
  try {
    const status = str(req.query.status, 32);
    res.json({ shipments: listShipments(status || undefined) });
  } catch (err) {
    fail(res, err);
  }
});

router.post('/shipments', (req: Request, res: Response) => {
  try {
    const b = body(req);
    const shipment = createShipment({
      order_id: str(b.order_id, 64),
      carrier: str(b.carrier, 32),
      receiver_name: str(b.receiver_name, 64),
      receiver_phone: str(b.receiver_phone, 32),
      receiver_address: str(b.receiver_address, 512),
      weight_grams: b.weight_grams as number | undefined,
      remark: str(b.remark, 256),
      mode: str(b.mode, 8),
    });
    res.status(201).json({ shipment });
  } catch (err) {
    fail(res, err);
  }
});

router.get('/shipments/:id', (req: Request, res: Response) => {
  try {
    const id = str(req.params.id, 64);
    const shipment = getShipment(id);
    if (!shipment) {
      res
        .status(404)
        .json({ error: { code: 'SHIPMENT_NOT_FOUND', message: `运单不存在: ${id}` } });
      return;
    }
    res.json({ shipment, events: listShipEvents(id) });
  } catch (err) {
    fail(res, err);
  }
});

router.post('/shipments/:id/ship', async (req: Request, res: Response) => {
  try {
    const result = await shipShipment(str(req.params.id, 64));
    res.json(result);
  } catch (err) {
    fail(res, err);
  }
});

router.post('/shipments/:id/track', async (req: Request, res: Response) => {
  try {
    const result = await syncShipmentTracking(str(req.params.id, 64));
    res.json(result);
  } catch (err) {
    fail(res, err);
  }
});

export default router;
