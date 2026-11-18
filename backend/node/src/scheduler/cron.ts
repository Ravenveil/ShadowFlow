/**
 * cron.ts — 单后端迁移：schedules 调度引擎的最小 cron 实现。
 *
 * 移植自 Python backend/python/shadowflow/api/runs/schedules.py 对
 * APScheduler CronTrigger 的三个依赖面：
 *   1. CronTrigger.from_crontab(expr) 的校验（invalid_cron 422）
 *   2. trigger.get_next_fire_time(None, now) 的下次触发计算（next_run_time +
 *      引擎到期判定）
 *   3. _parse_cron_interval_minutes 的保守间隔估算（防呆②）
 *
 * 语义对齐说明（重要）：
 *   - 5 字段：minute hour dom month dow。
 *   - dow 数字语义跟随 APScheduler（0=mon … 6=sun，7 兼容 sun）——注意这与
 *     unix crontab（0=sun）不同，但 Python 端 from_crontab 实际就是
 *     APScheduler 语义，这里保持一致（行为对齐优先于 unix 惯例）。
 *   - dom 与 dow 同时受限时取 OR（命中其一即触发）——APScheduler/unix cron
 *     同款规则。
 *   - 时区：next-fire 用进程本地时区（Date 的本地 getter），对齐 APScheduler
 *     from_crontab 不传 timezone 时的默认行为（get_localzone()）。
 */

// ── 表达式解析 ───────────────────────────────────────────────────────────────

const MONTH_NAMES: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** APScheduler dow 名字 → APScheduler 数字（0=mon … 6=sun）。 */
const DOW_NAMES: Record<string, number> = {
  mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6,
};

const FIELD_NAMES = ['minute', 'hour', 'dom', 'month', 'dow'] as const;
void FIELD_NAMES;

export interface CronFields {
  minute: Set<number>;
  hour: Set<number>;
  dom: Set<number>;
  month: Set<number>;
  /** JS Date.getDay() 空间（0=sun）的星期集合。 */
  dow: Set<number>;
  domWild: boolean;
  dowWild: boolean;
}

function resolveValue(token: string, names?: Record<string, number>): number | null {
  const s = token.trim().toLowerCase();
  if (!s) return null;
  if (names && s in names) return names[s];
  if (!/^\d+$/.test(s)) return null;
  return parseInt(s, 10);
}

/** 解析单字段（支持 * , a-b a/b a-b/step 名字）。非法 → null。 */
function parseField(
  raw: string,
  min: number,
  max: number,
  names?: Record<string, number>,
): Set<number> | null {
  const out = new Set<number>();
  for (const part of raw.split(',')) {
    if (!part) return null;
    const slash = part.indexOf('/');
    const rangePart = slash === -1 ? part : part.slice(0, slash);
    const stepStr = slash === -1 ? null : part.slice(slash + 1);
    let step: number | null = null;
    if (stepStr !== null) {
      if (!stepStr) return null;
      step = parseInt(stepStr, 10);
      if (!Number.isInteger(step) || step < 1) return null;
    }

    let start: number;
    let end: number;
    if (rangePart === '*') {
      start = min;
      end = max;
    } else if (rangePart.includes('-')) {
      const [a, b] = rangePart.split('-');
      if (a === undefined || b === undefined) return null;
      const s1 = resolveValue(a, names);
      const s2 = resolveValue(b, names);
      if (s1 === null || s2 === null) return null;
      start = s1;
      end = s2;
    } else {
      const v = resolveValue(rangePart, names);
      if (v === null) return null;
      start = v;
      // APScheduler 允许 "a/b"（= a 到 max 步进 b）。
      end = step !== null ? max : v;
    }
    if (start < min || end > max || start > end) return null;
    for (let v = start; v <= end; v += step ?? 1) out.add(v);
  }
  return out.size > 0 ? out : null;
}

/** APScheduler dow 数字（0=mon..6=sun，7=sun 兼容）→ JS getDay()（0=sun）。 */
function dowToJsDay(v: number): number {
  return (v % 7 + 1) % 7;
}

export interface CronParseError {
  message: string;
}

/**
 * 解析 5 字段 cron 表达式。成功返回字段集合；失败返回错误（文案近似
 * APScheduler 的 ValueError，用于 invalid_cron 422 的 detail 拼接）。
 */
