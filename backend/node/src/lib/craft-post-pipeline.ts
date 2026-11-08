/**
 * craft-post-pipeline.ts — 图片→小红书博文→商品 流水线编排（2026-11-08）。
 *
 * 产品裁决（锁定）：聊天里发图片 → AI 依据图片草拟小红书博文（标题/正文/
 * 话题标签）→ **用户确认**（AI 草拟 + 人确认，不自动定稿）→ 走现有审批门
 * （品牌定稿/对外发布两道，复用 DAG approve 边的 pendingApprovals 机制，
 * 不新造审批体系）→ 审批通过**自动发布**（PATCH craft_posts → published，
 * [post] 社媒标记由数据面同步落）→ 落成商品进 craft-profit 盈利库
 * （POST /api/craft-products，source_post_id 关联博文）。
 *
 * 状态机（每群一活套；持久状态在 craft_posts.status）：
 *   [draft] 标记（内容策划师输出）→ POST /api/craft-posts(status:draft)
 *     → awaiting_confirm（草稿待确认，回给用户）
 *   用户「确认」→ PATCH status:confirmed → gate_brand（品牌定稿·pendingApprovals）
 *     → gate_publish（对外发布·pendingApprovals）→ publishing
 *     → 落商品 POST /api/craft-products(source_post_id) → 回挂 product_id
 *     → PATCH status:published（[post] 同步落）。
 *   ★ 发布序列必须「商品/回挂在前、published 在后」：发布后内容冻结（FROZEN），
 *     product_id 挂接放 published 之后会被 422 拒。落商品失败 → 不发布
 *     （停在 confirmed 可重试），保证「自动发布 + 落商品」双目标不缺角。
 *   拒绝/被打断 → 记录停在 confirmed（数据面禁 confirmed→draft 回退），
 *   回复「确认」可重新进入审批门（confirmed→confirmed 幂等，商品不重复建）。
 *
 * 依赖全部注入（registerApproval/cancelApproval/decide/notice/api/gateNodeIds）：
 *   - 审批注册与决定解析复用 groups-chat 的 pendingApprovals + parseApprovalDecision
 *     （单一真源，防双实现漂移）；POST /api/groups/:id/approvals/:nodeId 与会话
 *     短语决定两条既有决定路径对流水线审批门天然生效；
 *   - 数据面走 be-worker 的 REST 契约（/api/craft-posts、/api/craft-products），
 *     进程内调用注入实现、测试注入假实现。
 *
 * 纯函数（isPostDraftRequest/buildDraftPrompt/convertPostMarkersToDraft/
 * toPostImages）零 IO 可单测；编排器（createCraftPostPipeline）只依赖注入面。
 */
import type { CraftAction } from './craft-markers';
import type { UserAttachment } from './contracts';

// ── 类型 ─────────────────────────────────────────────────────────────────────

/** [draft] 草稿动作（craft-markers 解析产物）即流水线草稿输入。 */
export type CraftPostDraft = Extract<CraftAction, { kind: 'draft' }>;

export type ApprovalVerdict = 'approved' | 'rejected';

/** craft_posts.images 项（be-worker 契约：{name,path,url,is_image}）。 */
export interface CraftPostApiImage {
  name: string;
  path: string;
  url: string;
  is_image: boolean;
}

/** be-worker 数据面 REST 契约面（失败一律返回 null，fail-soft 可见播报）。 */
export interface CraftPostApi {
  /** POST /api/craft-posts（status:draft）。 */
  createPost(input: {
    title: string;
    body: string;
    topics: string[];
    images: CraftPostApiImage[];
  }): Promise<{ post_id: string } | null>;
  /** PATCH /api/craft-posts/:id（状态迁移 / 回挂 product_id）。 */
  patchPost(
    id: string,
    patch: { status?: 'confirmed' | 'published'; product_id?: string },
  ): Promise<unknown | null>;
  /** POST /api/craft-products（source_post_id 关联博文）。 */
  createProduct(input: {
    name: string;
    price_cents: number;
    cost_cents: number;
    shipping_cents: number;
    image_url: string;
    source_post_id: string;
  }): Promise<{ product_id: string } | null>;
  /**
   * GET /api/craft-products —— 商品「先查后建」幂等依据（POST 无幂等键）：
   * 响应丢失但服务端已落库时，按 source_post_id 复用既有商品，不重复建。
   */
  listProducts(): Promise<Array<{ product_id: string; source_post_id: string | null }> | null>;
}

