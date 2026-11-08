/**
 * social-publish.ts — 社交发布域路由（2026-11-07）。
 *
 * 挂载点：/api/social-publish（server/src/index.ts 一行 app.use，必须排在
 * proxyFallback 之前）。外接模块：不改任何既有逻辑。
 *
 * 产业方向（手工艺人代运营）：对方上架商品，我们营销发布 + 寄出。
 *   GET  /api/social-publish/platforms            → 六大平台规格 + mock/real 凭证契约
 *   GET  /api/social-publish/stats                → 各表计数
 *   GET  /api/social-publish/accounts             → 账号列表
 *   POST /api/social-publish/accounts             → 建账号（platform/account_name/auth_mode）
 *   DELETE /api/social-publish/accounts/:id       → 删账号（有帖则 409）
 *   GET  /api/social-publish/posts                → 帖子列表（?status= 筛选）
 *   GET  /api/social-publish/posts/:id            → 帖子详情
 *   POST /api/social-publish/posts                → 建帖子；带 product_id 则从
 *                                                   mb_products 一键生成营销文案
 *   POST /api/social-publish/posts/:id/publish    → 发布/重试（mock 或 real 由账号
 *                                                   auth_mode 决定，失败不 5xx）
 *   GET  /api/social-publish/posts/:id/log        → 发布回执（每次尝试一条）
 *   GET  /api/social-publish/xhs/auth-url         → 小红书 OAuth2 授权页 URL（一次性
 *                                                   浏览器登录，回调带 ?code=）
 *   POST /api/social-publish/xhs/exchange         → code 换 access_token+refresh_token，
 *                                                   回写 .env（约 2h 有效）
 *   POST /api/social-publish/xhs/refresh          → refresh_token 续期，回写 .env
 *   GET  /api/social-publish/xhs/token-status     → token 状态（打码，不回显明文）
 *
 * IMPORTANT: 字面量路径全部注册在 /:id 之前，避免 Express 把 "posts" 当 id。
 */

import { Router, Request, Response } from 'express';
import { PLATFORMS, realEnvContract, realFlow } from '../../lib/social-platforms';
import { marketingCopy } from '../../lib/social-platforms/copy';
import {
  buildXhsAuthUrl,
  exchangeXhsCode,
  refreshXhsToken,
  xhsTokenStatus,
} from '../../lib/social-platforms/xhs-token';
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
  stats,
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

router.get('/stats', (_req: Request, res: Response) => {
  try {
    res.json(stats());
  } catch (err) {
    fail(res, err);
  }
});

// ── 小红书 OAuth2 token 生命周期（2026-11-08）────────────────────────────────
// 链路：auth-url（一次性浏览器登录）→ 回调拿 code → exchange 换 token 写 .env →
// access_token 约 2h 过期后 refresh 续期再写 .env。全部无 5xx，结构化回执。

// ① 浏览器授权 URL——整条链路唯一需要弹浏览器登录的一步
router.get('/xhs/auth-url', (req: Request, res: Response) => {
  const state = str(req.query.state, 64) || undefined;
  res.json(buildXhsAuthUrl(state));
});

// ② 授权回调 ?code= 换 access_token + refresh_token，回写 .env
router.post('/xhs/exchange', async (req: Request, res: Response) => {
  try {
    res.json(await exchangeXhsCode(str(body(req).code, 256)));
  } catch (err) {
    fail(res, err);
  }
});

// ③ refresh_token 续期（约 2h 一次；纯服务端 HTTP，不需要浏览器）
router.post('/xhs/refresh', async (_req: Request, res: Response) => {
  try {
    res.json(await refreshXhsToken());
  } catch (err) {
    fail(res, err);
  }
});

// ④ token 状态自省（打码，不回显明文；供前端「已配置/已过期」提示）
router.get('/xhs/token-status', (_req: Request, res: Response) => {
  res.json(xhsTokenStatus());
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
    });
    res.status(201).json({ post });
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

export default router;