export function parseCron(expr: string): { fields: CronFields } | { error: string } {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) {
    return { error: `Wrong number of fields; got ${fields.length}, expected 5` };
  }
  const minute = parseField(fields[0] as string, 0, 59);
  if (!minute) return { error: `Error validating expression '${fields[0]}': minute field is invalid` };
  const hour = parseField(fields[1] as string, 0, 23);
  if (!hour) return { error: `Error validating expression '${fields[1]}': hour field is invalid` };
  const dom = parseField(fields[2] as string, 1, 31);
  if (!dom) return { error: `Error validating expression '${fields[2]}': day field is invalid` };
  const month = parseField(fields[3] as string, 1, 12, MONTH_NAMES);
  if (!month) return { error: `Error validating expression '${fields[3]}': month field is invalid` };
  const dowRaw = parseField(fields[4] as string, 0, 7, DOW_NAMES);
  if (!dowRaw) return { error: `Error validating expression '${fields[4]}': day of week field is invalid` };
  const dow = new Set<number>();
  for (const v of dowRaw) dow.add(dowToJsDay(v));
  return {
    fields: {
      minute,
      hour,
      dom,
      month,
      dow,
      domWild: fields[2] === '*',
      dowWild: fields[4] === '*',
    },
  };
}

/** 表达式能否被调度（对齐 CronTrigger.from_crontab 的成功/抛错边界）。 */
export function isValidCron(expr: string): boolean {
  return parseCron(expr).hasOwnProperty('fields');
}

// ── 下次触发计算（对齐 get_next_fire_time(None, now)）───────────────────────

function dayMatches(f: CronFields, t: Date): boolean {
  if (f.domWild && f.dowWild) return true;
  const domHit = f.dom.has(t.getDate());
  const dowHit = f.dow.has(t.getDay());
  if (f.domWild) return dowHit;
  if (f.dowWild) return domHit;
  return domHit || dowHit;
}

/**
 * 返回严格晚于 after 的下一个整分钟触发时刻；一年内无匹配 → null。
 * 用本地时区 getter（对齐 APScheduler 默认本地时区语义）。
 */
export function nextCronFire(expr: string, after: Date): Date | null {
  const parsed = parseCron(expr);
  if (!('fields' in parsed)) return null;
  const f = parsed.fields;
  let t = new Date(Math.floor(after.getTime() / 60000) * 60000 + 60000);
  const limit = 366 * 24 * 60; // 最多扫一年
  for (let i = 0; i < limit; i++) {
    if (
      f.month.has(t.getMonth() + 1) &&
      dayMatches(f, t) &&
      f.hour.has(t.getHours()) &&
      f.minute.has(t.getMinutes())
    ) {
      return t;
    }
    t = new Date(t.getTime() + 60000);
  }
  return null;
}

// ── 保守间隔估算（防呆②，照抄 Python _parse_cron_interval_minutes）─────────

function stepOf(field: string): number | null {
  if (!field.includes('/')) return null;
  const stepPart = field.slice(field.indexOf('/') + 1);
  const step = parseInt(stepPart, 10);
  if (!Number.isInteger(step) || step <= 0) return null;
  return step;
}

function isWildcard(field: string): boolean {
  return field === '*' || (field.startsWith('*/') && /^\d+$/.test(field.slice(2)));
}

/**
 * 保守估算 cron 连续两次触发的最短间隔（分钟）。无法保守解析 → null
 * （调用方跳过间隔检查，避免误伤）。
 */
export function parseCronIntervalMinutes(cron: string): number | null {
  const fields = cron.split(' ');
  if (fields.length !== 5) return null;
  const minute = fields[0] as string;
  const hour = fields[1] as string;

  // minute 字段 */N 或 A/B → 每 N 分钟。
  const mStep = stepOf(minute);
  if (mStep !== null) return mStep;
  // minute 通配 + hour 步进 → 每 B 小时。
  if (isWildcard(minute) && (hour.startsWith('*/') || hour.includes('/'))) {
    const hStep = stepOf(hour);
    if (hStep !== null) return hStep * 60;
  }
  // 列表分钟 → 小时内最短相邻间隔（含跨小时回绕）。
  if (minute.includes(',')) {
    try {
      const mins = [...new Set(minute.split(',').map((x) => parseInt(x, 10)))]
        .filter((x) => Number.isInteger(x))
        .sort((a, b) => a - b);
      if (mins.length !== minute.split(',').length) return null;
      const gaps: number[] = [];
      for (let i = 1; i < mins.length; i++) gaps.push((mins[i] as number) - (mins[i - 1] as number));
      gaps.push(60 - (mins[mins.length - 1] as number) + (mins[0] as number));
      return Math.max(Math.min(...gaps), 1);
    } catch {
      return null;
    }
  }
  // 单个固定分钟 → 至多每小时一次。
  if (/^\d+$/.test(minute)) return 60;
  return null;
}