export interface CraftPostPipelineDeps {
  /**
   * 注册一次审批挂起（groups-chat registerPendingApproval 同源）。
   * meta（2026-11-09）：审批门名/预览供审批卡可见化，缺省回落 nodeId。
   */
  registerApproval(
    groupId: string,
    nodeId: string,
    meta?: { nodeName?: string; preview?: string },
  ): Promise<ApprovalVerdict>;
  /** 取消一次挂起审批（新草稿顶替旧流水线时收场；可选注入）。 */
  cancelApproval?(groupId: string, nodeId: string): void;
  /** 会话短文本决定解析（groups-chat parseApprovalDecision 同源）。 */
  decide(text: string): ApprovalVerdict | null;
  /** 群系统消息播报（调用方保证 fail-soft）。 */
  notice(groupId: string, content: string): Promise<unknown> | unknown;
  /** 数据面 REST。 */
  api: CraftPostApi;
  /** 审批门节点 id（DAG approve 边目标节点：品牌定稿=内容策划师、对外发布=运营专员）。 */
  gateNodeIds(): { brand: string; publish: string };
}

export type PostPipelinePhase =
  | 'awaiting_confirm'
  | 'gate_brand'
  | 'gate_publish'
  | 'publishing';

/** 每群一份的流水线活套（测试可检视）。 */
export interface PostPipelineState {
  phase: PostPipelinePhase;
  postId: string;
  title: string;
  productName: string;
  priceCents: number;
  costCents: number;
  shippingCents: number;
  images: CraftPostApiImage[];
  /** 已落商品 id（发布序列幂等：建过就不再建，重试只回挂/发布）。 */
  productId: string;
  brandNodeId: string;
  publishNodeId: string;
}

// ── 纯函数：触发判定与草拟工单 ───────────────────────────────────────────────

/** 裸草拟/起草词（本身无歧义：任何上下文都是要草稿）。 */
const BARE_DRAFT_RE = /草拟|起草/;

/**
 * 动作 + 载体（写/发/做… + 小红书/博文/笔记/文案…）。
 * 动词与名词之间只放量词/方位等填充字（6 个以内）——防止「分析出小红书的
 * 机会」「来分析下小红书竞品」这类分析请求被误判成草拟请求。
 */
const DRAFT_VERB_NOUN_RE =
  /(写|草拟|起草|拟|生成|做|来|发|配)[\s的一十两几多到在去进成篇条个张段句]{0,6}(小红书|种草文|种草笔记|博文|笔记|文案|推文|帖子|带货文|图文|软文)/;

/**
 * 图→博文流水线触发判定（纯函数）：消息是「草拟/写一篇小红书博文」类请求
 * → true（图片附件非必需——有图带图，无图纯文案草拟也走同一确认/审批流）。
 */
export function isPostDraftRequest(text: string): boolean {
  const t = (text ?? '').trim();
  if (!t) return false;
  return BARE_DRAFT_RE.test(t) || DRAFT_VERB_NOUN_RE.test(t);
}

/**
 * 内容策划师的草拟工单（自包含 prompt）：结构化 [draft] 输出 + 「只草拟不
 * 发布」纪律（防 soul 里「产出可发布贴文时输出 [post]」把未确认草稿直接
 * 发出去）+ **真实性硬规则**（2026-11-08 防编造：修"盲写"第二道防线——即便
 * 视觉注入失败/模型无图，也绝不允许编造画面与商品交易字段）。附件引用块由
 * runFanout 的 goalWithAttachments 统一追加。
 */
