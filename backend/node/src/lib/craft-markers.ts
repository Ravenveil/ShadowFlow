/**
 * craft-markers.ts — 「手工艺品代卖」agent 输出协议标记解析（纯逻辑，2026-11-07）。
 *
 * 团队 agent 在回复里输出标记行声明业务动作，聊天展示前剥掉标记、把动作
 * 落到产品盈利库（storage/craft-intake.ts 负责副作用，本模块零 IO）：
 *
 *   [intake] {"name":"苗绣杯垫","price":68,"cost":20,"shipping":8}
 *   [post]   {"platform":"小红书","title":"山里来的温柔","text":"…"}
 *     （可选 media：[{name,path,url,is_image}…]，与 craft_posts.images 完全同构、
 *     上限 18；发布时从 post.images 透传随帖落 sp_posts.media。旧标记不带 media
 *     零回归——media 归一为 []）
 *   [link]   {"product":"苗绣杯垫","url":"https://…"}
 *   [order]  {"product":"苗绣杯垫","qty":2}
 *   [ship]   {"product":"苗绣杯垫","qty":2,"tracking":"SF123","receiver":"张三","phone":"13800138000","address":"…"}
 *     （receiver/phone/address 收件信息可选，缺省走快递域演示收件信息）
 *   [report] {"summary":"本周净利 ¥320…"}
 *   [build-team] {} ——搭建代卖团队（幂等；总经理专用）
 *   [dispatch] {"to":"营销专员、订单管家","text":"任务说明"} ——派活给团队
 *     （to 可以是字符串（、/，分隔）或数组；总经理向工作群下发任务用）
 *   [draft] {"title":"标题","body":"正文","topics":["a","b"]} ——小红书博文草稿
 *     （图→博文流水线；可选 product_name/price/cost/shipping/images，金额单位元。
 *     商品字段无依据写「待确认」占位（2026-11-08 防编造：占位词归一为缺省、
 *     确认面显示「待确认」，不废稿；乱写数字/负数仍报错——协议违规要可见）。
 *     只草拟不发布——落 craft_posts(status: draft) 等用户
 *     确认 + 董事长两道审批，执行在 groups-chat 挂钩点走 be-worker REST，与
 *     build-team/dispatch 同款「挂钩点执行」语义）
 *
 * 约定（写进各 agent soul）：
 *   - 标记独占一行（行首，前面只能有空白）；`[craft:xxx]` 是等价别名。
 *   - JSON 载荷紧跟标记，可用花括号配平跨行；金额单位「元」，
 *     也可直接给 `*_cents`（分）。order/ship 的 qty 缺省 1。
 *   - 解析成功的标记行从展示文本里剥掉（协议噪音不进聊天）。
 */
/** 运营动态分类（与 storage/craft-profit 的 AgentEvent.kind 对齐）。 */
export type CraftEventKind = 'marketing' | 'order' | 'shipping';

export type CraftTag = 'intake' | 'post' | 'link' | 'order' | 'ship' | 'report' | 'build-team' | 'dispatch' | 'draft';

/**
 * [post] 随帖媒体项（2026-11-08 media 协议扩展）：与 craft_posts.images 项
 * 完全同构 {name,path,url,is_image}，上限 18。发布时从 post.images 直接透传，
 * 经 syncSocialPost 落 sp_posts.media（正文截 500 字口径不变）。
 */
export interface CraftMediaItem {
  name: string;
  path: string;
  url: string;
  is_image: boolean;
}

