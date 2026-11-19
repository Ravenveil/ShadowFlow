/**
 * memory-lessons.ts — 经验记忆路由的 Web 适配层（薄壳）
 *
 * GET    /api/memory/lessons          → 列表（score 降序；?scope_key=&kind=&includeArchived=&limit=）
 * POST   /api/memory/lessons          → 记一条（重复内容自动加权而非新增）→ 201
 * GET    /api/memory/lessons/stats    → 统计
 * DELETE /api/memory/lessons/:id      → 软删（归档留痕）→ 200
 *
 * 职责：解析 HTTP → 调用用例 → 把领域错误映射成状态码。
 * 不含业务规则（lessons-model）、数据访问（infra）、编排（use_cases）。
 *
 * IMPORTANT: /stats 注册在 /:id 之前，避免 Express 把 "stats" 当 id。
 */

import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { SqliteLessonRepository } from '../infra/sqlite-lesson.repository';
import {
  makeRemember,
  makeListLessons,
  makeLessonStats,
  makeForgetLesson,
} from '../use_cases/lessons';
import {
  LessonDomainError,
  VALID_KINDS,
  KIND_LESSON,
} from '../lessons-model';

/** 装配（工厂：接收 repo，依赖倒置）。 */
export function createMemoryLessonsRouter(repo: SqliteLessonRepository): Router {
  const router = Router();
  const remember = makeRemember(repo, { newId: () => randomUUID() });
  const list = makeListLessons(repo);
  const stats = makeLessonStats(repo);
  const forget = makeForgetLesson(repo);

  router.get('/', (req: Request, res: Response) => {
    const { scope_key, kind, includeArchived, limit } = req.query;
    const rows = list({
      scope_key: typeof scope_key === 'string' ? scope_key : undefined,
      kind: typeof kind === 'string' && (VALID_KINDS as readonly string[]).includes(kind) ? kind : undefined,
      includeArchived: includeArchived === '1' || includeArchived === 'true',
      limit: typeof limit === 'string' ? Number(limit) : undefined,
    });
    res.json(rows);
  });

  router.post('/', (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (typeof body.content !== 'string' || !body.content.trim()) {
      res
        .status(400)
        .json({ error: { code: 'INVALID_BODY', message: 'content (non-empty string) is required' } });
      return;
    }
    const kind =
      typeof body.kind === 'string' && (VALID_KINDS as readonly string[]).includes(body.kind)
        ? body.kind
        : KIND_LESSON;
    try {
      const entry = remember({
        content: body.content,
        kind,
        scope_key: typeof body.scope_key === 'string' ? body.scope_key : '',
        task_type: typeof body.task_type === 'string' ? body.task_type : '',
        source: typeof body.source === 'string' && body.source ? body.source : 'manual',
        source_ref: typeof body.source_ref === 'string' ? body.source_ref : '',
        title: typeof body.title === 'string' ? body.title : '',
        score: typeof body.score === 'number' ? body.score : undefined,
      });
      res.status(201).json(entry);
    } catch (err) {
      if (err instanceof LessonDomainError) {
        res.status(err.status).json({ error: { code: 'MEMORY_ERROR', message: err.message } });
        return;
      }
      res.status(500).json({ error: { code: 'INTERNAL', message: (err as Error).message } });
    }
  });

  router.get('/stats', (_req: Request, res: Response) => {
    res.json(stats());
  });

  router.delete('/:id', (req: Request, res: Response) => {
    try {
      res.json(forget(req.params.id));
    } catch (err) {
      if (err instanceof LessonDomainError && err.status === 404) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Lesson not found' } });
        return;
      }
      res.status(500).json({ error: { code: 'INTERNAL', message: (err as Error).message } });
    }
  });

  return router;
}

/** 过渡装配：保持默认导出为 Router 实例，index.ts 与兼容存根零改动。 */
const router = createMemoryLessonsRouter(new SqliteLessonRepository());
export default router;