export function buildDraftPrompt(userText: string): string {
  return `【图→小红书博文·草拟任务】
请结合随行图片与下面的需求，草拟一篇小红书博文：
${userText.trim()}

【真实性硬规则】（优先级高于一切文风要求，违反即废稿）：
- 只描述图片中真实可见的内容（颜色、形状、文字、构图）；看不清、看不到的细节一律不写，禁止用「干花/花环/手工艺品/松果」之类套话脑补画面。
- 如果无法读取图片内容（图片未随消息送达、读取失败、被拒收或本轮根本无图），必须在回复开头和 [draft] 的 body 里明说「无法读取图片内容」，只依据上面的文字需求草拟，不得虚构任何视觉细节。
- 商品交易字段（product_name/price/cost/shipping）严禁凭空编造：只有图片或用户需求里有明确依据时才给真实值；没有依据就写「待确认」或省略该字段。绝不臆造价格/成本/运费数字（例如图片里没写价格就不许填 price）。
- 知识库参考只用于措辞与话题建议，不是商品事实来源；与图片/需求无关的商品信息（名称、价格等）不得写入草稿。

输出要求：
0) 【协议行硬规则】无论历史消息里出现过什么展示格式（表格、预览块等都只是渲染层），你的最终回复必须以独占一行的 [draft] {…} 标记收尾——这是机器解析协议行，缺了它草稿不会落库、用户看不到确认面。禁止用纯展示格式（标题/正文/商品字段表格）替代协议行。
1) 用 [draft] 标记声明结构化草稿（独占一行，JSON 紧凑单行）：
[draft] {"title":"标题","body":"正文","topics":["话题1","话题2"],"product_name":"商品名或待确认","price":68,"cost":20,"shipping":8}
   - title：小红书风格标题（可用 emoji）；body：正文（分段、可带 emoji）；topics：3-8 个话题标签（不带 # 号）；
   - product_name/price/cost/shipping：图片/需求有依据才给真实值（单位：元）；无依据写「待确认」或省略，禁止猜数。
2) 本次只草拟、不发布：除 [draft] 外禁止输出 [post] 等业务登记标记——用户确认并经董事长两道审批后系统才会自动发布。
3) 在回复正文里用可读排版同步展示：标题、正文、话题，以及商品字段（名称/售价/成本/运费，缺依据的标「待确认」）——供用户预览确认。`;
}

// ── 确认面商品字段（2026-11-08 确认面补商品字段 + 就地修正）──────────────────

/** 待确认占位显示（价格 0 / 名称空 = 没有依据，不猜）。 */
const TBC = '待确认';

function fmtMoney(cents: number): string {
  return cents > 0 ? `¥${(cents / 100).toFixed(2)}` : TBC;
}

/**
 * 商品字段确认块（handleDraft 播报 + 修正后重播报共用）：名称/售价/成本/运费
 * 显式列入用户可见确认内容，缺依据显示「待确认」——用户确认时能看到并可修正。
 */
export function formatDraftFields(f: {
  productName: string;
  priceCents: number;
  costCents: number;
  shippingCents: number;
}): string {
  return (
    `商品信息（确认后落盈利库，可先修正）：\n` +
    `  名称：${f.productName.trim() || TBC}\n` +
    `  售价：${fmtMoney(f.priceCents)}\n` +
    `  成本：${fmtMoney(f.costCents)}\n` +
    `  运费：${fmtMoney(f.shippingCents)}`
  );
}

/** 修正指令解析产物（只含用户显式给的字段）。 */
export interface DraftCorrections {
  productName?: string;
  priceCents?: number;
  costCents?: number;
  shippingCents?: number;
}

/** 修正句里允许残留的填充词/标点（残留里出现其他内容 = 不是纯修正指令，不拦）。 */
const FIX_FILLER_RE =
  /^(?:[\s，,。、；;：:！!？?·~～]|请|帮我|麻烦|你|把|将|再|先|然后|接着|重新|顺手|顺带|一起|都|也|还|和|与|跟|及|以及|确认|核准|一下|吧|了|的|是|为|好|行|可以|前|后|修正|修改|更新|更正|哦|哈|嗯)*$/;

