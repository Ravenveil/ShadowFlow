/**
 * craft 域 — profit-agent 子域领域模型（纯规则层）
 *
 * 代卖运营轮次的确定性参数规则 + 自动模式配置校验。纯函数，禁止 import sqlite/settings/fs。
 * 定时器/side-effect 留在 storage/craft-profit-agent.ts。
 */

export const AUTO_KEY = 'craft_profit.auto_ops';
export const DEFAULT_INTERVAL_MIN = 30;
export const MIN_INTERVAL_MIN = 1;
export const MAX_INTERVAL_MIN = 1440;

/** 领域错误（沿用 CraftAgentError 语义由 storage 定义，这里抛基础 Error 类型由 storage 包装）。 */
export class AgentRoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgentRoundError';
  }
}

export interface AutoOpsConfig {
  enabled: boolean;
  interval_min: number;
}

/** 从持久化原始值读配置：enabled 严格布尔，interval 合法正整数否则默认 30。 */
export function readAutoOpsConfig(raw: unknown): AutoOpsConfig {
  const r = raw as { enabled?: unknown; interval_min?: unknown } | undefined;
  const n = Number(r?.interval_min);
  return {
    enabled: r?.enabled === true,
    interval_min: Number.isFinite(n) && n >= 1 ? Math.round(n) : DEFAULT_INTERVAL_MIN,
  };
}

/** setAutoOps 入参规整：interval 必须在 1..1440，否则抛错；enabled 缺省沿用当前值。 */
export function normalizeAutoOpsInput(
  input: { enabled?: unknown; interval_min?: unknown },
  cur: AutoOpsConfig,
): AutoOpsConfig {
  const enabled = input.enabled === undefined ? cur.enabled : Boolean(input.enabled);
  let interval = cur.interval_min;
  if (input.interval_min !== undefined) {
    const n = Number(input.interval_min);
    if (!Number.isFinite(n) || n < MIN_INTERVAL_MIN || n > MAX_INTERVAL_MIN) {
      throw new AgentRoundError('interval_min 填 1 到 1440 的整数（分钟）');
    }
    interval = Math.round(n);
  }
  return { enabled, interval_min: interval };
}

/** 安全 pick：rand∈[0,1) 映射到合法索引（越界钳到末位）。 */
export function pickIndex(rand: () => number, length: number): number {
  return Math.min(Math.max(length - 1, 0), Math.floor(rand() * length));
}

/** 一轮营销商品数：1..2。 */
export function promoteCount(rand: () => number): number {
  return 1 + Math.floor(rand() * 2);
}

/** 一轮下单数：0..3。 */
export function orderCount(rand: () => number): number {
  return Math.floor(rand() * 4);
}

/** 一单件数：1..3。 */
export function unitsPerOrder(rand: () => number): number {
  return 1 + Math.floor(rand() * 3);
}

/** 入账金额文案：分 → ¥x.xx（两位小数）。 */
export function revenueText(priceCents: number, units: number): string {
  return `¥${((priceCents * units) / 100).toFixed(2)}`;
}

/** 无商品时的友好提示。 */
export const NO_PRODUCTS_NOTE = '还没有商品，先上架商品或填演示数据';
