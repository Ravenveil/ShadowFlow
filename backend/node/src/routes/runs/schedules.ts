/**
 * routes/runs/schedules.ts — 单后端迁移：/api/schedules 域（Story 14.2）。
 *
 * 移植自 Python backend/python/shadowflow/api/runs/schedules.py
 * （server.py:288 裸挂载，router 自带 prefix /api/schedules）：
 *   POST   /api/schedules                 → 201 {data, meta:{}}
 *   GET    /api/schedules?group_id&agent_id → {data, meta:{count}}
 *   PATCH  /api/schedules/:id             → {data, meta:{}}
 *   DELETE /api/schedules/:id             → 204 无体
 *   GET    /api/schedules/:id/runs        → {data, meta:{count}}
 *
 * 错误信封（FastAPI HTTPException 默认处理器形状——恒定 {"detail": ...} 包装，
 * 逐字段对齐，pytest 侧 r.json()["detail"]["error"] 即证据）：
 *   400 {detail:{error:{code:'INVALID_ID',message}}}      — id 校验/路径穿越
 *   404 {detail:{error:{code:'NOT_FOUND',message}}}       — 计划不存在
 *   422 {detail:{error:'enabled_limit_reached',...}}      — 防呆①（guardrail
 *       类错误是平的 {error:...}，与 400/404 的嵌套 {error:{code}} 刻意
 *       不同——Python 就是这么不对称的，照抄）
 *   422 {detail:{error:'invalid_cron',detail,example}}    — cron 解析失败
 *   422 {detail:{error:'cron_interval_too_short',...}}    — 防呆②
 *   422 {detail:{error:'start_at_in_past',start_at}}      — one-shot 过去时刻
 *   422 {detail:[{loc,msg,type}]}                         — Pydantic 校验失败
 *       （RequestValidationError 形状；group_id 缺失/越界、duration_min
 *        越界、xor 触发器缺失、enabled 非布尔等）
 *
 * 挂载（由 team-lead 收口）：`app.use('/api/schedules', schedulesRouter)`
 * —— 必须在 proxyFallback/gap handler 之前；无大请求体需求，位于全局
 * express.json({limit:'1mb'}) 之后正常挂即可（与 batch1 wallet 同款）。
 * 单后端模式建议条件挂载：SF_BACKEND_MODE=single 时挂（legacy 模式该路径
 * 仍走 proxyFallback 转 Python，两模式不冲突）。
 */

import { Router, Request, Response, NextFunction } from 'express';
import {
  SCHEDULE_ID_RE,
  MAX_RUNS_STORED,
  MAX_ENABLED_SCHEDULES,
  MIN_CRON_INTERVAL_MINUTES,
  countEnabledSchedules,
  deleteScheduleFile,
  listSchedules,
  loadSchedule,
  newScheduleId,
  saveSchedule,
  type ScheduleRecord,
} from '../../scheduler/store';
import { isValidCron, parseCronIntervalMinutes } from '../../scheduler/cron';
import { computeNextRunTime, setRunExecutorBridge, type ExecutorBridge } from '../../scheduler/engine';

const router = Router();

// ── HTTPException 同构 helper ────────────────────────────────────────────────

/** FastAPI HTTPException：抛出后统一由 router 级 errorhandler 渲染响应体。 */
class HttpError extends Error {
  status: number;
  detail: unknown;
  constructor(status: number, detail: unknown) {
    super(typeof detail === 'string' ? detail : 'http_error');
    this.status = status;
    this.detail = detail;
  }
}

const invalidId = () => new HttpError(400, { error: { code: 'INVALID_ID', message: 'Invalid schedule_id' } });
const notFound = () => new HttpError(404, { error: { code: 'NOT_FOUND', message: 'Schedule not found' } });

/** 422 Pydantic 形状：[{loc:[field], msg, type}]（FastAPI RequestValidationError body）。 */
function pydantic422(field: string, msg: string, type = 'value_error'): never {
  throw new HttpError(422, [{ loc: ['body', field], msg, type }]);
}

/**
 * 统一渲染：HttpError → res.status(status).json(detail)；其他原样上抛。
 * 同步抛出与异步 rejection 双路都接（Express 错误中间件只向后查找，
 * 放 wrap 里渲染比 router 级 errorhandler 更可靠）。
 */
function wrap(handler: (req: Request, res: Response) => void | Promise<void>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const render = (err: unknown): void => {
      if (err instanceof HttpError) {
        // FastAPI 默认 HTTPException 处理器恒定返回 {"detail": ...} 包装
        // （400/404 的 {error:{code}} 与 422 guardrail 的 {error:...} 都在
        // detail 里；pytest 断言 r.json()["detail"]["error"] 即证据）。
        res.status(err.status).json({ detail: err.detail });
        return;
      }
      next(err);
    };
    try {
      Promise.resolve(handler(req, res)).catch(render);
    } catch (err) {
      render(err);
    }
  };
}

// ── 校验（Pydantic CreateScheduleRequest 同构）──────────────────────────────

