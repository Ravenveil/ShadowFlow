/**
 * craft-intake.ts — 「手工艺品代卖」业务落库胶水（2026-11-07）。
 *
 * 两件事：
 *   ① applyCraftMarkers —— 把 agent 输出协议标记（lib/craft-markers 解析）
 *      落到产品盈利库：[intake] 上架商品、[order] 记销售、[post]/[link] 营销
 *      动态、[ship] 快递动态、[report] 盈利汇报（只剥标记）；[build-team]/
 *      [dispatch] 是流程动作（建团队/向工作群派活），本层只剥标记并把动作
 *      透传给调用方（groups-chat 挂钩点发 HTTP 执行）。作用域（isCraftGroup）：
 *      代卖团队绑的群 + 「总经理」的 DM（主控对话，团队未建时 [build-team]
 *      也要生效），其他群 agent 引用协议标记不剥不落库。
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

/** 团队 setup 写入的 settings key（craft-team-setup.ts 同用）。 */
export const CRAFT_TEAM_KEY = 'craft_profit.team';
/** 记忆库 pack 名（产品资料统一沉淀处）。 */
export const CRAFT_PACK_NAME = '手工艺品资料';

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

// ── 作用域：代卖团队绑的群 + 总经理 DM（主控对话）走本协议 ─────────────────

/** 内置「总经理」agent id（services/secretary_seed.py 同值）。 */
export const SECRETARY_AGENT_ID = 'agent-shadow-secretary';

export function readCraftTeamRef(): CraftTeamRef | null {
  const raw = getSetting(CRAFT_TEAM_KEY) as CraftTeamRef | undefined;
  if (!raw || typeof raw !== 'object') return null;
  return raw;
}

export function isCraftGroup(group: {
  group_id?: string;
  team_id?: string | null;
  kind?: string;
  agent_ids?: string[];
}): boolean {
  // 总经理 DM 恒定作用域：主控对话。团队可能还没建（[build-team] 就是在
  // 这里发出的），所以不依赖 settings 引用。
  if (group.kind === 'dm' && (group.agent_ids ?? []).includes(SECRETARY_AGENT_ID)) {
    return true;
  }
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
          cost_cents: action.cost_cents,
          shipping_cents: action.shipping_cents,
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
      case 'build-team':
        // 流程动作：真正搭建在 groups-chat 挂钩点执行（要发 HTTP 建 agent/群）。
        return { tag: 'build-team', ok: true, detail: '搭建代卖团队（挂钩点执行）' };
      case 'dispatch':
        return { tag: 'dispatch', ok: true, detail: `派活给 ${action.to.join('、')}` };
      default:
        return { tag: 'report', ok: false, error: '未知动作' };
    }
  } catch (err) {
    const msg = err instanceof CraftProfitError ? err.message : (err as Error).message;
    return { tag: (action as { kind: CraftTag }).kind, ok: false, error: msg };
  }
}

/**
 * 解析并落业务动作；返回剥掉标记后的展示文本与 ok 动作清单
 * （build-team/dispatch 由调用方在挂钩点执行）。
 * scoped=false（非代卖作用域）→ 原文原样返回、零副作用。
 */
export function applyCraftMarkers(
  text: string,
  opts: { scoped: boolean },
): { applied: AppliedAction[]; cleaned: string; actions: CraftAction[] } {
  if (!opts.scoped) return { applied: [], cleaned: text, actions: [] };
  const { markers, cleaned } = parseCraftMarkers(text);
  const applied: AppliedAction[] = [];
  const actions: CraftAction[] = [];
  for (const m of markers) {
    if (m.ok && m.action) {
      actions.push(m.action);
      applied.push(applyOne(m.action));
    } else {
      applied.push({ tag: m.tag, ok: false, error: m.error ?? '标记解析失败' });
    }
  }
  return { applied, cleaned, actions };
}

// ── ② 产品资料自动同步记忆库（fail-soft）────────────────────────────────────
//
// 单后端迁移（2026-11-18）：不再硬编码 Python URL。分流与 lib/memory-bank.ts 同
// 规则：single / SF_MEMORY_BANK_MODE=node → 直调本地 memory-bank service；
// =python → 原 HTTP；auto（默认）→ 本地优先、失败回退 HTTP。
// fail-soft 契约不变：记忆库整体不可用 → 返回 null，绝不阻塞聊天链路。

let packCache: string | null = null;

/** 本地实现：listPacks → ensure → ingestText。异常向上抛给 kbFetch 的 fail-soft。 */
async function localEnsureCraftPackId(): Promise<string> {
  const { listPacks, createPack } = await import('../application/memory-bank/service');
  const hit = listPacks().find((p) => p.name === CRAFT_PACK_NAME);
  if (hit?.pack_id) return hit.pack_id;
  const created = createPack(
    CRAFT_PACK_NAME,
    '残障伙伴手工艺品代卖：产品介绍、图片/文档说明、定价与卖点',
  );
  return created.pack_id;
}

async function localIngestText(packId: string, text: string, sourceName: string): Promise<void> {
  const { ingestTextTyped } = await import('../application/memory-bank/service');
  ingestTextTyped(packId, text, { source_name: sourceName, deduplicate: true });
}

/**
 * kbFetch — 本地直调 memory-bank service 的薄适配（ADR-0001：无 HTTP 回退）。
 * 原实现按 SF_MEMORY_BANK_MODE 分流 node/python/auto；python/auto 的 HTTP
 * 分支已随 Python 退役删除，未识别路径 fail-soft 返回 null。
 */
async function kbFetch<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
      if (path === '/api/memory-bank/packs' && (!init?.method || init.method === 'GET')) {
        const { listPacks } = await import('../application/memory-bank/service');
        return { packs: listPacks().map((p) => ({ pack_id: p.pack_id, name: p.name })) } as unknown as T;
      }
      if (path === '/api/memory-bank/packs' && init?.method === 'POST') {
        const body = JSON.parse(String(init.body ?? '{}')) as { name?: string; description?: string };
        const { createPack } = await import('../application/memory-bank/service');
        const manifest = createPack(body.name ?? CRAFT_PACK_NAME, body.description ?? '');
        return { pack_id: manifest.pack_id } as unknown as T;
      }
      const m = /^\/api\/memory-bank\/packs\/([a-f0-9]{32})\/text$/.exec(path);
      if (m && init?.method === 'POST') {
        const body = JSON.parse(String(init.body ?? '{}')) as {
          text?: string;
          source_name?: string;
        };
        localIngestText(m[1], body.text ?? '', body.source_name || '产品资料.txt');
        return {} as T;
      }
      // 未识别的本地路径：抛错走 fail-soft
      throw new Error(`local path not supported: ${path}`);
    } catch {
      return null; // 无 HTTP 回退（ADR-0001）
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
