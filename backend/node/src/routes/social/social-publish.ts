/**
 * social-publish.ts — 社交发布域路由（2026-11-07）。
 *
 * 挂载点：/api/social-publish（server/src/index.ts 一行 app.use，必须排在
 * proxyFallback 之前）。外接模块：不改任何既有逻辑。
 *
 * 产业方向（手工艺人代运营）：对方上架商品，我们营销发布 + 寄出。
 *   GET  /api/social-publish/platforms            → 六大平台规格 + mock/real 凭证契约
 *   POST /api/social-publish/lint                 → 发布前合规预检（P0-3：三红线
 *                                                   词表 + 结构 + AIGC 标识检查，
 *                                                   不落库，返回 violations + 版本）
 *   GET  /api/social-publish/stats                → 各表计数
 *   GET  /api/social-publish/accounts             → 账号列表
 *   POST /api/social-publish/accounts             → 建账号（platform/account_name/auth_mode）
 *   DELETE /api/social-publish/accounts/:id       → 删账号（有帖则 409）
 *   GET  /api/social-publish/posts                → 帖子列表（?status= 筛选）
 *   GET  /api/social-publish/posts/:id            → 帖子详情
 *   POST /api/social-publish/posts                → 建帖子；带 product_id 则从
 *                                                   mb_products 一键生成营销文案
 *   POST /api/social-publish/posts/:id/submit-review → 提交人工审核（C5：draft|
 *                                                   rejected → pending_review）
 *   POST /api/social-publish/posts/:id/review     → 审核决定（C5+BE-06：approve|
 *                                                   reject + comment 自由意见留痕）
 *   POST /api/social-publish/posts/:id/publish    → 发布/重试（mock 或 real 由账号
 *                                                   auth_mode 决定，失败不 5xx；
 *                                                   pending_review/rejected 不可发）
 *   POST /api/social-publish/copy                 → 内容契约生成（规范第三章九字段，
 *                                                   template(format, brief, platform)）
 *   GET  /api/social-publish/posts/:id/log        → 发布回执（每次尝试一条）
 *
 * IMPORTANT: 字面量路径全部注册在 /:id 之前，避免 Express 把 "posts" 当 id。
 */

import { Router, Request, Response } from 'express';
import { PLATFORMS, realEnvContract, realFlow } from '../../lib/social-platforms';
import { marketingCopy, template, isContentFormat, CONTENT_FORMATS } from '../../lib/social-platforms/copy';
import { lintContent } from '../../lib/social-platforms/compliance-lint';
import {
  SocialPublishError,
  createAccount,
  createPost,
  deleteAccount,
  getAccount,
  getProductBrief,
  getPost,
  listAccounts,
  listPosts,
  listPublishLog,
  publishPost,
  reviewPost,
  stats,
  submitForReview,
} from '../../storage/social-publish';
import { apiGuard } from '../../middleware/api-guard';

const router = Router();

// 写接口（建账号 / 建帖 / 发布）默认只允许本机；远程调用需 SF_API_TOKEN。
router.use(apiGuard());

