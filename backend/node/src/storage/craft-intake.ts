/**
 * craft-intake.ts — 「手工艺品代卖」业务落库胶水（2026-11-07）。
 *
 * 两件事：
 *   ① applyCraftMarkers —— 把 agent 输出协议标记（lib/craft-markers 解析）
 *      落到产品盈利库：[intake] 上架商品、[order] 记销售、[post]/[link] 营销
 *      动态、[ship] 快递动态、[report] 盈利汇报（只剥标记）；[build-team]/
 *      [dispatch] 是流程动作（建团队/向工作群派活），[draft] 是博文草稿流程
 *      动作（图→博文流水线），本层只剥标记并把动作透传给调用方（groups-chat
 *      挂钩点执行）。作用域（isCraftGroup）：
 *      代卖团队绑的群 + 「总经理」的 DM（主控对话，团队未建时 [build-team]
 *      也要生效），其他群 agent 引用协议标记不剥不落库。
 *   ② ingestProductMaterial —— 用户发来的产品资料（文字介绍/图片/文档文本）
 *      自动同步到记忆库「手工艺品资料」pack（PYTHON /api/memory-bank），
 *      并把 pack id 交给 knowledgeBlock 检索注入（groups-chat 挂钩点调用）。
 *
 * 全程 fail-soft：记忆库不可达只丢同步不阻塞聊天；单条标记落库失败记入
 * applied 结果（可见），不抛。
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  CraftProfitError,
  createProduct,
  createSale,
  findPendingSale,
  insertAgentEvent,
  listProducts,
  markSaleShipped,
} from './craft-profit';
import {
  createAccount,
  createPost,
  listAccounts,
  publishPost,
} from './social-publish';
import { createShipment, shipShipment } from './ops-shipping';
import { PLATFORMS } from '../lib/social-platforms';
import { CARRIERS } from '../lib/shipping';
import { getSetting } from './settings';
import { parseCraftMarkers, type CraftAction, type CraftMediaItem, type CraftTag } from '../lib/craft-markers';
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

// ── ①a 子系统同步：社媒发布域（发帖/上链接）+ 快递域（寄出）────────────────

/** 平台自由文本（"小红书"/"xiaohongshu"）→ 平台规格 id；认不出回落小红书。 */
function normalizePlatform(raw: string): string {
  const t = raw.trim();
  const hit = PLATFORMS.find((p) => p.id === t.toLowerCase() || p.name === t);
  return hit ? hit.id : 'xiaohongshu';
}

/** 发布账号选择：优先 real 账号（真实发布），否则复用/创建 mock 演示账号（幂等）。 */
function ensureSocialAccount(platformId: string): string {
  const accounts = listAccounts().filter((a) => a.platform === platformId);
  const real = accounts.find((a) => a.auth_mode === 'real');
  if (real) return real.id;
  const existing = accounts.find((a) => a.auth_mode === 'mock');
  if (existing) return existing.id;
  const spec = PLATFORMS.find((p) => p.id === platformId);
  return createAccount({
    platform: platformId,
    account_name: `代卖演示·${spec?.name ?? platformId}`,
    auth_mode: 'mock',
  }).id;
}

/** 标题/正文按平台上限截断（createPost 超限会抛）。 */
function fitPost(platformId: string, title: string, content: string): { title: string; content: string } {
  const spec = PLATFORMS.find((p) => p.id === platformId);
  let t = title;
  let c = content;
  if (spec) {
    if (spec.title_max > 0 && t.length > spec.title_max) t = t.slice(0, spec.title_max);
    if (c.length > spec.content_max) c = c.slice(0, spec.content_max);
  }
  return { title: t, content: c };
}

/**
 * 帖子落社媒发布域并 mock 发布（fail-soft：失败只降级为「已建未发」，不抛，
 * 不影响聊天与盈利库主链路）。返回发布状态描述（进运营动态）。
 * media（craft_posts.images 同构项，[post] 标记可选载荷）直接透传落
 * sp_posts.media——旧标记不带 media 时行为不变（sp_posts.media 仍 '[]'）。
 */
async function syncSocialPost(input: {
  platform: string;
  title: string;
  content: string;
  productId?: string;
  media?: CraftMediaItem[];
}): Promise<string> {
  const platformId = normalizePlatform(input.platform);
  const accountId = ensureSocialAccount(platformId);
  const fitted = fitPost(platformId, input.title, input.content || input.title);
  const post = createPost({
    account_id: accountId,
    title: fitted.title,
    content: fitted.content,
    ...(input.media?.length ? { media: input.media } : {}),
    ...(input.productId ? { product_id: input.productId } : {}),
  });
  try {
    const { receipt } = await publishPost(post.id);
    const rid = (receipt as { external_id?: string | null }).external_id;
    return rid ? `社媒已发布（回执 ${rid}）` : '社媒已发布';
  } catch (e) {
    return `社媒帖子已建（发布失败：${(e as Error).message}）`;
  }
}

/** 运单号前缀 → 承运商 id；认不出回落顺丰。 */
function carrierFromTracking(tracking: string): string {
  const t = tracking.trim().toUpperCase();
  const hit = CARRIERS.find((c) => t.startsWith(c.tracking_prefix));
  return hit ? hit.id : 'sf';
}

/** 演示收件信息兜底（标记未带收件信息时用；真实订单由买家下单信息提供）。 */
const DEMO_RECEIVER = {
  name: '演示买家',
  phone: '13800000000',
  address: '演示收件地址（买家下单时提供）',
};

