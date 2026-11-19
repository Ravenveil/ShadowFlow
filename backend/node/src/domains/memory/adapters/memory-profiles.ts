/**
 * routes/memory/memory-profiles.ts — 单后端迁移：Memory API（Story 9.3 AC4）
 *
 * 移植自 python backend/python/shadowflow/api/memory/memory.py：
 *   POST   /profiles            → 201 {data:profile, meta:{created_at}}
 *   GET    /profiles            → {data:按 updated_at 倒序, meta:{count}}
 *   GET    /profiles/:id        → {data:profile, meta:{}}
 *   PATCH  /profiles/:id        → {data:profile, meta:{}}
 *   DELETE /profiles/:id        → 204 无体
 *   POST   /writeback/:run_id   → 202 stub（Story 9.4 前占位，文案照抄）
 *   GET    /stats?agent_id=     → placeholder 结构（Story 14.1 模式，文案照抄）
 *
 * 响应走 {data, meta} 信封；错误体特殊：顶层 {code, message}，无 error 包装
 * （FastAPI HTTPException(detail={code,message}) 的透传形状）：
 *   400 INVALID_PROFILE_ID / 404 PROFILE_NOT_FOUND / 422 字段越界。
 */

import { Router, Request, Response } from 'express';
import {
  createProfile,
  deleteProfile,
  getProfile,
  listProfiles,
  updateProfile,
  UUID_RE,
  FieldViolationError,
  type ProfilePatch,
} from '../../../storage/memory-profile-configs';

const router = Router();

// ── helpers ──────────────────────────────────────────────────────────────────

/** memory.py _check_profile_id 同构：400 INVALID_PROFILE_ID，顶层 {code,message}。 */
function checkProfileId(res: Response, profileId: string): boolean {
  if (!UUID_RE.test(profileId)) {
    res.status(400).json({ code: 'INVALID_PROFILE_ID', message: 'profile_id must be a UUID' });
    return false;
  }
  return true;
}

/** memory.py _get_or_404 同构：先校验 id，再查库，缺 → 404 PROFILE_NOT_FOUND。 */
function getOr404(res: Response, profileId: string): boolean {
  if (!checkProfileId(res, profileId)) return false;
  if (!getProfile(profileId)) {
    res
      .status(404)
      .json({ code: 'PROFILE_NOT_FOUND', message: `profile ${profileId} not found` });
    return false;
  }
  return true;
}

// ── POST /profiles → 201 ─────────────────────────────────────────────────────

router.post('/profiles', (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  // CreateProfileRequest 同形：数字档位必须为整数（Pydantic int 语义）；
  // 越界/非法档位 → 422（FastAPI RequestValidationError 状态码）。
  for (const field of [
    'working_memory_limit',
    'episodic_retention_days',
    'semantic_retrieval_top_k',
    'compression_top_k',
  ] as const) {
    const v = body[field];
    if (v !== undefined && (typeof v !== 'number' || !Number.isInteger(v))) {
      res.status(422).json({ code: 'FIELD_INVALID', message: `${field} must be an integer` });
      return;
    }
  }
  for (const field of ['writeback_policy', 'state_sync_policy', 'compression_policy'] as const) {
    const v = body[field];
    if (v !== undefined && typeof v !== 'string') {
      res.status(422).json({ code: 'FIELD_INVALID', message: `${field} must be a string` });
      return;
    }
  }
  try {
    const profile = createProfile({
      working_memory_limit: body.working_memory_limit as ProfilePatch['working_memory_limit'],
      episodic_retention_days: body.episodic_retention_days as ProfilePatch['episodic_retention_days'],
      semantic_retrieval_top_k: body.semantic_retrieval_top_k as ProfilePatch['semantic_retrieval_top_k'],
      compression_top_k: body.compression_top_k as ProfilePatch['compression_top_k'],
      writeback_policy: body.writeback_policy as ProfilePatch['writeback_policy'],
      state_sync_policy: body.state_sync_policy as ProfilePatch['state_sync_policy'],
      compression_policy: body.compression_policy as ProfilePatch['compression_policy'],
    });
    res.status(201).json({ data: profile, meta: { created_at: new Date().toISOString() } });
  } catch (err) {
    if (err instanceof FieldViolationError) {
      res.status(422).json({ code: 'FIELD_INVALID', message: err.message });
      return;
    }
    throw err;
  }
});

// ── GET /profiles → 列表（updated_at 倒序） ──────────────────────────────────