function fail(res: Response, err: unknown): void {
  if (err instanceof SocialPublishError) {
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

// ── 平台自描述 ────────────────────────────────────────────────────────────────

router.get('/platforms', (_req: Request, res: Response) => {
    res.json({
    platforms: PLATFORMS.map((p) => ({
      ...p,
      modes: ['mock', 'real'],
      real_env: realEnvContract(p.id) ?? null,
      real_flow: realFlow(p.id),
    })),
  });
});

// ── 合规预检（P0-3，不落库）─────────────────────────────────────────────────
// 发布前四道检查的机器可判三道：词表（三红线）/ 结构（title_max·content_max）/
// AIGC 标识。第四道人工门在发布链（WAITING_HUMAN，T09 语义）。
router.post('/lint', (req: Request, res: Response) => {
  try {
    const b = body(req);
    const result = lintContent({
      platform: str(b.platform, 64),
      title: str(b.title, 1024),
      content: str(b.content, 20000),
      ai_label: b.ai_label === true,
      label_text: str(b.label_text, 128),
    });
    res.json(result);
  } catch (err) {
    fail(res, err);
  }
});

router.get('/stats', (_req: Request, res: Response) => {
  try {
    res.json(stats());
  } catch (err) {
    fail(res, err);
  }
});

// ── 账号 ──────────────────────────────────────────────────────────────────────

router.get('/accounts', (_req: Request, res: Response) => {
  try {
    res.json({ accounts: listAccounts() });
  } catch (err) {
    fail(res, err);
  }
});

router.post('/accounts', (req: Request, res: Response) => {
  try {
    const b = body(req);
    const account = createAccount({
      platform: str(b.platform, 64),
      account_name: str(b.account_name, 64),
      auth_mode: str(b.auth_mode, 16),
      credentials: b.credentials,
    });
    res.status(201).json({ account });
  } catch (err) {
    fail(res, err);
  }
});

router.delete('/accounts/:id', (req: Request, res: Response) => {
  try {
    deleteAccount(str(req.params.id, 64));
    res.json({ ok: true });
  } catch (err) {
    fail(res, err);
  }
});

// ── 帖子 ──────────────────────────────────────────────────────────────────────

router.get('/posts', (req: Request, res: Response) => {
  try {
    const status = str(req.query.status, 32);
    res.json({ posts: listPosts(status || undefined) });
  } catch (err) {
    fail(res, err);
  }
});

router.get('/posts/:id', (req: Request, res: Response) => {
  try {
    const post = getPost(str(req.params.id, 64));
    if (!post) {
      res.status(404).json({ error: { code: 'POST_NOT_FOUND', message: '帖子不存在' } });
      return;
    }
    res.json({ post });
  } catch (err) {
    fail(res, err);
  }
});

router.post('/posts', (req: Request, res: Response) => {
  try {
    const b = body(req);
    const accountId = str(b.account_id, 64);
    const account = getAccount(accountId);
    if (!account) {
      res.status(404).json({ error: { code: 'ACCOUNT_NOT_FOUND', message: '账号不存在' } });
      return;
    }
    const productId = str(b.product_id, 64);
    let title = str(b.title, 256);
    let content = str(b.content, 20000);
    if (productId && !content) {
      const product = getProductBrief(productId);
      if (!product) {
        res.status(404).json({ error: { code: 'PRODUCT_NOT_FOUND', message: '商品不存在' } });
        return;
      }
      const copy = marketingCopy(product, account.platform);
      title = title || copy.title;
      content = copy.content;
    }
    const post = createPost({
      account_id: accountId,
      title,
      content,
      media: b.media,
      product_id: productId,
      // P0-4 AIGC 标识透传（缺省带标；V07 平台入口未核前保守全带标）。
      ai_label: b.ai_label !== false,
      label_text: str(b.label_text, 128) || undefined,
    });
    res.status(201).json({ post });
  } catch (err) {
    fail(res, err);
  }
});

router.post('/posts/:id/submit-review', (req: Request, res: Response) => {
  try {
    const post = submitForReview(str(req.params.id, 64));
    res.json({ post });
  } catch (err) {
    fail(res, err);
  }
});

router.post('/posts/:id/review', (req: Request, res: Response) => {
  try {
    const b = body(req);
    const decision = str(b.decision, 16);
    if (decision !== 'approve' && decision !== 'reject') {
      res.status(400).json({
        error: { code: 'BAD_DECISION', message: "decision must be 'approve' or 'reject'" },
      });
      return;
    }
    const result = reviewPost(
      str(req.params.id, 64),
      decision,
      str(b.comment, 500) || undefined,
      str(b.reviewer, 64) || undefined,
    );
    res.json(result);
  } catch (err) {
    fail(res, err);
  }
});

router.post('/posts/:id/publish', async (req: Request, res: Response) => {
  try {
    const result = await publishPost(str(req.params.id, 64));
    res.json(result);
  } catch (err) {
    fail(res, err);
  }
});

router.get('/posts/:id/log', (req: Request, res: Response) => {
  try {
    res.json({ log: listPublishLog(str(req.params.id, 64)) });
  } catch (err) {
    fail(res, err);
  }
});

// ── 内容契约生成（规范第三章，第六章对接清单 ①）──────────────────────────────
// template(format, brief, platform) → 九字段契约对象；只生成不落库，
// 建帖子时可直接用 title/content（草稿→审核→发布链路）。
router.post('/copy', (req: Request, res: Response) => {
  try {
    const b = body(req);
    const format = str(b.format, 32);
    if (!isContentFormat(format)) {
      res.status(400).json({
        error: {
          code: 'UNKNOWN_FORMAT',
          message: `format 必须是: ${CONTENT_FORMATS.join(' / ')}`,
        },
      });
      return;
    }
    const platform = str(b.platform, 64);
    let name = str(b.name, 128);
    let priceCents = 0;
    const productId = str(b.product_id, 64);
    if (productId) {
      const product = getProductBrief(productId);
      if (!product) {
        res.status(404).json({ error: { code: 'PRODUCT_NOT_FOUND', message: '商品不存在' } });
        return;
      }
      name = product.name;
      priceCents = product.price_cents;
    } else if (!name) {
      res.status(400).json({
        error: { code: 'INVALID_BRIEF', message: '需要 product_id 或 name' },
      });
      return;
    }
    if (Number.isFinite(Number(b.price_cents))) {
      priceCents = Math.max(0, Math.round(Number(b.price_cents)));
    }
    const contract = template(format, { name, price_cents: priceCents }, platform);
    res.json({ contract });
  } catch (err) {
    fail(res, err);
  }
});

export default router;