/** 字段连接词（「价格改成 79」「名称：X」…裸值仅限占位词，防误拦提问句）。 */
const FIX_CONNECTOR = String.raw`(?:改成|改为|改|设为|设置为|设置成|设|调成|调为|调|定为|定成|就叫|叫|是|[:：])`;
const NAME_WORDS = String.raw`(?:商品名(?:称)?|品名|名称)`;
const PRICE_WORDS = String.raw`(?:价格|售价|定价|卖价|单价)`;
const COST_WORDS = String.raw`(?:成本|进价|进货价|成本价)`;
const SHIPPING_WORDS = String.raw`(?:运费|快递费|邮费)`;
const PLACEHOLDER = String.raw`(?:待确认|待定|未知|不详|暂无|无)`;
/** 数值（元）+ 可选单位尾巴，整段吞掉保证残渣干净。 */
const MONEY_VALUE = String.raw`(?:¥|￥)?\s*(\d+(?:\.\d{1,2})?|${PLACEHOLDER})\s*(?:元|块|块钱|人民币|RMB)?`;

function moneyClause(words: string): RegExp {
  return new RegExp(`${words}\\s*${FIX_CONNECTOR}?\\s*${MONEY_VALUE}`, 'g');
}

function nameClause(): RegExp {
  // 名称：连接词 + 值，或裸占位词（「名称待确认」无歧义）。真实值必须带
  // 连接词——「名称你定了吗」这类提问句不许被误拦成修正。
  return new RegExp(
    `${NAME_WORDS}\\s*${FIX_CONNECTOR}\\s*([^\\s，,。；;！!？?：:]{1,60})` +
      `|${NAME_WORDS}\\s*(${PLACEHOLDER})`,
    'g',
  );
}

function isPlaceholder(v: string): boolean {
  return new RegExp(`^${PLACEHOLDER}$`, 'i').test(v.trim());
}

/**
 * 修正指令解析（纯函数，2026-11-08 确认面可修正）：从短消息里抽「字段 + 值」
 * （价格/售价 79、成本 20、运费 8、名称改成 X、…待确认）。**只认纯修正指令**：
 * 删掉所有字段子句后残留必须只是填充词/标点——「运费 8 是谁定的？」这类带提问
 * 的消息不拦（走正常派发），宁漏不误吞。无修正返回 null。
 */
export function parseDraftCorrections(text: string): DraftCorrections | null {
  const t = text ?? '';
  if (!t.trim() || t.trim().length > 120) return null;
  const out: DraftCorrections = {};
  const spans: Array<[number, number]> = [];
  let matched = false;

  const moneyField = (
    re: RegExp,
    apply: (cents: number) => void,
  ): void => {
    re.lastIndex = 0;
    for (let m = re.exec(t); m; m = re.exec(t)) {
      const v = (m[1] ?? '').trim();
      if (!v) continue;
      spans.push([m.index, m.index + m[0].length]);
      matched = true;
      if (isPlaceholder(v)) apply(0);
      else {
        const yuan = Number(v);
        if (!Number.isFinite(yuan) || yuan < 0) continue;
        apply(Math.round(yuan * 100));
      }
    }
  };

  moneyField(moneyClause(PRICE_WORDS), (c) => {
    out.priceCents = c;
  });
  moneyField(moneyClause(COST_WORDS), (c) => {
    out.costCents = c;
  });
  moneyField(moneyClause(SHIPPING_WORDS), (c) => {
    out.shippingCents = c;
  });

  const nre = nameClause();
  for (let m = nre.exec(t); m; m = nre.exec(t)) {
    const v = (m[1] ?? m[2] ?? '').trim();
    if (!v) continue;
    spans.push([m.index, m.index + m[0].length]);
    matched = true;
    out.productName = isPlaceholder(v) ? '' : v.slice(0, 200);
  }

  if (!matched) return null;
  // 残渣检查：删掉字段子句后只剩填充词/标点 → 纯修正指令；否则不拦。
  spans.sort((a, b) => a[0] - b[0]);
  let residue = '';
  let cursor = 0;
  for (const [s, e] of spans) {
    if (s >= cursor) residue += t.slice(cursor, s);
    cursor = Math.max(cursor, e);
  }
  residue += t.slice(cursor);
  if (!FIX_FILLER_RE.test(residue.trim())) return null;
  return out;
}

// ── 纯函数：[post] → [draft] 防线（「只草拟不发布」兜底）────────────────────

