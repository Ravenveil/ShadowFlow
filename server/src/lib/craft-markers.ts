/**
 * craft-markers.ts — 「手工艺品代卖」agent 输出协议标记解析（纯逻辑，2026-11-07）。
 *
 * 团队 agent 在回复里输出标记行声明业务动作，聊天展示前剥掉标记、把动作
 * 落到产品盈利库（storage/craft-intake.ts 负责副作用，本模块零 IO）：
 *
 *   [intake] {"name":"苗绣杯垫","price":68,"artisan":30,"shipping":8,"marketing":5}
 *   [post]   {"platform":"小红书","title":"山里来的温柔","text":"…"}
 *   [link]   {"product":"苗绣杯垫","url":"https://…"}
 *   [order]  {"product":"苗绣杯垫","qty":2}
 *   [ship]   {"product":"苗绣杯垫","qty":2,"tracking":"SF123"}
 *   [report] {"summary":"本周净利 ¥320…"}
 *
 * 约定（写进各 agent soul）：
 *   - 标记独占一行（行首，前面只能有空白）；`[craft:xxx]` 是等价别名。
 *   - JSON 载荷紧跟标记，可用花括号配平跨行；金额单位「元」，
 *     也可直接给 `*_cents`（分）。order/ship 的 qty 缺省 1。
 *   - 解析成功的标记行从展示文本里剥掉（协议噪音不进聊天）。
 */
/** 运营动态分类（与 storage/craft-profit 的 AgentEvent.kind 对齐）。 */
export type CraftEventKind = 'marketing' | 'order' | 'shipping';

export type CraftTag = 'intake' | 'post' | 'link' | 'order' | 'ship' | 'report';

export type CraftAction =
  | {
      kind: 'intake';
      name: string;
      price_cents: number;
      artisan_cents: number;
      shipping_cents: number;
      marketing_cents: number;
    }
  | { kind: 'post'; platform: string; title: string; text: string }
  | { kind: 'link'; product: string; url: string }
  | { kind: 'order'; product: string; qty: number }
  | { kind: 'ship'; product: string; qty: number; tracking: string }
  | { kind: 'report'; summary: string };

/** 标记 → 运营动态分类（post/link 都算营销）。 */
export const TAG_EVENT_KIND: Record<CraftTag, CraftEventKind | null> = {
  intake: null,
  post: 'marketing',
  link: 'marketing',
  order: 'order',
  ship: 'shipping',
  report: null,
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

const TAG_RE = /\[(?:craft:)?(intake|post|link|order|ship|report)\]/gi;

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

/** 标记 + 载荷对象 → 归一化动作；字段不合法返回错误串。 */
function buildAction(tag: CraftTag, obj: Record<string, unknown>): CraftAction | string {
  switch (tag) {
    case 'intake': {
      const name = str(obj.name);
      if (!name) return 'intake 缺 name';
      const price = money(obj, 'price');
      const artisan = money(obj, 'artisan');
      const shipping = money(obj, 'shipping');
      const marketing = money(obj, 'marketing');
      if (price === null || artisan === null || shipping === null || marketing === null) {
        return 'intake 金额非法（单位元，或用 *_cents）';
      }
      return {
        kind: 'intake',
        name: name.slice(0, 200),
        price_cents: price,
        artisan_cents: artisan,
        shipping_cents: shipping,
        marketing_cents: marketing,
      };
    }
    case 'post':
      return {
        kind: 'post',
        platform: str(obj.platform).slice(0, 60) || '社交媒体',
        title: str(obj.title).slice(0, 200),
        text: str(obj.text).slice(0, 500),
      };
    case 'link': {
      const product = str(obj.product);
      const url = str(obj.url);
      if (!product && !url) return 'link 缺 product/url';
      return { kind: 'link', product: product.slice(0, 200), url: url.slice(0, 500) };
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
      };
    }
    case 'report':
      return { kind: 'report', summary: str(obj.summary).slice(0, 2000) };
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
