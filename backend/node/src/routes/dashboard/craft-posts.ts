/**
 * craft-posts.ts — 小红书博文路由（2026-11-08）。
 *
 * 挂载点：/api/craft-posts（server/src/index.ts 一行 app.use，proxyFallback
 * 之前）。数据全部来自 storage/craft-posts.ts（craft_posts）。
 *
 * POST  /api/craft-posts              → 建博文（写，apiGuard；status 只收
 *                                       draft|confirmed，缺省 draft）
 * GET   /api/craft-posts?status=&days= → 博文列表（status 过滤 / 近 N 天）
 * GET   /api/craft-posts/:id          → 单条（404 不存在）
 * PATCH /api/craft-posts/:id          → 内容更新 + 状态迁移（写，apiGuard；
 *                                       状态机 draft→confirmed→published 单向，
 *                                       非法迁移 422 INVALID_TRANSITION；迁移到
 *                                       published 同步落 [post] 社媒标记，结果随
 *                                       响应可见；发布即冻结——published 后改内容
 *                                       字段 422 FROZEN，同值幂等 no-op 放行）
 *
 * 路由只做参数整形与错误转译（统一 { error: { code, message } }），口径与
 * 状态机都在 storage 层。
 */

import { Router, Request, Response } from 'express';
import {
  CraftPostError,
  createPost,
  getPost,
  listPosts,
  updatePost,
} from '../../storage/craft-posts';
import { apiGuard } from '../../middleware/api-guard';

const router = Router();

function fail(res: Response, err: unknown): void {
  if (err instanceof CraftPostError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }
  res.status(500).json({ error: { code: 'INTERNAL', message: (err as Error).message } });
}

function body(req: Request): Record<string, unknown> {
  return (req.body ?? {}) as Record<string, unknown>;
}

/** query 里的可选天数窗口：空/非法当没传（不过滤）。 */
function qdays(raw: unknown): number | undefined {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.round(n), 365) : undefined;
}

/** query 里的可选字符串：空串/非字符串一律当没传。 */
function qstr(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

// ── 读端点 ────────────────────────────────────────────────────────────────────

router.get('/', (req: Request, res: Response) => {
  try {
    const days = qdays(req.query.days);
    res.json({
      items: listPosts({
        ...(qstr(req.query.status) ? { status: qstr(req.query.status) as string } : {}),
        ...(days !== undefined ? { days } : {}),
      }),
    });
  } catch (err) {
    fail(res, err);
  }
});

router.get('/:id', (req: Request, res: Response) => {
  try {
    const post = getPost(req.params.id);
    if (!post) throw new CraftPostError(`博文不存在: ${req.params.id}`, 404, 'POST_NOT_FOUND');
    res.json(post);
  } catch (err) {
    fail(res, err);
  }
});

// ── 写端点（建博文 / 内容与状态更新）────────────────────────────────────────
// 写接口默认只允许本机；远程调用需 SF_API_TOKEN（同 craft-profit 口径）。
router.use(apiGuard());

router.post('/', (req: Request, res: Response) => {
  try {
    res.status(201).json(createPost(body(req)));
  } catch (err) {
    fail(res, err);
  }
});

router.patch('/:id', (req: Request, res: Response) => {
  updatePost(req.params.id, body(req))
    .then((result) => res.json(result))
    .catch((err) => fail(res, err));
});

export default router;