function validateCreate(body: Record<string, unknown>): {
  group_id: string;
  cron_expression: string | null;
  start_at: string | null;
  agent_id: string | null;
  task_description: string;
  duration_min: number;
} {
  // group_id: str = Field(..., min_length=1, max_length=200) — 缺失/类型/长度
  const groupId = body.group_id;
  if (groupId === undefined) pydantic422('group_id', 'Field required', 'missing');
  if (typeof groupId !== 'string') pydantic422('group_id', 'Input should be a valid string', 'string_type');
  if (groupId.length < 1 || groupId.length > 200) {
    pydantic422('group_id', 'String should have at most 200 characters', 'string_too_long');
  }

  // cron_expression: Optional[str] max_length=100
  let cron: string | null = null;
  if (body.cron_expression !== undefined && body.cron_expression !== null) {
    if (typeof body.cron_expression !== 'string') {
      pydantic422('cron_expression', 'Input should be a valid string', 'string_type');
    }
    if (body.cron_expression.length > 100) {
      pydantic422('cron_expression', 'String should have at most 100 characters', 'string_too_long');
    }
    cron = body.cron_expression;
  }

  // start_at: Optional[datetime] — ISO 解析失败 → datetime_from_date_parsing
  let startAtRaw: string | null = null;
  if (body.start_at !== undefined && body.start_at !== null) {
    if (typeof body.start_at !== 'string') {
      pydantic422('start_at', 'Input should be a valid datetime', 'datetime_from_date_parsing');
    }
    const t = new Date(body.start_at);
    if (Number.isNaN(t.getTime())) {
      pydantic422('start_at', 'Input should be a valid datetime, invalid format', 'datetime_from_date_parsing');
    }
    startAtRaw = body.start_at;
  }

  // xor validator：至少其一。
  const hasCron = cron !== null && cron.trim() !== '';
  const hasStart = startAtRaw !== null;
  if (!hasCron && !hasStart) {
    throw new HttpError(422, [
      { loc: ['body'], msg: 'Value error, Either cron_expression or start_at must be set', type: 'value_error' },
    ]);
  }

  // agent_id: Optional[str] max_length=200
  let agentId: string | null = null;
  if (body.agent_id !== undefined && body.agent_id !== null) {
    if (typeof body.agent_id !== 'string') {
      pydantic422('agent_id', 'Input should be a valid string', 'string_type');
    }
    if (body.agent_id.length > 200) {
      pydantic422('agent_id', 'String should have at most 200 characters', 'string_too_long');
    }
    agentId = body.agent_id;
  }

  // task_description: str = '' max_length=500
  let taskDescription = '';
  if (body.task_description !== undefined && body.task_description !== null) {
    if (typeof body.task_description !== 'string') {
      pydantic422('task_description', 'Input should be a valid string', 'string_type');
    }
    if (body.task_description.length > 500) {
      pydantic422('task_description', 'String should have at most 500 characters', 'string_too_long');
    }
    taskDescription = body.task_description;
  }

  // duration_min: int = 30, ge=1 le=1440（Pydantic int：整数才过）
  let durationMin = 30;
  if (body.duration_min !== undefined && body.duration_min !== null) {
    if (typeof body.duration_min !== 'number' || !Number.isInteger(body.duration_min)) {
      pydantic422('duration_min', 'Input should be a valid integer', 'int_parsing');
    }
    if (body.duration_min < 1 || body.duration_min > 1440) {
      pydantic422('duration_min', 'Input should be greater than or equal to 1', 'greater_than_equal');
    }
    durationMin = body.duration_min;
  }

  return {
    group_id: groupId as string,
    cron_expression: hasCron ? (cron as string) : null,
    start_at: startAtRaw,
    agent_id: agentId,
    task_description: taskDescription,
    duration_min: durationMin,
  };
}

/** 防呆①：启用数达上限 → 422 enabled_limit_reached（guardrail detail 形状）。 */
function enforceEnabledCap(): void {
  const enabledCount = countEnabledSchedules();
  if (enabledCount >= MAX_ENABLED_SCHEDULES) {
    throw new HttpError(422, {
      error: 'enabled_limit_reached',
      message: `最多允许 ${MAX_ENABLED_SCHEDULES} 个启用中的计划（当前 ${enabledCount} 个）。请先停用或删除部分计划再试。`,
      limit: MAX_ENABLED_SCHEDULES,
    });
  }
}

/** one-shot start_at 必须在未来（naive → UTC 语义由 Date 解析兜住）。 */
function normalizeStartAt(startAtRaw: string): Date {
  const t = new Date(startAtRaw);
  // 无时区后缀的 naive 字符串：Python replace(tzinfo=utc) 语义 → 按 UTC 解释。
  // JS Date 对无时区 ISO 串按本地时区解释，这里手动归一到 UTC。
  if (!/[zZ]|[+-]\d{2}:?\d{2}$/.test(startAtRaw)) {
    const localOffset = t.getTimezoneOffset() * 60_000;
    return new Date(t.getTime() + localOffset);
  }
  return t;
}