router.get('/profiles', (_req: Request, res: Response) => {
  const profiles = listProfiles();
  res.json({ data: profiles, meta: { count: profiles.length } });
});

// ── GET /profiles/:id ────────────────────────────────────────────────────────

router.get('/profiles/:profile_id', (req: Request, res: Response) => {
  const { profile_id: pid } = req.params;
  if (!getOr404(res, pid)) return;
  res.json({ data: getProfile(pid), meta: {} });
});

// ── PATCH /profiles/:id ──────────────────────────────────────────────────────

router.patch('/profiles/:profile_id', (req: Request, res: Response) => {
  const { profile_id: pid } = req.params;
  if (!getOr404(res, pid)) return;
  const body = (req.body ?? {}) as Record<string, unknown>;
  const allowedNum = [
    'working_memory_limit',
    'episodic_retention_days',
    'semantic_retrieval_top_k',
    'compression_top_k',
  ] as const;
  const allowedEnum = ['writeback_policy', 'state_sync_policy', 'compression_policy'] as const;
  // 未知字段直接丢弃（FastAPI BaseModel 默认忽略 extra）；
  // 出现的数字字段必须为整数、枚举字段必须为字符串（类型错 → 422）。
  for (const field of allowedNum) {
    const v = body[field];
    if (v !== undefined && (typeof v !== 'number' || !Number.isInteger(v))) {
      res.status(422).json({ code: 'FIELD_INVALID', message: `${field} must be an integer` });
      return;
    }
  }
  for (const field of allowedEnum) {
    const v = body[field];
    if (v !== undefined && typeof v !== 'string') {
      res.status(422).json({ code: 'FIELD_INVALID', message: `${field} must be a string` });
      return;
    }
  }
  try {
    const updated = updateProfile(pid, {
      working_memory_limit: body.working_memory_limit as ProfilePatch['working_memory_limit'],
      episodic_retention_days: body.episodic_retention_days as ProfilePatch['episodic_retention_days'],
      semantic_retrieval_top_k: body.semantic_retrieval_top_k as ProfilePatch['semantic_retrieval_top_k'],
      compression_top_k: body.compression_top_k as ProfilePatch['compression_top_k'],
      writeback_policy: body.writeback_policy as ProfilePatch['writeback_policy'],
      state_sync_policy: body.state_sync_policy as ProfilePatch['state_sync_policy'],
      compression_policy: body.compression_policy as ProfilePatch['compression_policy'],
    });
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

// ── DELETE /profiles/:id → 204 ───────────────────────────────────────────────

router.delete('/profiles/:profile_id', (req: Request, res: Response) => {
  const { profile_id: pid } = req.params;
  if (!getOr404(res, pid)) return;
  deleteProfile(pid);
  res.status(204).end();
});

// ── POST /writeback/:run_id → 202（stub — 文案照抄 memory.py） ───────────────

router.post('/writeback/:run_id', (req: Request, res: Response) => {
  const runId = req.params.run_id;
  // logger.info("manual_writeback requested for run_id=%s (stub — full impl in Story 9.4)")
  console.log(
    `manual_writeback requested for run_id=${runId} (stub — full impl in Story 9.4)`,
  );
  res.status(202).json({
    data: {
      run_id: runId,
      status: 'writeback_triggered',
      // 14-1: stub — non-zero when Story 9.4 writeback lands
      memories_recalled: 0,
    },
    meta: {
      triggered_at: new Date().toISOString(),
      note: 'stub — ContextBuilder integration in Story 9.4',
    },
  });
});

// ── GET /stats?agent_id= — placeholder（文案照抄 memory.py） ─────────────────

router.get('/stats', (req: Request, res: Response) => {
  const agentId = typeof req.query.agent_id === 'string' ? req.query.agent_id : undefined;
  let profile: ReturnType<typeof getProfile> = null;
  if (agentId) {
    for (const p of listProfiles()) {
      if (p.profile_id === agentId) {
        profile = p;
        break;
      }
    }
  }

  const wml = profile ? profile.working_memory_limit : 4096;
  const erd = profile ? profile.episodic_retention_days : 30;

  res.json({
    data: {
      working_memory_limit: wml,
      episodic_retention_days: erd,
      semantic_skills_count: 0,
      _note: 'Live counts pending Story 9.4 writeback implementation',
    },
    meta: { mode: 'placeholder' },
  });
});

export default router;