export type CraftAction =
  | {
      kind: 'intake';
      name: string;
      price_cents: number;
      cost_cents: number;
      shipping_cents: number;
    }
  | {
      kind: 'post';
      platform: string;
      title: string;
      text: string;
      /** 随帖媒体（可选，缺省 []）：craft_posts.images 同构项，上限 18。 */
      media: CraftMediaItem[];
    }
  | { kind: 'link'; product: string; url: string; platform: string }
  | { kind: 'order'; product: string; qty: number }
  | {
      kind: 'ship';
      product: string;
      qty: number;
      tracking: string;
      /** 收件信息（可选；缺省由快递域用演示收件信息兜底）。 */
      receiver_name: string;
      receiver_phone: string;
      receiver_address: string;
    }
  | { kind: 'report'; summary: string }
  /** 搭建代卖团队（幂等）——执行在 groups-chat 挂钩点（要发 HTTP）。 */
  | { kind: 'build-team' }
  /** 向工作群派活：to 成员名列表（转 @提及）、text 任务说明。 */
  | { kind: 'dispatch'; to: string[]; text: string }
  /**
   * 小红书博文草稿（图→博文流水线，2026-11-08）：只草拟不发布。
   * 落 craft_posts(status:draft) 等用户确认 + 两道审批（品牌定稿/对外发布），
   * 执行在 groups-chat 挂钩点（要走 be-worker REST）。
   */
  | {
      kind: 'draft';
      title: string;
      body: string;
      topics: string[];
      /** 可选：草稿带的商品建议（落商品时用，缺省 0/空）。 */
      product_name: string;
      price_cents: number;
      cost_cents: number;
      shipping_cents: number;
      /** 可选：图片绝对路径（缺省取本轮用户随行附件）。 */
      images: string[];
    };

/** 标记 → 运营动态分类（post/link 都算营销；build-team/dispatch 是流程动作）。 */
export const TAG_EVENT_KIND: Record<CraftTag, CraftEventKind | null> = {
  intake: null,
  post: 'marketing',
  link: 'marketing',
  order: 'order',
  ship: 'shipping',
  report: null,
  'build-team': null,
  dispatch: null,
  draft: null,
};

export interface ParsedMarker {
  tag: CraftTag;
  /** false = 标记形态合法但载荷字段不合法（apply 阶段记失败动态，可见不静默）。 */
  ok: boolean;
  action?: CraftAction;
  error?: string;
  raw: string;
}

export interface CraftParseResult {
  markers: ParsedMarker[];
  /** ok 的动作（apply 直接消费）。 */
  actions: CraftAction[];
  /** 剥掉已识别标记行后的展示文本。 */
  cleaned: string;
}

const TAG_RE = /\[(?:craft:)?(intake|post|link|order|ship|report|build-team|dispatch|draft)\]/gi;