// ── POST /schedules → 201 ────────────────────────────────────────────────────

router.post(
  '/',
  wrap(async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const input = validateCreate(body);

    enforceEnabledCap();

    if (input.cron_expression) {
      // cron 优先（both supplied 时 start_at 只存不触发，对齐 Python 分支）。
      if (!isValidCron(input.cron_expression)) {
        const detail = `Error validating expression: '${input.cron_expression}' is not valid cron expression`;
        throw new HttpError(422, {
          error: 'invalid_cron',
          detail,
          example: '0 8 * * 1-5',
        });
      }
      const interval = parseCronIntervalMinutes(input.cron_expression);
      if (interval !== null && interval < MIN_CRON_INTERVAL_MINUTES) {
        throw new HttpError(422, {
          error: 'cron_interval_too_short',
          message: `cron 触发间隔过短（约 ${interval} 分钟），最小允许 ${MIN_CRON_INTERVAL_MINUTES} 分钟。`,
          example: '*/15 * * * *',
        });
      }
    } else {
      const startAt = normalizeStartAt(input.start_at as string);
      if (startAt.getTime() < Date.now()) {
        throw new HttpError(422, {
          error: 'start_at_in_past',
          start_at: startAt.toISOString(),
        });
      }
    }

    const scheduleId = newScheduleId();
    const now = new Date();
    const record: ScheduleRecord = {
      schedule_id: scheduleId,
      group_id: input.group_id,
      cron_expression: input.cron_expression,
      start_at: input.start_at,
      agent_id: input.agent_id,
      task_description: input.task_description,
      duration_min: input.duration_min,
      created_at: now.toISOString(),
      next_run_time: computeNextRunTime(
        {
          cron_expression: input.cron_expression,
          start_at: input.start_at,
          completed: false,
        } as ScheduleRecord,
        now,
      ),
      completed: false,
      enabled: true,
      runs: [],
    };
    saveSchedule(record);
    res.status(201).json({ data: record, meta: {} });
  }),
);

// ── GET /schedules?group_id=&agent_id= ──────────────────────────────────────

router.get(
  '/',
  wrap((req, res) => {
    let records = listSchedules();
    const groupId = req.query.group_id;
    if (typeof groupId === 'string' && groupId) {
      records = records.filter((r) => r.group_id === groupId);
    }
    const agentId = req.query.agent_id;
    if (typeof agentId === 'string' && agentId) {
      records = records.filter((r) => r.agent_id === agentId);
    }
    res.json({ data: records, meta: { count: records.length } });
  }),
);

// ── PATCH /schedules/:id（启停开关）─────────────────────────────────────────

router.patch(
  '/:schedule_id',
  wrap((req, res) => {
    const scheduleId = req.params.schedule_id as string;
    if (!SCHEDULE_ID_RE.test(scheduleId)) throw invalidId();

    const record = loadSchedule(scheduleId);
    if (record === null) throw notFound();

    const body = (req.body ?? {}) as Record<string, unknown>;
    // PatchScheduleRequest：enabled: bool（必填，布尔类型）。
    if (typeof body.enabled !== 'boolean') {
      pydantic422('enabled', 'Input should be a valid boolean', 'bool_parsing');
    }

    // 防呆①：停用→启用 同样受上限约束。
    const wasEnabled = record.enabled !== false;
    if (body.enabled && !wasEnabled) enforceEnabledCap();

    record.enabled = body.enabled;
    // 人工重新启用 = 熔断复位。
    if (body.enabled) {
      delete record.auto_disabled;
      delete record.auto_disabled_at;
      delete record.auto_disabled_reason;
    }

    // completed one-shot 重启用不复活。
    if (body.enabled && !record.completed) {
      record.next_run_time = computeNextRunTime(record, new Date());
    } else {
      record.next_run_time = null;
    }
    saveSchedule(record);

    res.json({ data: record, meta: {} });
  }),
);

// ── DELETE /schedules/:id → 204 ─────────────────────────────────────────────

router.delete(
  '/:schedule_id',
  wrap((req, res) => {
    const scheduleId = req.params.schedule_id as string;
    if (!SCHEDULE_ID_RE.test(scheduleId)) throw invalidId();

    const record = loadSchedule(scheduleId);
    if (record === null) throw notFound();

    deleteScheduleFile(scheduleId);
    res.status(204).end();
  }),
);

// ── GET /schedules/:id/runs ─────────────────────────────────────────────────

router.get(
  '/:schedule_id/runs',
  wrap((req, res) => {
    const scheduleId = req.params.schedule_id as string;
    if (!SCHEDULE_ID_RE.test(scheduleId)) throw invalidId();

    const record = loadSchedule(scheduleId);
    if (record === null) throw notFound();

    const runs = (record.runs ?? []).slice(0, MAX_RUNS_STORED);
    res.json({ data: runs, meta: { count: runs.length } });
  }),
);

// ── engine bridge 出口（executor 接线用，未来 run-sessions 桥接） ────────────
export { setRunExecutorBridge, type ExecutorBridge };

export default router;
