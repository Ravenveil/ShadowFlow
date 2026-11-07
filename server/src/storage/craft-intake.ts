/**
 * craft-intake.ts — 「手工艺品代卖」业务落库胶水（2026-11-07）。
 *
 * 两件事：
 *   ① applyCraftMarkers —— 把 agent 输出协议标记（lib/craft-markers 解析）
 *      落到产品盈利库：[intake] 上架商品、[order] 记销售、[post]/[link] 营销
 *      动态、[ship] 快递动态、[report] 盈利汇报（只剥标记）。作用域：只有
 *      「代卖团队」绑的群才生效（isCraftGroup，settings craft_profit.team），
 *      其他群 agent 引用协议标记不剥不落库。
 *   ② ingestProductMaterial —— 用户发来的产品资料（文字介绍/图片/文档文本）
 *      自动同步到记忆库「手工艺品资料」pack（PYTHON /api/memory-bank），
 *      并把 pack id 交给 knowledgeBlock 检索注入（groups-chat 挂钩点调用）。
 *
 * 全程 fail-soft：记忆库不可达只丢同步不阻塞聊天；单条标记落库失败记入
 * applied 结果（可见），不抛。
 */
import {
  CraftProfitError,
  createProduct,
  createSale,
  insertAgentEvent,
  listProducts,
} from './craft-profit';
import { getSetting } from './settings';
import { parseCraftMarkers, type CraftAction, type CraftTag } from '../lib/craft-markers';
import { PYTHON_BACKEND_URL } from '../python-backend';

/** 团队 setup 写入的 settings key（craft-team-setup.ts 同用）。 */
export const CRAFT_TEAM_KEY = 'craft_profit.team';
/** 记忆库 pack 名（产品资料统一沉淀处）。 */
export const CRAFT_PACK_NAME = '手工艺品资料';

/** 单次记忆库 HTTP 超时（sidecar 不该拖死聊天链路）。 */
const KB_TIMEOUT_MS = 4000;

export interface CraftTeamRef {
  team_id?: string;
  group_id?: string;
  agent_ids?: string[];
}

export interface AppliedAction {
  tag: CraftTag;
  ok: boolean;
  /** 落库结果描述（进运营动态/日志）。 */
  detail?: string;
  error?: string;
}

// ── 作用域：只有代卖团队绑的群走本协议 ──────────────────────────────────────

export function readCraftTeamRef(): CraftTeamRef | null {
  const raw = getSetting(CRAFT_TEAM_KEY) as CraftTeamRef | undefined;
  if (!raw || typeof raw !== 'object') return null;
  return raw;
}

export function isCraftGroup(group: { group_id?: string; team_id?: string | null }): boolean {
  const ref = readCraftTeamRef();
  if (!ref) return false;
  if (ref.group_id && group.group_id && ref.group_id === group.group_id) return true;
  return Boolean(ref.team_id && group.team_id && ref.team_id === group.team_id);
}

// ── ① 标记 → 业务动作落库 ───────────────────────────────────────────────────

function yuan(cents: number): string {
  return `¥${(cents / 100).toFixed(2)}`;
}

/** 按名称找商品（精确不区分大小写 → 包含兜底）。 */
function findProduct(name: string): { id: string; name: string } | null {
  const want = name.trim().toLowerCase();
  if (!want) return null;
  const products = listProducts();
  const exact = products.find((p) => p.name.trim().toLowerCase() === want);
  if (exact) return { id: exact.id, name: exact.name };
  const loose = products.find(
    (p) => p.name.toLowerCase().includes(want) || want.includes(p.name.toLowerCase()),
  );
  return loose ? { id: loose.id, name: loose.name } : null;
}