/**
 * 从 from 起找第一个 `{` 的配平闭合（跳过字符串/转义）。返回闭合下标；无配平 -1。
 * 与 craft-markers.matchBrace 同款（那里未导出，本地复刻保持零耦合）。
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
 * 草拟回合防线（纯函数）：把回复里的 [post] 标记行改写为 [draft]（title/text
 * → title/body）。内容策划师 soul 写着「产出可发布贴文时输出 [post]」，草拟
 * 回合若照抄就把**未确认**草稿直接发出去了——凡本回合是草拟任务，[post] 一律
 * 降级为草稿（不自动定稿）。非 [post] 行原样保留；载荷 JSON 不合法的行不动。
 */
export function convertPostMarkersToDraft(text: string): string {
  const re = /\[(?:craft:)?post\]/gi;
  let out = '';
  let cursor = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const tagStart = m.index;
    const lineStart = text.lastIndexOf('\n', tagStart - 1) + 1;
    if (text.slice(lineStart, tagStart).trim() !== '') continue;
    const payloadFrom = tagStart + m[0].length;
    const close = matchBrace(text, payloadFrom);
    if (close < 0) continue;
    const open = text.indexOf('{', payloadFrom);
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(text.slice(open, close + 1)) as Record<string, unknown>;
    } catch {
      continue;
    }
    const draft: Record<string, unknown> = {
      title: typeof obj.title === 'string' ? obj.title : '',
      body:
        typeof obj.text === 'string'
          ? obj.text
          : typeof obj.body === 'string'
            ? obj.body
            : '',
      topics: Array.isArray(obj.topics) ? obj.topics : [],
    };
    if (Array.isArray(obj.images)) draft.images = obj.images;
    // media 项（{name,path,url,is_image} 同构）→ 取 path/url 归进 draft.images（字符串路径）。
    if (Array.isArray(obj.media)) {
      const mediaPaths = obj.media
        .map((m) =>
          typeof m === 'string'
            ? m
            : m && typeof m === 'object'
              ? String((m as { path?: string; url?: string }).path || (m as { url?: string }).url || '')
              : '',
        )
        .filter(Boolean);
      draft.images = [...(Array.isArray(draft.images) ? draft.images : []), ...mediaPaths];
    }
    out += text.slice(cursor, tagStart) + '[draft] ' + JSON.stringify(draft);
    cursor = close + 1;
    re.lastIndex = close + 1;
  }
  return out + text.slice(cursor);
}

/**
 * 附件 + 标记里显式给的图片路径 → craft_posts.images 项（上限 9，按 path 去重）。
 * 附件字段（name/path/url/is_image）与 be-worker 契约同形，直接透传。
 */
export function toPostImages(
  attachments?: Array<Pick<UserAttachment, 'name' | 'path' | 'url' | 'is_image'>>,
  markerImages?: string[],
): CraftPostApiImage[] {
  const out: CraftPostApiImage[] = [];
  const seen = new Set<string>();
  for (const a of attachments ?? []) {
    const p = (a.path ?? '').trim();
    if (!p || seen.has(p)) continue;
    seen.add(p);
    out.push({
      name: (a.name ?? '').trim() || (p.split(/[\\/]/).pop() ?? p),
      path: p,
      url: (a.url ?? '').trim(),
      is_image: a.is_image !== false,
    });
    if (out.length >= 9) return out;
  }
  for (const raw of markerImages ?? []) {
    const p = (raw ?? '').trim();
    if (!p || seen.has(p)) continue;
    seen.add(p);
    out.push({ name: p.split(/[\\/]/).pop() ?? p, path: p, url: '', is_image: true });
    if (out.length >= 9) break;
  }
  return out;
}

// ── 数据面 REST 客户端（be-worker 契约；测试注入假实现）─────────────────────

/**
 * 默认 REST 实现：Node 网关自身（:8002）上的 /api/craft-posts、
 * /api/craft-products（be-worker 挂载）。超时/非 2xx/网络错 → null（fail-soft，
 * 调用方播报可见）。base 可注入（测试/多环境）。
 */