/**
 * 寄出 → 快递域发运记录（mock 承运商取面单号）+ 订单状态「已发货」回填运单。
 * 返回实发运单号；快递域失败不阻断盈利库记账（fail-soft）。
 */
async function syncShip(action: Extract<CraftAction, { kind: 'ship' }>): Promise<string> {
  const p = findProduct(action.product);
  const sale = p ? findPendingSale(p.id) : null;
  let tracking = action.tracking;
  const carrierId = action.tracking ? carrierFromTracking(action.tracking) : 'sf';
  try {
    const shipment = createShipment({
      ...(sale ? { order_id: sale.id } : {}),
      carrier: carrierId,
      receiver_name: action.receiver_name || DEMO_RECEIVER.name,
      receiver_phone: action.receiver_phone || DEMO_RECEIVER.phone,
      receiver_address: action.receiver_address || DEMO_RECEIVER.address,
      weight_grams: 500 * action.qty,
      remark: `代卖寄出「${action.product}」×${action.qty}`,
      mode: 'mock',
    });
    const { receipt, shipment: shipped } = await shipShipment(shipment.id);
    const gen =
      (receipt as { tracking_no?: string | null }).tracking_no ?? shipped.tracking_no ?? '';
    if (!tracking && gen) tracking = gen;
  } catch {
    /* 快递域不可用/重复运单 → 只影响快递域记录，不影响订单状态 */
  }
  if (sale) {
    try {
      markSaleShipped(sale.id, tracking);
    } catch {
      /* 订单已删等 → 快递记录仍在 */
    }
  }
  return tracking;
}

async function applyOne(action: CraftAction): Promise<AppliedAction> {
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
        // 同步社媒发布域（帖子 + 发布回执；media 随帖透传），失败降级不改营销动态。
        const socialNote = await syncSocialPost({
          platform: action.platform,
          title: action.title || action.text.slice(0, 20) || '好物推荐',
          content: action.text || action.title,
          media: action.media,
        });
        return { tag: 'post', ok: true, detail: `${detail}（${socialNote}）` };
      }
      case 'link': {
        const detail = `上商品链接${action.product ? `「${action.product}」` : ''} ${action.url}`.trim();
        insertAgentEvent('marketing', detail);
        const p = action.product ? findProduct(action.product) : null;
        const socialNote = await syncSocialPost({
          platform: action.platform,
          title: action.product ? `${action.product} 购买链接` : '商品购买链接',
          content: `${action.product || '商品'} 购买链接：${action.url}`,
          ...(p ? { productId: p.id } : {}),
        });
        return { tag: 'link', ok: true, detail: `${detail}（${socialNote}）` };
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
        const tracking = await syncShip(action);
        const detail =
          `已联系快递员上门取件，寄出「${action.product}」×${action.qty}` +
          (tracking ? `（运单 ${tracking}）` : '');
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
      case 'draft':
        // 流程动作：博文草稿落 craft_posts + 确认/审批流水线在 groups-chat
        // 挂钩点执行（走 be-worker REST），此处只剥标记（与 build-team/dispatch
        // 同款「挂钩点执行」语义）。
        return { tag: 'draft', ok: true, detail: `博文草稿《${action.title || '未命名'}》（挂钩点执行）` };
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
 * 异步：[post]/[link]/[ship] 要同步社媒/快递域（mock 发布、取面单号）。
 */
export async function applyCraftMarkers(
  text: string,
  opts: { scoped: boolean },
): Promise<{ applied: AppliedAction[]; cleaned: string; actions: CraftAction[] }> {
  if (!opts.scoped) return { applied: [], cleaned: text, actions: [] };
  const { markers, cleaned } = parseCraftMarkers(text);
  const applied: AppliedAction[] = [];
  const actions: CraftAction[] = [];
  for (const m of markers) {
    if (m.ok && m.action) {
      actions.push(m.action);
      applied.push(await applyOne(m.action));
    } else {
      applied.push({ tag: m.tag, ok: false, error: m.error ?? '标记解析失败' });
    }
  }
  return { applied, cleaned, actions };
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

/**
 * 用户随行附件（图片/产品文档）→ 记忆库「手工艺品资料」pack。走多模态记忆库
 * /files 端点（自带 docx/pdf/xlsx/图片 解析），逐文件 fail-soft。返回 pack id
 * （全部失败/无附件则 null）。
 */
export async function ingestProductAttachments(
  attachments: Array<{ name?: string; path?: string }> | undefined,
): Promise<string | null> {
  const list = (attachments ?? [])
    .filter((a): a is { name?: string; path: string } => typeof a?.path === 'string' && !!a.path)
    .slice(0, 9);
  if (list.length === 0) return null;
  const packId = await ensureCraftPack();
  if (!packId) return null;
  let okAny = false;
  for (const a of list) {
    try {
      const buf = await fs.promises.readFile(a.path);
      const form = new FormData();
      form.append('upload', new Blob([buf]), a.name || path.basename(a.path));
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), KB_TIMEOUT_MS * 4);
      const res = await fetch(
        `${PYTHON_BACKEND_URL}/api/memory-bank/packs/${encodeURIComponent(packId)}/files`,
        { method: 'POST', body: form, signal: controller.signal },
      );
      clearTimeout(timer);
      if (res.ok) okAny = true;
    } catch {
      /* 单文件失败（读不到/记忆库不可达）不阻断聊天主链路 */
    }
  }
  return okAny ? packId : null;
}