function applyOne(action: CraftAction): AppliedAction {
  try {
    switch (action.kind) {
      case 'intake': {
        const p = createProduct({
          name: action.name,
          price_cents: action.price_cents,
          artisan_cents: action.artisan_cents,
          shipping_cents: action.shipping_cents,
          marketing_cents: action.marketing_cents,
        });
        return { tag: 'intake', ok: true, detail: `上架「${p.name}」售价 ${yuan(p.price_cents)}` };
      }
      case 'post': {
        const detail = `在${action.platform}发帖：${action.title || action.text.slice(0, 40) || '推广内容'}`;
        insertAgentEvent('marketing', detail);
        return { tag: 'post', ok: true, detail };
      }
      case 'link': {
        const detail = `上商品链接${action.product ? `「${action.product}」` : ''} ${action.url}`.trim();
        insertAgentEvent('marketing', detail);
        return { tag: 'link', ok: true, detail };
      }
      case 'order': {
        const p = findProduct(action.product);
        if (!p) return { tag: 'order', ok: false, error: `商品「${action.product}」还没上架` };
        const sale = createSale({ product_id: p.id, qty: action.qty });
        const detail = `「${p.name}」售出 ${action.qty} 件，入账 ${yuan(sale.price_cents * action.qty)}`;
        insertAgentEvent('order', detail);
        return { tag: 'order', ok: true, detail };
      }
      case 'ship': {
        const detail =
          `已联系快递员上门取件，寄出「${action.product}」×${action.qty}` +
          (action.tracking ? `（运单 ${action.tracking}）` : '');
        insertAgentEvent('shipping', detail);
        return { tag: 'ship', ok: true, detail };
      }
      case 'report':
        // 盈利汇报是聊天内容本身（财务官发给用户的报告），无库侧动作。
        return { tag: 'report', ok: true, detail: '盈利汇报已输出' };
      default:
        return { tag: 'report', ok: false, error: '未知动作' };
    }
  } catch (err) {
    const msg = err instanceof CraftProfitError ? err.message : (err as Error).message;
    return { tag: (action as { kind: CraftTag }).kind, ok: false, error: msg };
  }
}

/**
 * 解析并落业务动作；返回剥掉标记后的展示文本。
 * scoped=false（非代卖群）→ 原文原样返回、零副作用。
 */
export function applyCraftMarkers(
  text: string,
  opts: { scoped: boolean },
): { applied: AppliedAction[]; cleaned: string } {
  if (!opts.scoped) return { applied: [], cleaned: text };
  const { markers, cleaned } = parseCraftMarkers(text);
  const applied = markers.map((m) =>
    m.ok && m.action
      ? applyOne(m.action)
      : { tag: m.tag, ok: false, error: m.error ?? '标记解析失败' },
  );
  return { applied, cleaned };
}

// ── ② 产品资料自动同步记忆库（fail-soft）────────────────────────────────────

let packCache: string | null = null;

interface Envelope<T> {
  data?: T;
}

async function kbFetch<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), KB_TIMEOUT_MS);
    const res = await fetch(`${PYTHON_BACKEND_URL}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const json = (await res.json()) as Envelope<T> | T;
    return ((json as Envelope<T>).data ?? json) as T;
  } catch {
    return null;
  }
}

/** 「手工艺品资料」pack：有则复用、无则建（缓存 pack id）。 */
export async function ensureCraftPack(): Promise<string | null> {
  if (packCache) return packCache;
  const listed = await kbFetch<{ packs?: Array<{ pack_id?: string; name?: string }> }>(
    '/api/memory-bank/packs',
  );
  const hit = listed?.packs?.find((p) => p.name === CRAFT_PACK_NAME);
  if (hit?.pack_id) {
    packCache = hit.pack_id;
    return packCache;
  }
  const created = await kbFetch<{ pack_id?: string }>('/api/memory-bank/packs', {
    method: 'POST',
    body: JSON.stringify({
      name: CRAFT_PACK_NAME,
      description: '残障伙伴手工艺品代卖：产品介绍、图片/文档说明、定价与卖点',
    }),
  });
  if (created?.pack_id) packCache = created.pack_id;
  return packCache;
}

/** 测试用：清 pack 缓存。 */
export function _resetCraftPackCache(): void {
  packCache = null;
}

/**
 * 用户产品资料 → 记忆库。短消息/命令（/ 开头）不同步；同文去重由
 * memory-bank 的 deduplicate 承担。返回 pack id（失败 null）。
 */
export async function ingestProductMaterial(
  text: string,
  sourceName?: string,
): Promise<string | null> {
  const t = (text ?? '').trim();
  if (t.length < 10 || t.startsWith('/')) return null;
  const packId = await ensureCraftPack();
  if (!packId) return null;
  const ok = await kbFetch(`/api/memory-bank/packs/${encodeURIComponent(packId)}/text`, {
    method: 'POST',
    body: JSON.stringify({
      text: t,
      source_name: sourceName || '产品资料.txt',
      deduplicate: true,
    }),
  });
  return ok ? packId : null;
}