export function defaultCraftPostApi(base?: string): CraftPostApi {
  const root = (
    base ??
    process.env.SF_CRAFT_API_BASE ??
    `http://127.0.0.1:${process.env.PORT ?? 8002}`
  ).replace(/\/$/, '');
  const call = async <T>(path: string, init?: RequestInit): Promise<T | null> => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${root}${path}`, {
        ...init,
        headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) {
        console.warn(`[craft-post-pipeline] ${init?.method ?? 'GET'} ${path} → HTTP ${res.status}`);
        return null;
      }
      return (await res.json()) as T;
    } catch (e) {
      console.warn(`[craft-post-pipeline] ${init?.method ?? 'GET'} ${path} failed: ${(e as Error).message}`);
      return null;
    }
  };
  return {
    createPost: (input) =>
      call<{ post_id: string }>('/api/craft-posts', {
        method: 'POST',
        body: JSON.stringify({ ...input, status: 'draft' }),
      }),
    patchPost: (id, patch) =>
      call(`/api/craft-posts/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    createProduct: (input) =>
      call<{ product_id: string }>('/api/craft-products', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    listProducts: async () => {
      const r = await call<{ items?: Array<{ product_id?: string; source_post_id?: string | null }> }>(
        '/api/craft-products',
      );
      return (r?.items ?? []).map((p) => ({
        product_id: String(p.product_id ?? ''),
        source_post_id: p.source_post_id ?? null,
      }));
    },
  };
}

// ── 编排器 ───────────────────────────────────────────────────────────────────

export interface CraftPostPipeline {
  /** [draft] 动作落库 + 进入待确认（runCraftFlowActions 挂钩点调用）。 */
  handleDraft(
    groupId: string,
    draft: CraftPostDraft,
    attachments?: UserAttachment[],
  ): Promise<void>;
  /**
   * 消息入口消费：草稿确认/放弃、审批门挂起期的决定消息 → true（调用方跳过
   * fan-out，防 swapDagRun 把挂起审批门当「上一轮」掐掉）；其余 false 照常派发。
   */
  takeInput(groupId: string, text: string): Promise<boolean>;
  /** 测试可检视的活套状态。 */
  getState(groupId: string): PostPipelineState | undefined;
  /** 清场（新草稿顶替/测试隔离）。 */
  clear(groupId: string): void;
}