/** 「元」→「分」；直接给 *_cents 时原样取整。非法（负/NaN）返回 null。 */
function money(obj: Record<string, unknown>, key: string): number | null {
  const centsRaw = obj[`${key}_cents`];
  if (centsRaw !== undefined) {
    const n = Number(centsRaw);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
  }
  const raw = obj[key];
  if (raw === undefined) return 0; // 未给默认 0（成本分项可缺省）
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function qtyOf(v: unknown): number | null {
  const n = v === undefined ? 1 : Number(v);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.min(999, Math.round(n));
}

/** basename：路径/URL 取末段做缺省 name。 */
function baseName(p: string): string {
  return p.split(/[\\/]/).pop() ?? p;
}

/**
 * media 项归一（[post] 随帖媒体，craft_posts.images 同构，上限 18）：
 *   - 对象项 {name?,path?,url?,is_image?} → 四字段归一（is_image 缺省 true）；
 *   - 字符串项按路径简写（name 取 basename）；
 *   - path/url 皆空或类型不合法的项跳过（fail-soft，不让整条标记失败）。
 */
function mediaList(v: unknown): CraftMediaItem[] {
  if (!Array.isArray(v)) return [];
  const out: CraftMediaItem[] = [];
  for (const m of v) {
    if (out.length >= 18) break;
    if (typeof m === 'string') {
      const p = m.trim();
      if (!p) continue;
      out.push({ name: baseName(p), path: p, url: '', is_image: true });
      continue;
    }
    if (m && typeof m === 'object' && !Array.isArray(m)) {
      const o = m as Record<string, unknown>;
      const p = str(o.path).slice(0, 2048);
      const u = str(o.url).slice(0, 2048);
      if (!p && !u) continue;
      out.push({
        name: str(o.name).slice(0, 200) || baseName(p) || u,
        path: p,
        url: u,
        is_image: typeof o.is_image === 'boolean' ? o.is_image : true,
      });
    }
  }
  return out;
}

/** [draft] 商品字段占位词：模型显式声明「无依据」→ 归一为缺省（确认面「待确认」）。 */
const DRAFT_PLACEHOLDER_RE =
  /^(?:待确认|待定|未知|不详|暂无|无|没有|n\/?a|unknown|tbd|\?+|—+|-+)$/i;

/**
 * [draft] 金额解析（2026-11-08 防编造）：**占位词**（「待确认/未知…」= 模型
 * 显式声明无依据）→ 0（缺省 = 确认面「待确认」，不废稿）；其余口径与 money()
 * 一致（非法数字/负数/乱写字符串仍报错——协议违规要可见，不静默吞）。
 * intake 等登记类标记维持严格口径不变。
 */
function draftMoney(obj: Record<string, unknown>, key: string): number | null {
  const raw = obj[`${key}_cents`] !== undefined ? obj[`${key}_cents`] : obj[key];
  if (typeof raw === 'string' && DRAFT_PLACEHOLDER_RE.test(raw.trim())) return 0;
  return money(obj, key);
}

/** 标记 + 载荷对象 → 归一化动作；字段不合法返回错误串。 */
function buildAction(tag: CraftTag, obj: Record<string, unknown>): CraftAction | string {
  switch (tag) {
    case 'intake': {
      const name = str(obj.name);
      if (!name) return 'intake 缺 name';
      const price = money(obj, 'price');
      // 成本：新格式 cost；旧格式 artisan 兜底（2026-11-07 口径切换前的
      // 存量消息/旧 soul：给手艺人 → 成本，营销分摊整项删除）。
      const hasCost = obj.cost !== undefined || obj.cost_cents !== undefined;
      const cost = hasCost ? money(obj, 'cost') : money(obj, 'artisan');
      const shipping = money(obj, 'shipping');
      if (price === null || cost === null || shipping === null) {
        return 'intake 金额非法（单位元，或用 *_cents）';
      }
      return {
        kind: 'intake',
        name: name.slice(0, 200),
        price_cents: price,
        cost_cents: cost,
        shipping_cents: shipping,
      };
    }
    case 'post':
      return {
        kind: 'post',
        platform: str(obj.platform).slice(0, 60) || '社交媒体',
        title: str(obj.title).slice(0, 200),
        text: str(obj.text).slice(0, 500),
        media: mediaList(obj.media),
      };
    case 'link': {
      const product = str(obj.product);
      const url = str(obj.url);
      if (!product && !url) return 'link 缺 product/url';
      return {
        kind: 'link',
        product: product.slice(0, 200),
        url: url.slice(0, 500),
        platform: str(obj.platform).slice(0, 60) || '小红书',
      };
    }
    case 'order': {
      const product = str(obj.product);
      if (!product) return 'order 缺 product';
      const qty = qtyOf(obj.qty);
      if (qty === null) return 'order qty 非法（1-999 整数）';
      return { kind: 'order', product: product.slice(0, 200), qty };
    }
    case 'ship': {
      const product = str(obj.product);
      if (!product) return 'ship 缺 product';
      const qty = qtyOf(obj.qty);
      if (qty === null) return 'ship qty 非法（1-999 整数）';
      return {
        kind: 'ship',
        product: product.slice(0, 200),
        qty,
        tracking: str(obj.tracking).slice(0, 100),
        // 收件信息可选：receiver/receiver_name 二选一，phone/address 同名。
        receiver_name: str(obj.receiver ?? obj.receiver_name).slice(0, 64),
        receiver_phone: str(obj.phone ?? obj.receiver_phone).slice(0, 32),
        receiver_address: str(obj.address ?? obj.receiver_address).slice(0, 512),
      };
    }
    case 'report':
      return { kind: 'report', summary: str(obj.summary).slice(0, 2000) };
    case 'build-team':
      return { kind: 'build-team' };
    case 'dispatch': {
      // to：字符串（、/，/; 分隔）或数组；text 是任务说明。
      const rawTo = obj.to;
      let names: string[] = [];
      if (Array.isArray(rawTo)) names = rawTo.map((v) => str(v));
      else if (typeof rawTo === 'string') {
        names = rawTo.split(/[、，,;；/]+/).map((s) => s.trim());
      }
      names = names.filter(Boolean).map((n) => n.replace(/^@/, '').slice(0, 40));
      if (names.length === 0) return 'dispatch 缺 to（成员名，、分隔或数组）';
      const text = str(obj.text);
      if (!text) return 'dispatch 缺 text（任务说明）';
      return { kind: 'dispatch', to: names.slice(0, 20), text: text.slice(0, 2000) };
    }
    case 'draft': {
      const title = str(obj.title);
      const body = str(obj.body);
      if (!title && !body) return 'draft 缺 title/body';
      let topics: string[] = [];
      if (Array.isArray(obj.topics)) {
        topics = obj.topics
          .map((v) => str(v).replace(/^#+/, ''))
          .filter(Boolean)
          .slice(0, 12)
          .map((t) => t.slice(0, 60));
      }
      const price = draftMoney(obj, 'price');
      const cost = draftMoney(obj, 'cost');
      const shipping = draftMoney(obj, 'shipping');
      if (price === null || cost === null || shipping === null) {
        return 'draft 金额非法（单位元，或用 *_cents）';
      }
      const images = Array.isArray(obj.images)
        ? obj.images.map((v) => str(v)).filter(Boolean).slice(0, 9)
        : [];
      // 商品名占位词（「待确认」…）→ 归一为空（落商品名回退博文标题）。
      const rawName = str(obj.product_name ?? obj.product);
      return {
        kind: 'draft',
        title: title.slice(0, 200),
        body: body.slice(0, 2000),
        topics,
        product_name: DRAFT_PLACEHOLDER_RE.test(rawName) ? '' : rawName.slice(0, 200),
        price_cents: price,
        cost_cents: cost,
        shipping_cents: shipping,
        images,
      };
    }
    default:
      return `未知标记 ${String(tag)}`;
  }
}

/**
 * 从 from 起找第一个 `{` 的配平闭合（跳过字符串/转义）。
 * 返回闭合 `}` 的下标；无配平返回 -1。
 */
function matchBrace(s: string, from: number): number {
  const open = s.indexOf('{', from);
  if (open < 0) return -1;
  let depth = 0;
  let inStr = false;
  for (let i = open; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (ch === '\\') i++;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * 解析全文里的业务标记。
 *
 * 已识别标记（含字段非法的）从 cleaned 剥掉；找不到配平 JSON 的行不算标记
 * （`[order] 是个英文词` 这类正文原样保留）。空白行归一：3+ 连续换行 → 2。
 */
export function parseCraftMarkers(text: string): CraftParseResult {
  const markers: ParsedMarker[] = [];
  const actions: CraftAction[] = [];
  const removals: Array<[number, number]> = [];

  TAG_RE.lastIndex = 0;
  for (let m = TAG_RE.exec(text); m; m = TAG_RE.exec(text)) {
    const tagStart = m.index;
    const tag = m[1].toLowerCase() as CraftTag;
    // 行首锚定：标记前只能有空白（防止正文中间的 [order] 被误伤）。
    const lineStart = text.lastIndexOf('\n', tagStart - 1) + 1;
    if (text.slice(lineStart, tagStart).trim() !== '') continue;
    const payloadFrom = tagStart + m[0].length;
    const close = matchBrace(text, payloadFrom);
    if (close < 0) continue; // 没有配平 JSON → 当正文，不动
    const raw = text.slice(text.indexOf('{', payloadFrom), close + 1);

    let marker: ParsedMarker;
    try {
      const obj = JSON.parse(raw) as unknown;
      if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
        marker = { tag, ok: false, error: '载荷必须是 JSON 对象', raw };
      } else {
        const built = buildAction(tag, obj as Record<string, unknown>);
        if (typeof built === 'string') marker = { tag, ok: false, error: built, raw };
        else {
          marker = { tag, ok: true, action: built, raw };
          actions.push(built);
        }
      }
    } catch (e) {
      marker = { tag, ok: false, error: `载荷 JSON 解析失败：${(e as Error).message}`, raw };
    }
    markers.push(marker);
    // 整段（行首 → JSON 闭合）剥掉；同行闭合后只剩空白则连换行一起剥。
    let removeEnd = close + 1;
    const nl = text.indexOf('\n', removeEnd);
    const lineRemainder = text.slice(removeEnd, nl < 0 ? text.length : nl);
    if (lineRemainder.trim() === '') removeEnd = nl < 0 ? text.length : nl + 1;
    removals.push([lineStart, removeEnd]);
    TAG_RE.lastIndex = removeEnd;
  }

  let cleaned = '';
  let cursor = 0;
  for (const [start, end] of removals) {
    cleaned += text.slice(cursor, start);
    cursor = end;
  }
  cleaned += text.slice(cursor);
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();

  return { markers, actions, cleaned };
}
