/**
 * format.ts — 纯展示格式化。
 *
 * 只做「数字 / 时间戳 → 人读字符串」，不含业务判断，也不碰 DOM；
 * 组件与映射层都能用。放这里而不是各处内联，是为了同一个大小别有两种写法。
 */

/** 字节数 → 人读大小。0 / 非法值给「—」（目录本来就没有大小）。 */
export function sizeLabel(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) {
    const kb = bytes / 1024;
    return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

/**
 * 毫秒时间戳 → 「今天 17:05」/「昨天 09:12」/「11-19 17:05」。
 * 产物列表里只当副标题用，不值得引第三方日期库。
 */
export function stampLabel(ms: number, now: number = Date.now()): string {
  if (!Number.isFinite(ms) || ms <= 0) return '';
  const d = new Date(ms);
  const today = new Date(now);
  const dayMs = 24 * 60 * 60 * 1000;
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const clock = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

  if (ms >= startOfToday) return `今天 ${clock}`;
  if (ms >= startOfToday - dayMs) return `昨天 ${clock}`;
  return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${clock}`;
}

/** 只要钟点（消息抬头右上角）。 */
export function clockLabel(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '';
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/**
 * 一段耗时 → 「12s」/「3m 20s」/「1h 05m」。
 * 时间线上的耗时是给人扫一眼的，不必精确到毫秒。
 */
export function elapsedLabel(ms: number | undefined): string {
  if (!ms || !Number.isFinite(ms) || ms < 0) return '';
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) {
    const rest = sec % 60;
    return rest ? `${min}m ${pad2(rest)}s` : `${min}m`;
  }
  return `${Math.floor(min / 60)}h ${pad2(min % 60)}m`;
}

/** 一天的分隔键（跨天要插一条日期线）。 */
export function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
