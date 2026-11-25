/**
 * memory-profiles.ts — Memory Profile 路由的 Web 适配层（薄壳）
 *
 * POST   /profiles            → 201 {data,meta:{created_at}}
 * GET    /profiles            → {data:updated_at 倒序, meta:{count}}
 * GET    /profiles/:id        → {data,meta:{}}
 * PATCH  /profiles/:id        → {data,meta:{}}
 * DELETE /profiles/:id        → 204
 * POST   /writeback/:run_id   → 202 stub
 * GET    /stats?agent_id=     → placeholder
 *
 * 职责：解析 HTTP → 调用用例 → {data,meta} 信封 + 错误码映射。
 * 业务规则（数值下限/枚举/默认值）在 profiles-model，数据访问在 infra/sqlite-profile。
 */

import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { SqliteProfileRepository } from './infra/sqlite-profile.repository';
import {
  makeCreateProfile,
  makeListProfiles,
  makeGetProfile,
  makeUpdateProfile,
  makeDeleteProfile,
} from './use_cases/profiles';
import {
  FieldViolationError,
  UUID_RE,
  NUM_CONSTRAINTS,
  DEFAULTS,
  type ProfilePatch,
} from './profiles-model';

const NUM_FIELDS = NUM_CONSTRAINTS.map((c) => c.field);
const ENUM_FIELDS = ['writeback_policy', 'state_sync_policy', 'compression_policy'] as const;

/** 工厂：接收 repo，依赖倒置。 */
export function createMemoryProfilesRouter(repo: SqliteProfileRepository): Router {
  const router = Router();
  const deps = { newId: () => randomUUID() };
  const create = makeCreateProfile(repo, deps);
  const list = makeListProfiles(repo);
  const get = makeGetProfile(repo);
  const update = makeUpdateProfile(repo, {});
  const remove = makeDeleteProfile(repo);

  function checkProfileId(res: Response, profileId: string): boolean {
    if (!UUID_RE.test(profileId)) {
      res.status(400).json({ code: 'INVALID_PROFILE_ID', message: 'profile_id must be a UUID' });
      return false;
    }
    return true;
  }

  function getOr404(res: Response, profileId: string): boolean {
    if (!checkProfileId(res, profileId)) return false;
    if (!get(profileId)) {
      res.status(404).json({ code: 'PROFILE_NOT_FOUND', message: `profile ${profileId} not found` });
      return false;
    }
    return true;
  }

  /** HTTP 层字段类型校验（整数 / 字符串），越界交给 model 的 FieldViolationError。 */
  function fieldTypeOk(res: Response, body: Record<string, unknown>): boolean {
    for (const field of NUM_FIELDS) {
      const v = body[field];
      if (v !== undefined && (typeof v !== 'number' || !Number.isInteger(v))) {
        res.status(422).json({ code: 'FIELD_INVALID', message: `${field} must be an integer` });
        return false;
      }
    }
    for (const field of ENUM_FIELDS) {
      const v = body[field];
      if (v !== undefined && typeof v !== 'string') {
        res.status(422).json({ code: 'FIELD_INVALID', message: `${field} must be a string` });
        return false;
      }
    }
    return true;
  }

  function patchFrom(body: Record<string, unknown>): ProfilePatch {
    return {
      working_memory_limit: body.working_memory_limit as ProfilePatch['working_memory_limit'],
      episodic_retention_days: body.episodic_retention_days as ProfilePatch['episodic_retention_days'],
      semantic_retrieval_top_k: body.semantic_retrieval_top_k as ProfilePatch['semantic_retrieval_top_k'],
      compression_top_k: body.compression_top_k as ProfilePatch['compression_top_k'],
      writeback_policy: body.writeback_policy as ProfilePatch['writeback_policy'],
      state_sync_policy: body.state_sync_policy as ProfilePatch['state_sync_policy'],
      compression_policy: body.compression_policy as ProfilePatch['compression_policy'],
    };
  }

  router.post('/profiles', (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (!fieldTypeOk(res, body)) return;
    try {
      const profile = create(patchFrom(body));
      res.status(201).json({ data: profile, meta: { created_at: new Date().toISOString() } });
    } catch (err) {
      if (err instanceof FieldViolationError) {
        res.status(422).json({ code: 'FIELD_INVALID', message: err.message });
        return;
      }
      throw err;
    }
  });

  router.get('/profiles', (_req: Request, res: Response) => {
    const profiles = list();
    res.json({ data: profiles, meta: { count: profiles.length } });
  });

  router.get('/profiles/:profile_id', (req: Request, res: Response) => {
    const pid = req.params.profile_id;
    if (!getOr404(res, pid)) return;
    res.json({ data: get(pid), meta: {} });
  });

  router.patch('/profiles/:profile_id', (req: Request, res: Response) => {
    const pid = req.params.profile_id;
    if (!getOr404(res, pid)) return;
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (!fieldTypeOk(res, body)) return;
    try {
      const updated = update(pid, patchFrom(body));
      if (!updated) {
        res.status(404).json({ code: 'PROFILE_NOT_FOUND', message: `profile ${pid} not found` });
        return;
      }
      res.json({ data: updated, meta: {} });
    } catch (err) {
      if (err instanceof FieldViolationError) {
        res.status(422).json({ code: 'FIELD_INVALID', message: err.message });
        return;
      }
      throw err;
    }
  });

  router.delete('/profiles/:profile_id', (req: Request, res: Response) => {
    const pid = req.params.profile_id;
    if (!getOr404(res, pid)) return;
    remove(pid);
    res.status(204).end();
  });

  router.post('/writeback/:run_id', (req: Request, res: Response) => {
    const runId = req.params.run_id;
    console.log(`manual_writeback requested for run_id=${runId} (stub — full impl in Story 9.4)`);
    res.status(202).json({
      data: { run_id: runId, status: 'writeback_triggered', memories_recalled: 0 },
      meta: { triggered_at: new Date().toISOString(), note: 'stub — ContextBuilder integration in Story 9.4' },
    });
  });

  router.get('/stats', (req: Request, res: Response) => {
    const agentId = typeof req.query.agent_id === 'string' ? req.query.agent_id : undefined;
    let profile = null;
    if (agentId) {
      for (const p of list()) {
        if (p.profile_id === agentId) {
          profile = p;
          break;
        }
      }
    }
    res.json({
      data: {
        working_memory_limit: profile ? profile.working_memory_limit : DEFAULTS.working_memory_limit,
        episodic_retention_days: profile ? profile.episodic_retention_days : DEFAULTS.episodic_retention_days,
        semantic_skills_count: 0,
        _note: 'Live counts pending Story 9.4 writeback implementation',
      },
      meta: { mode: 'placeholder' },
    });
  });

  return router;
}

/** 过渡装配：默认导出 Router 实例，index.ts 与兼容存根零改动。 */
const router = createMemoryProfilesRouter(new SqliteProfileRepository());
export default router;
