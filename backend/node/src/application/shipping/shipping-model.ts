/**
 * commerce 域 — ops-shipping 子域领域模型（纯规则层）
 *
 * 运单状态机 + 收件信息校验 + 轨迹去重键，纯函数，禁止 import
 * express/sqlite/crypto/fs。
 *
 * 状态机（只前进不回退，delivered 终态；failed 不参与比较）：
 *   pending → shipped → in_transit → delivered
 *                  └── 失败 ──> failed（可重试，重试成功回 shipped）
 *
 * 关键不变量：
 *   - 已有面单号且状态 ≥ shipped 时禁止重复交运（幂等保护）
 *   - 轨迹同步只推进不倒退：RANK[next] > RANK[cur] 才落状态
 *   - 轨迹按 status+note 去重，重复拉不会灌重复事件
 */

export const SHIPMENT_STATUSES = [
  'pending',
  'shipped',
  'in_transit',
  'delivered',
  'failed',
] as const;

export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

/** 状态推进次序（failed 不参与比较，单独处理）。 */
export const RANK: Record<string, number> = {
  pending: 0,
  shipped: 1,
  in_transit: 2,
  delivered: 3,
};

export type RuleResult = { ok: true } | { ok: false; code: string; message: string };

const OK: RuleResult = { ok: true };

/** 已交运判定：有面单号且状态已到 shipped 及以上。 */
export function alreadyShipped(status: string, trackingNo: string | null): boolean {
  return Boolean(trackingNo) && (RANK[status] ?? -1) >= RANK.shipped;
}

/** 轨迹状态是否可推进（严格前进，防回退；未定义状态不推进）。 */
export function canAdvanceTracking(cur: string, next: string): boolean {
  if (RANK[next] === undefined) return false;
  return RANK[next] > (RANK[cur] ?? -1);
}

/** 轨迹事件去重键（status + note，NUL 分隔避免拼接歧义）。 */
export function eventKey(status: string, note: string): string {
  return `${status}\u0000${note}`;
}

/** 收件信息校验：姓名必填、电话 ≥6 位数字、地址 ≥6 字（只做粗校验，不挡海外件）。 */
export function checkReceiver(input: {
  name: string;
  phone: string;
  address: string;
}): RuleResult {
  if (!input.name) {
    return { ok: false, code: 'INVALID_RECEIVER_NAME', message: '收件人姓名不能为空' };
  }
  if (input.phone.replace(/[^0-9]/g, '').length < 6) {
    return { ok: false, code: 'INVALID_RECEIVER_PHONE', message: '收件人电话至少 6 位数字' };
  }
  if (input.address.length < 6) {
    return { ok: false, code: 'INVALID_RECEIVER_ADDRESS', message: '收件地址过短，无法寄达' };
  }
  return OK;
}

/** 重量规整：非负，四舍五入到整克。 */
export function checkWeight(
  v: unknown,
): { ok: true; grams: number } | { ok: false; code: string; message: string } {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n) || n < 0) {
    return { ok: false, code: 'INVALID_WEIGHT', message: 'weight_grams 必须是非负数' };
  }
  return { ok: true, grams: Math.round(n) };
}

/** 交运模式：只认 real，其余一律 mock（安全默认，绝不误发真单）。 */
export function normalizeMode(v: unknown): 'real' | 'mock' {
  return v === 'real' ? 'real' : 'mock';
}

/** 文本字段截断：非字符串当空串。 */
export function trimTo(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}
