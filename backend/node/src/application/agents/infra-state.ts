/**
 * routes/agents/agent-state.ts — 单后端迁移：Agent State API（Story 9.4 AC3）。
 *
 * 移植自 python shadowflow/api/agents/state.py（6 端点）：
 *   GET    /state/:agent_id                     → {data: state, meta:{}}
 *   PATCH  /state/:agent_id                     → {data: state, meta:{}}（乐观锁）
 *   POST   /state/:agent_id/snapshot            → {data:{snapshot_id}, meta:{}}
 *   GET    /state/:agent_id/snapshots           → {data:[...], meta:{}}
 *   POST   /state/:agent_id/restore/:snapshot_id → {data: state, meta:{}}
 *   POST   /state/:agent_id/reset               → {data: state, meta:{}}
 *
 * ⚠️ 挂载前缀是裸 /state（Python server.py :271 include_router 无 prefix），
 *    不是 /api/* —— 挂载语句：app.use('/state', agentStateRouter)。
 *
 * 错误体线格式（FastAPI HTTPException(detail={error:{...}}) 透传）：
 *   404 AGENT_STATE_NOT_FOUND  detail.error.{code,message}
 *   409 STATE_CONFLICT         detail.error.{code,message,details:{expected,got}}
 *   404 SNAPSHOT_NOT_FOUND     detail.error.{code,message,details}
 *   422 SHADOWFLOW_ERROR       detail.error.{code,message,details}（id 校验失败等）
 *   422 Pydantic 校验          detail [{"type","loc","msg",...}]（数组形状）
 * 与 memory.py 的顶层 {code,message} 是两种形状，逐字段对齐不合并。
 */

import { Router, Request, Response } from 'express';
import {
  getState,
  updateState,
  snapshotState,
  restoreState,
  listSnapshots,
  resetState,
  SnapshotNotFoundError,
  StateConflictError,
  StateServiceError,
  type AgentState,
} from './infra-state-service';

const router = Router();

// ── 错误体 helpers（state.py _handle_conflict / _handle_shadowflow 直译） ────

function sendStateServiceError(res: Response, status: number, exc: StateServiceError): void {
  res.status(status).json({
    detail: {
      error: { code: exc.code, message: exc.message, details: exc.details },
    },
  });
}

/** Pydantic PatchStateRequest 校验失败 → FastAPI RequestValidationError 形状。 */
function sendValidationError(res: Response, loc: string[], msg: string, type: string): void {
  res.status(422).json({
    detail: [{ type, loc: ['body', ...loc], msg }],
  });
}

// ── PATCH 请求体校验（PatchStateRequest 同形） ───────────────────────────────

const OPTIONAL_STR_FIELDS = ['role_profile_ref', 'memory_profile_ref', 'session_summary'] as const;
const OPTIONAL_STR_LIST_FIELDS = ['recent_artifacts', 'pending_tasks'] as const;

interface PatchStateBody {
  version?: unknown;
  role_profile_ref?: unknown;
  memory_profile_ref?: unknown;
  state_fields?: unknown;
  session_summary?: unknown;
  recent_artifacts?: unknown;
  pending_tasks?: unknown;
}

/**
 * 返回合法 patch（只在字段出现且类型正确时进 patch）；body 缺 version 或
 * 字段类型不符 → null（路由层回 422）。Pydantic int 语义：version 必须整数。
 */
function parsePatchState(body: PatchStateBody): Record<string, unknown> | null {
  if (typeof body.version !== 'number' || !Number.isInteger(body.version)) return null;
  const patch: Record<string, unknown> = { version: body.version };
  for (const field of OPTIONAL_STR_FIELDS) {
    const v = body[field];
    if (v === undefined) continue;
    if (typeof v !== 'string') return null;
    patch[field] = v;
  }
  if (body.state_fields !== undefined) {
    if (typeof body.state_fields !== 'object' || body.state_fields === null || Array.isArray(body.state_fields)) {
      return null;
    }
    patch.state_fields = body.state_fields;
  }
  for (const field of OPTIONAL_STR_LIST_FIELDS) {
    const v = body[field];
    if (v === undefined) continue;
    if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) return null;
    patch[field] = v;
  }
  return patch;
}

// ── GET /state/:agent_id ─────────────────────────────────────────────────────

router.get('/:agent_id', (req: Request, res: Response) => {
  try {
    const state = getState(req.params.agent_id);
    if (!state) {
      // Python: message = f"No state for agent {agent_id!r}"
      res.status(404).json({
        detail: {
          error: {
            code: 'AGENT_STATE_NOT_FOUND',
            message: `No state for agent '${req.params.agent_id}'`,
          },
        },
      });
      return;
    }
    res.json({ data: state, meta: {} });
  } catch (err) {
    if (err instanceof StateServiceError) {
      // agent_id 校验失败 → 422（Python _handle_shadowflow）
      sendStateServiceError(res, 422, err);
      return;
    }
    throw err;
  }
});

// ── PATCH /state/:agent_id ───────────────────────────────────────────────────

router.patch('/:agent_id', (req: Request, res: Response) => {
  const patch = parsePatchState((req.body ?? {}) as PatchStateBody);
  if (!patch) {
    sendValidationError(res, ['version'], 'Input should be a valid integer', 'int_parsing');
    return;
  }
  try {
    const state: AgentState = updateState(req.params.agent_id, patch);
    res.json({ data: state, meta: {} });
  } catch (err) {
    if (err instanceof StateConflictError) {
      sendStateServiceError(res, 409, err);
    } else if (err instanceof StateServiceError) {
      sendStateServiceError(res, 422, err);
    } else {
      throw err;
    }
  }
});

// ── POST /state/:agent_id/snapshot ───────────────────────────────────────────

router.post('/:agent_id/snapshot', (req: Request, res: Response) => {
  try {
    const snapshotId = snapshotState(req.params.agent_id);
    res.json({ data: { snapshot_id: snapshotId }, meta: {} });
  } catch (err) {
    if (err instanceof StateServiceError) {
      sendStateServiceError(res, 422, err);
      return;
    }
    throw err;
  }
});

// ── GET /state/:agent_id/snapshots ───────────────────────────────────────────

router.get('/:agent_id/snapshots', (req: Request, res: Response) => {
  try {
    const snapshots = listSnapshots(req.params.agent_id);
    res.json({ data: snapshots, meta: {} });
  } catch (err) {
    if (err instanceof StateServiceError) {
      sendStateServiceError(res, 422, err);
      return;
    }
    throw err;
  }
});

// ── POST /state/:agent_id/restore/:snapshot_id ───────────────────────────────

router.post('/:agent_id/restore/:snapshot_id', (req: Request, res: Response) => {
  try {
    const state = restoreState(req.params.agent_id, req.params.snapshot_id);
    res.json({ data: state, meta: {} });
  } catch (err) {
    if (err instanceof SnapshotNotFoundError) {
      sendStateServiceError(res, 404, err);
    } else if (err instanceof StateServiceError) {
      sendStateServiceError(res, 422, err);
    } else {
      throw err;
    }
  }
});

// ── POST /state/:agent_id/reset ──────────────────────────────────────────────

router.post('/:agent_id/reset', (req: Request, res: Response) => {
  try {
    const state = resetState(req.params.agent_id);
    res.json({ data: state, meta: {} });
  } catch (err) {
    if (err instanceof StateServiceError) {
      sendStateServiceError(res, 422, err);
      return;
    }
    throw err;
  }
});

export default router;