export function createCraftPostPipeline(deps: CraftPostPipelineDeps): CraftPostPipeline {
  const states = new Map<string, PostPipelineState>();

  const alive = (groupId: string, st: PostPipelineState): boolean => states.get(groupId) === st;

  async function runGates(
    groupId: string,
    st: PostPipelineState,
    gate1: Promise<ApprovalVerdict>,
  ): Promise<void> {
    // status:confirmed 落库（失败不阻断审批门——发布前幂等重试；抖动可见播报）。
    const confirmed = await deps.api.patchPost(st.postId, { status: 'confirmed' });
    if (!alive(groupId, st)) return;
    if (!confirmed) {
      void deps.notice(
        groupId,
        `⚠️ 博文《${st.title}》status:confirmed 暂未落库（数据面不可达），已进入审批门；发布前会自动重试。`,
      );
    }
    void deps.notice(
      groupId,
      `✅ 博文《${st.title}》已确认（AI 草拟 + 人确认，不自动定稿）。\n` +
        `审批门① 品牌定稿：请董事长批准（回复「批准」，或 POST /api/groups/${groupId}/approvals/${st.brandNodeId} {"decision":"approve"}）。`,
    );
    const v1 = await gate1;
    if (!alive(groupId, st)) return;
    if (v1 !== 'approved') {
      st.phase = 'awaiting_confirm';
      void deps.notice(
        groupId,
        `❌ 审批门① 品牌定稿${v1 === 'rejected' ? '被拒绝或被新消息打断' : '等待超时'}；博文《${st.title}》停在 confirmed（不回退）。回复「确认」可重新进入审批门。`,
      );
      return;
    }
    void deps.notice(
      groupId,
      `✅ 审批门① 品牌定稿已批准。\n审批门② 对外发布：请董事长批准（回复「批准」，或 POST /api/groups/${groupId}/approvals/${st.publishNodeId} {"decision":"approve"}）。`,
    );
    st.phase = 'gate_publish';
    // 注册门②紧随门①裁决（同一同步续体）：不存在「决定发了但门还没挂」的窗口。
    const verdict2 = await deps.registerApproval(groupId, st.publishNodeId, {
      nodeName: '对外发布',
      preview: `博文《${st.title}》等待对外发布审批（批后自动发布并落商品）`,
    });
    if (!alive(groupId, st)) return;
    if (verdict2 !== 'approved') {
      st.phase = 'awaiting_confirm';
      void deps.notice(
        groupId,
        `❌ 审批门② 对外发布${verdict2 === 'rejected' ? '被拒绝或被新消息打断' : '等待超时'}；博文《${st.title}》停在 confirmed（不回退）。回复「确认」可重新进入审批门。`,
      );
      return;
    }
    st.phase = 'publishing';
    const done = await publishDraft(groupId, st);
    // 仅发布成功才清状态；发布失败停在 awaiting_confirm 可重进（fail-soft）。
    if (done && alive(groupId, st)) states.delete(groupId);
  }

  async function publishDraft(groupId: string, st: PostPipelineState): Promise<boolean> {
    // 幂等重试 confirmed（首次 PATCH 可能因数据面抖动失败；confirmed→confirmed
    // 同状态幂等）。发布序列按契约（发布后内容冻结 FROZEN）：商品先落、
    // product_id 先挂，最后才 PATCH published——回挂放 published 之后会被
    // 422 FROZEN 拒。[post] 社媒标记由数据面 PATCH published 同步落（小红书，
    // sp_posts + 营销运营动态，media 从 post.images 透传），此处不重复发标记。
    await deps.api.patchPost(st.postId, { status: 'confirmed' });

    // ① 商品落库（POST 无幂等键 → 记住 id + 先查后建，绝不重复建）。
    let productId = st.productId;
    if (!productId) {
      const existing = await deps.api.listProducts();
      if (existing) {
        const hit = existing.find((p) => p.source_post_id === st.postId);
        if (hit?.product_id) productId = hit.product_id;
      }
      if (!productId) {
        const prod = await deps.api.createProduct({
          name: st.productName || st.title,
          price_cents: st.priceCents,
          cost_cents: st.costCents,
          shipping_cents: st.shippingCents,
          image_url: st.images[0]?.url || st.images[0]?.path || '',
          source_post_id: st.postId,
        });
        if (!prod?.product_id) {
          st.phase = 'awaiting_confirm';
          void deps.notice(
            groupId,
            `⚠️ 商品落库失败（数据面不可达）；为保「发布即关联」，博文《${st.title}》本次未发布、停在 confirmed。回复「确认」可重试（商品不重复建）。`,
          );
          return false;
        }
        productId = prod.product_id;
      }
      st.productId = productId;
    }

    // ② 回挂 product_id（必须在 published 之前——发布后内容冻结，晚了 422 FROZEN）。
    const linked = await deps.api.patchPost(st.postId, { product_id: productId });
    if (!linked) {
      st.phase = 'awaiting_confirm';
      void deps.notice(
        groupId,
        `⚠️ 商品已落库（${productId}）但 product_id 回挂未成功；本次未发布（发布后内容冻结将无法回挂）。回复「确认」可重试。`,
      );
      return false;
    }

    // ③ 发布（终态；此后博文内容冻结）。
    const published = await deps.api.patchPost(st.postId, { status: 'published' });
    if (!published) {
      st.phase = 'awaiting_confirm';
      void deps.notice(
        groupId,
        `⚠️ 自动发布失败（PATCH status:published 未成功）；博文《${st.title}》停在 confirmed（商品「${st.productName || st.title}」已挂接）。回复「确认」可重试发布。`,
      );
      return false;
    }
    void deps.notice(
      groupId,
      `🎉 博文《${st.title}》已通过两道审批并自动发布：[post] 社媒标记已落（小红书${st.images.length ? '，图片随帖' : ''}），status→published。` +
        `商品「${st.productName || st.title}」已落 craft-profit 盈利库（source_post_id 关联博文）。`,
    );
    return true;
  }

  return {
    async handleDraft(groupId, draft, attachments) {
      const gates = deps.gateNodeIds();
      const images = toPostImages(attachments, draft.images);
      // 新草稿顶替旧流水线：旧审批门取消（拒绝收场），旧记录停在原状态。
      const prev = states.get(groupId);
      if (prev) {
        if (prev.phase === 'gate_brand') deps.cancelApproval?.(groupId, prev.brandNodeId);
        if (prev.phase === 'gate_publish') deps.cancelApproval?.(groupId, prev.publishNodeId);
      }
      const title = draft.title.trim() || '未命名';
      const created = await deps.api.createPost({
        title,
        body: draft.body,
        topics: draft.topics,
        images,
      });
      if (!created?.post_id) {
        await deps.notice(
          groupId,
          `⚠️ 博文草稿《${title}》落库失败（数据面不可达），未进入确认环节；请稍后重新草拟。`,
        );
        return;
      }
      states.set(groupId, {
        phase: 'awaiting_confirm',
        postId: created.post_id,
        title,
        productName: draft.product_name,
        priceCents: draft.price_cents,
        costCents: draft.cost_cents,
        shippingCents: draft.shipping_cents,
        images,
        productId: '',
        brandNodeId: gates.brand,
        publishNodeId: gates.publish,
      });
      await deps.notice(
        groupId,
        `📝 博文草稿《${title}》已生成（post_id ${created.post_id}，status: draft）。\n` +
          `${formatDraftFields({
            productName: draft.product_name,
            priceCents: draft.price_cents,
            costCents: draft.cost_cents,
            shippingCents: draft.shipping_cents,
          })}\n` +
          '回复「确认」进入审批门（①品牌定稿 → ②对外发布），全部通过后自动发布并落商品；' +
          '回复「拒绝」放弃本草稿；回复「价格 79」「成本 20」「运费 8」「名称改成 XX」可修正商品字段（缺依据的「待确认」项建议先补齐）。',
      );
    },

    async takeInput(groupId, text) {
      const st = states.get(groupId);
      if (!st) return false;
      // 商品字段就地修正（2026-11-08 确认面可修正，仅 awaiting_confirm 期）：
      // 「价格 79」「成本 20」「运费 8」「名称改成 X」→ 只改字段重播确认块，
      // 不派发 fan-out。修正与确认分步走（decide 是 ≤6 字短语判定，修正句
      // 天然不与它冲突；纯修正返回 true，用户下一步再回「确认」）。
      if (st.phase === 'awaiting_confirm') {
        const fix = parseDraftCorrections(text);
        if (fix) {
          if (fix.productName !== undefined) st.productName = fix.productName;
          if (fix.priceCents !== undefined) st.priceCents = fix.priceCents;
          if (fix.costCents !== undefined) st.costCents = fix.costCents;
          if (fix.shippingCents !== undefined) st.shippingCents = fix.shippingCents;
          await deps.notice(
            groupId,
            `📝 博文草稿《${st.title}》商品字段已修正（发布与落商品以本组为准）：\n` +
              `${formatDraftFields(st)}\n` +
              '回复「确认」进入审批门；继续回复「价格 79」等可再修正。',
          );
          return true;
        }
      }
      const verdict = deps.decide(text);
      if (!verdict) return false;
      if (st.phase === 'publishing') return false; // 无挂起审批可保护，照常派发
      if (st.phase !== 'awaiting_confirm') {
        // 审批门挂起中：决定已由既有审批通道（会话短语 → tryResolveApprovalFromText
        // / 显式 API）送达；这里只负责拦下 fan-out，防 swapDagRun 误杀挂起门。
        return true;
      }
      if (verdict === 'rejected') {
        states.delete(groupId);
        await deps.notice(
          groupId,
          `🗑 博文草稿《${st.title}》已放弃（记录保留在 draft 状态）。需要时让我重新草拟。`,
        );
        return true;
      }
      // 用户确认 → status:confirmed + **同步**挂起审批门①（注册先于任何决定消费）。
      st.phase = 'gate_brand';
      const gate1 = deps.registerApproval(groupId, st.brandNodeId, {
        nodeName: '品牌定稿',
        preview: `博文《${st.title}》等待品牌定稿审批`,
      });
      void runGates(groupId, st, gate1);
      return true;
    },

    getState(groupId) {
      return states.get(groupId);
    },

    clear(groupId) {
      const st = states.get(groupId);
      if (st) {
        if (st.phase === 'gate_brand') deps.cancelApproval?.(groupId, st.brandNodeId);
        if (st.phase === 'gate_publish') deps.cancelApproval?.(groupId, st.publishNodeId);
      }
      states.delete(groupId);
    },
  };
}
