/**
 * engine.ts — 单后端迁移：schedules 调度引擎（Node 侧 APScheduler 替身）。
 *
 * Python 侧 = APScheduler BackgroundScheduler：
 *   - server.py startup 时 start_scheduler() + 遍历持久化 record 重建 job
 *   - CronTrigger / DateTrigger 到点回调 _schedule_job(schedule_id)
 * Node 侧替换为 30s setInterval 轮询：
 *   - 每 tick 重读磁盘 record（磁盘是唯一真源，天然支持多进程/重启恢复，
 *     省掉 APScheduler 的 job 内存表 + 重建逻辑）
 *   - due 判定：now >= next_run_time（record 上持久化的下次触发时刻），
 *     cron 到点后重算 next_run_time；one-shot 触发后 completed=true
 *   - 引擎持有 in-flight 锁防同 tick 重入；错过的触发不补跑（与 Python
 *     misfire_grace_time 默认行为一致——APScheduler 默认 1s grace，过点即丢）
 *
 * 到点回调 runScheduleNow() 与 Python _schedule_job 逐段对齐：
 *   record 缺失/disabled → 跳过；bridge 抛错 → status=failed（截 300 字符）；
 *   无 bridge → succeeded（纯提醒模式）；one-shot → completed；
 *   cron 连续失败 MAX_CONSECUTIVE_FAILURES 次 → 熔断 auto_disabled。
 *
 * Executor bridge：Python 侧 _RUN_EXECUTOR_BRIDGE 模块级 None——生产无注册方，
 * 全部为纯提醒模式。Node 同构：setRunExecutorBridge() 供未来接线（例如桥接
 * run-sessions），未注册时触发即记 succeeded。
 */

import { randomUUID } from 'crypto';
import { parseCron, nextCronFire } from './cron';
import {
  listSchedules,
  loadSchedule,
  saveSchedule,
  type ScheduleRecord,
  type ScheduleRun,
  MAX_RUNS_STORED,
  MAX_CONSECUTIVE_FAILURES,
} from './store';

function randomHexId(): string {
  return randomUUID().replace(/-/g, '');
}

export interface ExecutorBridge {
  (record: ScheduleRecord): void | Promise<void>;
}

let executorBridge: ExecutorBridge | null = null;

/** 注册执行桥（None/未注册 = 纯提醒模式）。对齐 Python _RUN_EXECUTOR_BRIDGE。 */
export function setRunExecutorBridge(fn: ExecutorBridge | null): void {
  executorBridge = fn;
}

function isCronTriggerable(record: ScheduleRecord): boolean {
  if (record.cron_expression && parseCron(record.cron_expression).hasOwnProperty('fields')) {
    return true;
  }
  return false;
}

/**
 * 重算 record 的下次触发时刻（对齐 _rebuild_trigger + get_next_fire_time）。
 * cron 有效 → 下次触发；one-shot 未到且未 completed → start_at；否则 null。
 */
export function computeNextRunTime(record: ScheduleRecord, now: Date): string | null {
  const cron = record.cron_expression;
  if (cron) {
    const fire = nextCronFire(cron, now);
    return fire ? fire.toISOString() : null;
  }
  const startAt = record.start_at;
  if (startAt && !record.completed) {
    const t = new Date(startAt);
    if (!Number.isNaN(t.getTime()) && t.getTime() > now.getTime()) {
      return t.toISOString();
    }
  }
  return null;
}

/**
 * 到点执行一次（对齐 Python _schedule_job）。由引擎 tick 或测试直接调用。
 * 返回执行后的最新 record（或 null = 计划不存在/被跳过）。
 */
export async function runScheduleNow(scheduleId: string, now: Date = new Date()): Promise<ScheduleRecord | null> {
  const record = loadSchedule(scheduleId);
  if (record === null) return null;
  // 熔断安全网：disabled 的计划即使到点也不触发（对齐 _schedule_job 首个检查）。
  if (record.enabled === false) return null;

  const runs: ScheduleRun[] = record.runs ?? [];

  let status: ScheduleRun['status'] = 'succeeded';
  let errorMessage: string | null = null;
  if (executorBridge !== null) {
    try {
      await executorBridge(record);
    } catch (err) {
      status = 'failed';
      errorMessage = String((err as Error)?.message ?? err).slice(0, 300);
    }
  }

  const run: ScheduleRun = {
    run_id: randomHexId(),
    triggered_at: now.toISOString(),
    status,
  };
  if (errorMessage) run.error = errorMessage;
  runs.unshift(run);
  record.runs = runs.slice(0, MAX_RUNS_STORED);

  // one-shot 触发即完成（历史化渲染），next_run_time 清空。
  if (record.start_at && !record.cron_expression) {
    record.completed = true;
    record.next_run_time = null;
  }

  // 防呆③：cron 计划连续失败达阈值 → 自动停用（熔断）。
  if (status === 'failed' && record.cron_expression) {
    const recent = record.runs.slice(0, MAX_CONSECUTIVE_FAILURES);
    if (recent.length >= MAX_CONSECUTIVE_FAILURES && recent.every((r) => r.status === 'failed')) {
      record.enabled = false;
      record.next_run_time = null;
      record.auto_disabled = true;
      record.auto_disabled_at = now.toISOString();
      record.auto_disabled_reason = `连续失败 ${MAX_CONSECUTIVE_FAILURES} 次，已自动停用`;
      saveSchedule(record);
      console.warn(`schedule_job: schedule ${scheduleId} auto-disabled after ${MAX_CONSECUTIVE_FAILURES} consecutive failures`);
      return record;
    }
  }

  try {
    saveSchedule(record);
  } catch (err) {
    console.error(`schedule_job: failed to save run record for ${scheduleId}: ${(err as Error).message}`);
  }
  return record;
}

// ── 轮询引擎 ─────────────────────────────────────────────────────────────────

const TICK_MS = 30_000;

let timer: ReturnType<typeof setInterval> | null = null;
let ticking = false;

/** 单个 tick：重扫全部持久化计划，到点者逐个触发。 */
async function tick(now: Date): Promise<void> {
  if (ticking) return;
  ticking = true;
  try {
    for (const record of listSchedules()) {
      if (record.enabled === false) continue;
      if (!record.next_run_time) continue;
      const due = new Date(record.next_run_time);
      if (Number.isNaN(due.getTime())) continue;
      if (due.getTime() > now.getTime()) continue;
      const after = await runScheduleNow(record.schedule_id, now);
      if (after === null) continue;
      if (isCronTriggerable(after)) {
        after.next_run_time = computeNextRunTime(after, now);
      }
      // one-shot 已在 runScheduleNow 内 completed=true / next_run_time=null。
      try {
        saveSchedule(after);
      } catch { /* 下个 tick 重试 */ }
    }
  } finally {
    ticking = false;
  }
}

/** 启动轮询（幂等）。对齐 server.py startup 的 start_scheduler 语义。 */
export function startSchedulerEngine(): void {
  if (timer !== null) return;
  timer = setInterval(() => void tick(new Date()), TICK_MS);
  // 不阻塞进程退出（对齐 BackgroundScheduler daemon=True）。
  timer.unref?.();
  console.log('[scheduler] engine started (poll interval 30s)');
}

export function stopSchedulerEngine(): void {
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
  ticking = false;
}

/** 测试注入：把轮询间隔改成毫秒级 + 重置状态。 */
export function _resetEngineForTests(): void {
  stopSchedulerEngine();
}

export { TICK_MS };
