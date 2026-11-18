/**
 * store.ts — 单后端迁移：schedules 域存储层。
 *
 * 移植自 Python backend/python/shadowflow/api/runs/schedules.py 的存储段：
 *   存储位置：<repo>/.shadowflow/schedules/{schedule_id}.json
 *   （Python _SCHEDULES_DIR = Path(__file__).parents[5]/.shadowflow/schedules，
 *     Node 侧统一收口 repoDataDir() —— 两者是同一物理目录，legacy↔single
 *     共享同一份 JSON，来回切换数据不丢。）
 *
 * 写入协议：tempfile + fsync + rename 原子替换（对齐 _save_schedule 的
 * mkstemp/os.replace），崩溃不留半截 JSON。
 *
 * record 形状与 Python 完全同构（蛇形 key、ISO 时间、runs 数组插头截 20）：
 *   { schedule_id, group_id, cron_expression, start_at, agent_id,
 *     task_description, duration_min, created_at, next_run_time,
 *     completed, enabled, runs: [{run_id, triggered_at, status, error?}] }
 * 熔断后追加 auto_disabled / auto_disabled_at / auto_disabled_reason。
 */

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { repoDataDir } from '../storage/repo-root';

/** 与 Python schedules.py 常量逐字对齐。 */
export const MAX_RUNS_STORED = 20;
export const MAX_ENABLED_SCHEDULES = 20; // 防呆①：启用计划数上限
export const MIN_CRON_INTERVAL_MINUTES = 15; // 防呆②：cron 最小触发间隔
export const MAX_CONSECUTIVE_FAILURES = 10; // 防呆③：连续失败熔断阈值

export const SCHEDULE_ID_RE = /^[a-zA-Z0-9_-]+$/;

export interface ScheduleRun {
  run_id: string;
  triggered_at: string;
  status: 'succeeded' | 'failed';
  error?: string;
}

export interface ScheduleRecord {
  schedule_id: string;
  group_id: string;
  cron_expression: string | null;
  start_at: string | null;
  agent_id: string | null;
  task_description: string;
  duration_min: number;
  created_at: string;
  next_run_time: string | null;
  completed: boolean;
  enabled: boolean;
  runs: ScheduleRun[];
  auto_disabled?: boolean;
  auto_disabled_at?: string;
  auto_disabled_reason?: string;
}

/** uuid hex（无连字符），对齐 Python uuid4().hex。 */
export function newScheduleId(): string {
  return randomUUID().replace(/-/g, '');
}

export function nowIso(): string {
  return new Date().toISOString();
}

// ── 目录/路径 ────────────────────────────────────────────────────────────────

let cachedDir: string | null = null;

/** 测试注入：重定向 schedules 目录（对齐 Python monkeypatch _SCHEDULES_DIR）。 */
export function _setSchedulesDirForTests(dir: string | null): void {
  cachedDir = dir;
}

function schedulesDir(): string {
  const dir = cachedDir ?? path.join(repoDataDir(), 'schedules');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function schedulePath(scheduleId: string): string {
  const root = path.resolve(schedulesDir());
  const resolved = path.resolve(root, `${scheduleId}.json`);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    const err: Error & { status?: number; body?: unknown } = new Error('Invalid schedule_id');
    err.status = 400;
    err.body = { error: { code: 'INVALID_ID', message: 'Invalid schedule_id' } };
    throw err;
  }
  return resolved;
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

/** 原子写：tempfile + rename（对齐 Python mkstemp + os.replace + fsync）。 */
export function saveSchedule(record: ScheduleRecord): void {
  const target = schedulePath(record.schedule_id);
  const content = JSON.stringify(record, null, 2);
  const tmp = path.join(path.dirname(target), `.tmp-${randomUUID().slice(0, 8)}`);
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeFileSync(fd, content, 'utf-8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fs.renameSync(tmp, target);
  } catch (err) {
    try { fs.closeSync(fd); } catch { /* already closed */ }
    try { fs.unlinkSync(tmp); } catch { /* already gone */ }
    throw err;
  }
}

export function loadSchedule(scheduleId: string): ScheduleRecord | null {
  const p = schedulePath(scheduleId);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8')) as ScheduleRecord;
  } catch {
    return null;
  }
}

/** 列出全部（跳过损坏记录 + 告警日志，对齐 _list_schedules）。 */
export function listSchedules(): ScheduleRecord[] {
  const dir = schedulesDir();
  const records: ScheduleRecord[] = [];
  for (const name of fs.readdirSync(dir).sort()) {
    if (!name.endsWith('.json')) continue;
    try {
      records.push(JSON.parse(fs.readFileSync(path.join(dir, name), 'utf-8')));
    } catch (err) {
      console.warn(`schedules: skipping corrupt record ${name}: ${(err as Error).message}`);
    }
  }
  return records;
}

export function deleteScheduleFile(scheduleId: string): void {
  const p = schedulePath(scheduleId);
  try {
    fs.unlinkSync(p);
  } catch {
    /* missing_ok 语义 */
  }
}

/** 启用中计划计数（enabled !== false 视为启用，对齐 _enforce_enabled_cap）。 */
export function countEnabledSchedules(): number {
  return listSchedules().filter((r) => r.enabled !== false).length;
}
