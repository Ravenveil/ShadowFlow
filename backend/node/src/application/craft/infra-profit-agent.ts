/**
 * craft-profit-agent.ts — 代卖运营智能体（2026-11-07）。
 *
 * 案例：为残障伙伴卖手工艺品 —— 对方只上架商品，我们（智能体）负责营销、
 * 联系快递员寄出商品。本模块把这套经营活动做成可自动运行的轮次：
 *
 *   ① 营销推广 → ② 买家出单（按当时价格快照记销售）→ ③ 联系快递员取件寄出
 *
 * 每轮产出运营动态（cp_agent_events）+ 销售（cp_sales），看板随之自动长出
 * 盈利数据与盈利曲线 —— 看板数据由智能体经营产生，不靠人工录入。
 *
 * 自动模式：settings 持久化（craft_profit.auto_ops），进程内定时器到点自动
 * 跑一轮；initAutoOps() 在路由加载时恢复，重启后自动续跑。
 */
import {
  CraftProfitError,
  createSale,
  insertAgentEvent,
  listAgentEvents,
  listProducts,
  type AgentEvent,
} from './infra-profit';
import { getSetting, setSetting } from '../../application/settings/infra-store';
import {
  AUTO_KEY,
  readAutoOpsConfig,
  normalizeAutoOpsInput,
  pickIndex,
  promoteCount as modelPromoteCount,
  orderCount as modelOrderCount,
  unitsPerOrder,
  revenueText,
  NO_PRODUCTS_NOTE,
  AgentRoundError,
} from './agent-model';

export class CraftAgentError extends CraftProfitError {}

export interface RunRoundResult {
  events: AgentEvent[];
  sales: number;
  units: number;
  /** 无商品等友好提示（此时 events 为空）。 */
  note?: string;
}

let timer: ReturnType<typeof setInterval> | null = null;
let rounds = 0;
let lastRunAt: number | null = null;

/**
 * 跑一轮「代卖运营」。rand 可注入（测试可控），默认 Math.random。
 * 无商品时不报错，返回 note 引导先上架。
 */
export function runRound(rand: () => number = Math.random): RunRoundResult {
  const products = listProducts();
  if (products.length === 0) {
    return { events: [], sales: 0, units: 0, note: NO_PRODUCTS_NOTE };
  }
  const pick = <T>(arr: T[]): T => arr[pickIndex(rand, arr.length)];
  const events: AgentEvent[] = [];

  // ① 营销推广：挑 1-2 个商品做朋友圈 + 短视频推广
  const promoteN = modelPromoteCount(rand);
  const promoted = new Set<string>();
  for (let i = 0; i < promoteN; i++) {
    const p = pick(products);
    if (promoted.has(p.id)) continue;
    promoted.add(p.id);
    events.push(insertAgentEvent('marketing', `给「${p.name}」做朋友圈 + 短视频推广`));
  }

  // ② 买家出单：0-3 单，每单 1-3 件，按当时价格快照记账
  const orderN = modelOrderCount(rand);
  let units = 0;
  for (let i = 0; i < orderN; i++) {
    const p = pick(products);
    const n = unitsPerOrder(rand);
    const sale = createSale({ product_id: p.id, qty: n });
    units += n;
    events.push(
      insertAgentEvent('order', `「${p.name}」售出 ${n} 件，入账 ${revenueText(sale.price_cents, n)}`),
    );
    // ③ 联系快递员上门取件寄出
    events.push(insertAgentEvent('shipping', `已联系快递员上门取件，寄出「${p.name}」×${n}`));
  }

  rounds += 1;
  lastRunAt = Date.now();
  return { events, sales: orderN, units };
}

/** 最近运营动态（时间倒序）。 */
export function listEvents(limit = 20): AgentEvent[] {
  return listAgentEvents(limit);
}

// ── 自动模式（settings 持久化 + 进程内定时器）───────────────────────────────

export interface AutoOpsState {
  enabled: boolean;
  interval_min: number;
  last_run_at: number | null;
  rounds: number;
}

function readState(): { enabled: boolean; interval_min: number } {
  return readAutoOpsConfig(getSetting(AUTO_KEY));
}

function schedule(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  const st = readState();
  if (!st.enabled) return;
  timer = setInterval(() => {
    try {
      runRound();
    } catch {
      /* 单轮失败不影响后续轮次 */
    }
  }, st.interval_min * 60_000);
  timer.unref?.(); // 不阻塞进程退出
}

/** 开/关自动运营、调间隔（1-1440 分钟）。settings 持久化，重启续跑。 */
export function setAutoOps(input: { enabled?: unknown; interval_min?: unknown }): AutoOpsState {
  let normalized;
  try {
    normalized = normalizeAutoOpsInput(input, readState());
  } catch (err) {
    if (err instanceof AgentRoundError) throw new CraftAgentError(err.message);
    throw err;
  }
  setSetting(AUTO_KEY, { enabled: normalized.enabled, interval_min: normalized.interval_min });
  schedule();
  return { enabled: normalized.enabled, interval_min: normalized.interval_min, last_run_at: lastRunAt, rounds };
}

export function autoStatus(): AutoOpsState {
  const st = readState();
  return { ...st, last_run_at: lastRunAt, rounds };
}

/** 路由加载时调用：恢复持久化的自动运营定时器。 */
export function initAutoOps(): void {
  schedule();
}
