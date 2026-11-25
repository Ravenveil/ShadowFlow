/**
 * analytics 域 — evidence 子域领域模型（纯报告口径层）
 *
 * 交付报告/评分速览/订单 CSV 的展示口径：金额换算、本地时间戳、Markdown 转义、
 * CSV 注入防护、文件名规则、状态中文化。纯函数，禁止 import
 * express/sqlite/crypto/fs。
 *
 * 关键不变量：
 *   - 金额一律整数分，只在展示时除 100（避免浮点误差进账）
 *   - 时间用本地时区格式化（UTC 会把早上 8 点前的单算到昨天）
 *   - CSV 文本列必须防公式注入（= + - @ 前缀补单引号），数字列不走转义
 *   - 文件名只用 ASCII（跨浏览器 Content-Disposition 中文编码不一致）
 */

export const CSV_ROW_CAP = 5000;

/** 异常 hop 状态（报告里要单列出来，不能混进「完成」）。 */
export const HOP_ABNORMAL = ['failed', 'timeout', 'denied', 'aborted', 'empty'] as const;

export const STATUS_LABEL: Record<string, string> = {
  created: '待支付',
  paid: '已支付',
  refunded: '已退款',
};

export const ACTION_LABEL: Record<string, string> = {
  create: '新建',
  update: '更新',
  conflict: '冲突留痕（待人裁决）',
  keep: '低置信保留原值',
  override: '人工采纳',
  dismiss: '人工驳回',
};

export const STEP_LABEL: Record<string, string> = {
  visit_landed: '落地页到访',
  order_created: '下单',
  order_paid: '支付成功',
  ledger_income: '记入流水',
  dashboard_visible: '看板可见',
};

/** agent_hops 状态的中文化，报告里不直接甩英文枚举给评委。 */
export const HOP_STATUS_LABEL: Record<string, string> = {
  pending: '待开始',
  running: '执行中',
  done: '完成',
  failed: '失败',
  timeout: '超时',
  empty: '空产出',
  denied: '拒绝 / 策略拦截',
  aborted: '已中止',
};

/** 非负整数上限规整：非法/<=0 → fallback，超上限截断。 */
export function capNum(v: unknown, fallback: number, max: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.trunc(n), max) : fallback;
}

/** 分 → ¥（两位小数）。金额一律整数分，只有展示时换算。 */
export function yuan(cents: number): string {
  return `¥${(cents / 100).toFixed(2)}`;
}

/** 本地时间 `YYYY-MM-DD HH:mm:ss`；空/非法 → —。 */
export function stamp(ts: number | null | undefined): string {
  if (ts === null || ts === undefined || !Number.isFinite(ts)) return '—';
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** 时间窗文案：两端都空 = 全量；只给起点 = 到现在。 */
export function windowLabel(from: number | null, to: number | null): string {
  if (from === null && to === null) return '全部（开张至今）';
  return `${stamp(from)} ~ ${to === null ? '现在' : stamp(to)}`;
}

/** Markdown 表格单元格：转义竖线、换行压平、截断 160 字。 */
export function mdCell(v: unknown): string {
  return String(v ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ')
    .slice(0, 160);
}

/**
 * CSV 文本单元格：Excel 会把以 = + - @ 开头的文本当公式执行（CSV 注入），
 * 所以给这些前缀补一个单引号并统一加双引号。数字列不要走这里，
 * 否则负数金额会变成文本、导出来没法直接求和。
 */
export function csvText(v: unknown): string {
  let s = String(v ?? '').replace(/\r?\n/g, ' ');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

/** ASCII 文件名（跨浏览器 Content-Disposition 稳定）。 */
export function evidenceFilename(
  kind: 'md' | 'csv' | 'scorecard',
  generatedAt = Date.now(),
): string {
  const d = new Date(generatedAt);
  const p = (n: number) => String(n).padStart(2, '0');
  const tag = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
  const base = kind === 'scorecard' ? 'shadowflow-scorecard' : 'shadowflow-evidence';
  return `${base}-${tag}.${kind === 'csv' ? 'csv' : 'md'}`;
}
