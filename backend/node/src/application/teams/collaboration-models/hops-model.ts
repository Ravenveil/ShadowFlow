/**
 * collaboration 域 — agent-hops 子域领域模型（纯规则层）
 *
 * hop 交接的领域概念与不变量，纯函数，禁止 import express/sqlite/crypto/fs。
 * 迁移自 storage/agent-hops.ts，行为逐字对齐。
 */

/** hop 状态机：pending(未开始) → running → 终态之一。 */
export type HopStatus =
  | 'pending'
  | 'running'
  | 'done'
  | 'failed'
  | 'timeout'
  | 'empty'
  | 'denied'
  | 'aborted';

export type SettledStatus = Exclude<HopStatus, 'pending' | 'running'>;

/** 终态集合（规则单一真源）。 */
export const TERMINAL_STATUSES: readonly SettledStatus[] = [
  'done', 'failed', 'timeout', 'empty', 'denied', 'aborted',
];

export interface AgentHop {
  id: string;
  group_id: string;
  turn_seq: number;
  from_agent: string;
  to_agent: string;
  status: HopStatus;
  output_chars: number;
  detail: string;
  created_at: number;
  settled_at: number | null;
}

export interface OpenHop {
  group_id: string;
  turn_seq: number;
  from_agent: string;
  to_agent: string;
}

export interface SettleOptions {
  outputChars?: number;
  detail?: string;
}

// ── 值对象级纯函数 ────────────────────────────────────────────────────────────

/** 终态判定：不是 pending/running 即终态。 */
export function isSettled(status: HopStatus): status is SettledStatus {
  return status !== 'pending' && status !== 'running';
}

/** 结算字段规整：字符数非负整数、detail 截 500。 */
export function normalizeSettleFields(opts: SettleOptions): { outputChars: number; detail: string } {
  return {
    outputChars: Math.max(0, Math.round(opts.outputChars ?? 0)),
    detail: (opts.detail ?? '').slice(0, 500),
  };
}

/** 清扫原因规整：截 500。 */
export function normalizeSweepDetail(detail?: string): string {
  return (detail ?? '进程重启中断，启动清扫补结算').slice(0, 500);
}

/** 最近回合数规整：1..20。 */
export function normalizeTurns(turns: number): number {
  return Math.min(Math.max(turns, 1), 20);
}

/** 状态中文标签。 */
export function hopStatusLabel(s: HopStatus): string {
  switch (s) {
    case 'done': return '完成';
    case 'failed': return '失败';
    case 'timeout': return '超时';
    case 'empty': return '空回复';
    case 'denied': return '被拦截';
    case 'aborted': return '中止';
    case 'running': return '进行中';
    case 'pending': return '待开始';
  }
}

/** 交接摘要的一行文本（零 LLM，现算）。 */
export function summarizeHopLine(h: AgentHop): string {
  const arrow = `${h.from_agent} → ${h.to_agent}`;
  switch (h.status) {
    case 'done':
      return `✅ ${arrow}：交接 ${h.output_chars} 字产出`;
    case 'denied':
      return `⛔ ${arrow}：被策略拦截${h.detail ? `（${h.detail}）` : ''}`;
    case 'aborted':
      return `⏹ ${arrow}：回合中止，交接未完成`;
    case 'running':
    case 'pending':
      return `⏳ ${arrow}：交接未结算（异常路径，值得排查）`;
    default:
      return `❌ ${arrow}：${hopStatusLabel(h.status)}${h.detail ? ` — ${h.detail}` : ''}`;
  }
}

/** 交接摘要全文：空返回空串（不发废话消息）。 */
export function summarizeHopsText(hops: readonly AgentHop[]): string {
  if (!hops.length) return '';
  const lines = hops.map(summarizeHopLine);
  return `[交接记录] 本回合 ${hops.length} 次交接：\n${lines.join('\n')}`;
}
