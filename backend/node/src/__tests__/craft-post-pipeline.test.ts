/**
 * craft-post-pipeline.test.ts — 图→小红书博文→商品 流水线（2026-11-08）。
 *
 * 覆盖：
 *   - 纯函数：触发判定 isPostDraftRequest / 草拟工单 buildDraftPrompt /
 *     [post]→[draft] 防线 convertPostMarkersToDraft / 图片归一 toPostImages
 *   - [draft] 标记经 craft-markers 解析（结构化草稿动作 + 剥标记）
 *   - 编排器状态机（依赖全注入假实现，零网络零 DB）：
 *     草稿落库→待确认→用户确认→品牌定稿门→对外发布门→自动发布→落商品；
 *     拒绝/被打断停在 confirmed 可重进；数据面失败 fail-soft 播报。
 *   - 决定词表（确认/confirm 补进 parseApprovalDecision，与草稿确认口径一致）
 *
 * Run: npx vitest run src/__tests__/craft-post-pipeline.test.ts
 */
import { describe, expect, it } from 'vitest';
import { parseCraftMarkers } from '../lib/craft-markers';
import {
  buildDraftPrompt,
  convertPostMarkersToDraft,
  createCraftPostPipeline,
  formatDraftFields,
  isPostDraftRequest,
  parseDraftCorrections,
  toPostImages,
  type ApprovalVerdict,
  type CraftPostApi,
  type CraftPostPipelineDeps,
} from '../lib/craft-post-pipeline';
import {
  cancelPendingApproval,
  clearPendingApprovals,
  parseApprovalDecision,
  registerPendingApproval,
} from '../routes/groups/groups-chat';

// ── 假实现 ───────────────────────────────────────────────────────────────────

function makeApprovalStub() {
  const calls: Array<{ groupId: string; nodeId: string; resolve: (v: ApprovalVerdict) => void }> = [];
  const cancels: Array<{ groupId: string; nodeId: string }> = [];
  return {
    calls,
    cancels,
    registerApproval: (groupId: string, nodeId: string) =>
      new Promise<ApprovalVerdict>((resolve) => {
        calls.push({ groupId, nodeId, resolve });
      }),
    cancelApproval: (groupId: string, nodeId: string) => {
      cancels.push({ groupId, nodeId });
    },
  };
}

interface ApiStubOpts {
  failCreatePost?: boolean;
  failPublish?: boolean;
  failConfirm?: boolean;
  failProduct?: boolean;
  /** 商品服务端已落库但响应丢失（模拟超时）：listProducts 能查到、createProduct 返回 null。 */
  failProductRespond?: boolean;
  /** product_id 回挂 PATCH 失败。 */
  failLink?: boolean;
}

function makeApiStub(opts: ApiStubOpts = {}) {
  const createdPosts: Array<Record<string, unknown>> = [];
  const patches: Array<{ id: string; patch: Record<string, unknown> }> = [];
  const products: Array<Record<string, unknown>> = [];
  /** 服务端商品目录（listProducts 先查后建的依据；含响应丢失场景的落库）。 */
  const serverProducts: Array<{ product_id: string; source_post_id: string | null }> = [];
  /** 操作时序日志（验证 FROZEN 序列：商品→回挂→发布）。 */
  const ops: string[] = [];
  const api: CraftPostApi = {
    createPost: async (input) => {
      if (opts.failCreatePost) return null;
      createdPosts.push({ ...input });
      return { post_id: `post-${createdPosts.length}` };
    },
    patchPost: async (id, patch) => {
      if (opts.failPublish && patch.status === 'published') return null;
      if (opts.failConfirm && patch.status === 'confirmed') return null;
      if (opts.failLink && patch.product_id !== undefined) return null;
      patches.push({ id, patch: { ...patch } });
      if (patch.product_id !== undefined) ops.push('post:link');
      if (patch.status === 'published') ops.push('post:published');
      return { post: { post_id: id, ...patch } };
    },
    createProduct: async (input) => {
      if (opts.failProduct) return null;
      const product_id = `prod-${serverProducts.length + 1}`;
      serverProducts.push({ product_id, source_post_id: String(input.source_post_id) });
      if (opts.failProductRespond) return null; // 服务端已落库，响应丢了
      products.push({ ...input });
      ops.push('product:create');
      return { product_id };
    },
    listProducts: async () => [...serverProducts],
  };
  return { api, opts, createdPosts, patches, products, serverProducts, ops };
}

function makePipeline(
  overrides: Partial<CraftPostPipelineDeps> & {
    apiStub?: ReturnType<typeof makeApiStub>;
    approvalStub?: ReturnType<typeof makeApprovalStub>;
  } = {},
) {
  const { apiStub: apiStubOpt, approvalStub: approvalStubOpt, ...depsOverrides } = overrides;
  const apiStub = apiStubOpt ?? makeApiStub();
  const approvalStub = approvalStubOpt ?? makeApprovalStub();
  const notices: Array<{ groupId: string; content: string }> = [];
  const deps: CraftPostPipelineDeps = {
    registerApproval: approvalStub.registerApproval,
    cancelApproval: approvalStub.cancelApproval,
    decide: parseApprovalDecision,
    notice: (groupId, content) => {
      notices.push({ groupId, content });
    },
    api: apiStub.api,
    gateNodeIds: () => ({ brand: 'agent-content', publish: 'agent-ops' }),
    ...depsOverrides,
  };
  const pipeline = createCraftPostPipeline(deps);
  return { pipeline, apiStub, approvalStub, notices };
}

/** 让 fire-and-forget 的 runGates 链条跑完当前挂起的微任务/IO。 */
async function flush(times = 6): Promise<void> {
  for (let i = 0; i < times; i++) await new Promise((r) => setImmediate(r));
}

const DRAFT = {
  kind: 'draft' as const,
  title: '山里来的温柔',
  body: '残障匠人手作苗绣杯垫',
  topics: ['手作', '苗绣'],
  product_name: '苗绣杯垫',
  price_cents: 6800,
  cost_cents: 2000,
  shipping_cents: 800,
  images: [],
};

// ── 纯函数 ───────────────────────────────────────────────────────────────────

describe('isPostDraftRequest — 草拟请求触发判定', () => {
  it.each([
    '帮我写一篇小红书博文',
    '草拟小红书文案',
    '起草一下',
    '生成一篇种草笔记',
    '写个小红书',
    '发到小红书',
    '给这个图配一段文案',
    '来篇带货文',
  ])('命中：%s', (t) => {
    expect(isPostDraftRequest(t)).toBe(true);
  });

  it.each([
    '',
    '   ',
    '分析一下小红书竞品的打法',
    '来分析下小红书的机会',
    '小红书文案怎么写才好',
    '今天天气不错',
    '帮我把商品上架',
    '联系快递员寄出',
  ])('不命中：%s', (t) => {
    expect(isPostDraftRequest(t)).toBe(false);
  });
});

describe('buildDraftPrompt — 草拟工单', () => {
  it('带 [draft] 输出格式、「只草拟不发布」纪律与用户原文', () => {
    const p = buildDraftPrompt('帮我写一篇苗绣杯垫的小红书');
    expect(p).toContain('[draft] {"title":"标题"');
    expect(p).toContain('只草拟、不发布');
    expect(p).toContain('禁止输出 [post]');
    expect(p).toContain('帮我写一篇苗绣杯垫的小红书');
    expect(p).toContain('topics');
    expect(p).toContain('product_name/price/cost/shipping');
  });
});

describe('convertPostMarkersToDraft — [post] 降级防线', () => {
  it('[post] 载荷改写为 [draft]（text→body），其余行原样', () => {
    const out = convertPostMarkersToDraft(
      '预览如下\n[post] {"platform":"小红书","title":"T","text":"B"}\n结束',
    );
    expect(out).toBe('预览如下\n[draft] {"title":"T","body":"B","topics":[]}\n结束');
  });

  it('[craft:post] 别名同改；载荷 JSON 不合法的行不动', () => {
    const bad = '[craft:post] {"title":"x"';
    const out = convertPostMarkersToDraft(`${bad}\n[craft:post] {"title":"T","text":"B","images":["C:/a.jpg"]}`);
    expect(out.startsWith(bad)).toBe(true);
    expect(out).toContain('[draft] {"title":"T","body":"B","topics":[],"images":["C:/a.jpg"]}');
  });

  it('非 [post] 行与正文中间的 [post] 字样不动', () => {
    const text = '正文里说 [post] 是个标记而已\n[order] {"product":"x"}';
    expect(convertPostMarkersToDraft(text)).toBe(text);
  });

  it('media 项（{name,path,url,is_image}）收敛进 draft.images 路径', () => {
    const out = convertPostMarkersToDraft(
      '[post] {"title":"T","text":"B","media":[{"name":"a.jpg","path":"C:/tmp/a.jpg","url":"","is_image":true},{"name":"b.jpg","path":"","url":"/files/b.jpg","is_image":true}]}',
    );
    expect(out).toContain('"images":["C:/tmp/a.jpg","/files/b.jpg"]');
    const r = parseCraftMarkers(out);
    expect(r.actions[0]).toMatchObject({ kind: 'draft', images: ['C:/tmp/a.jpg', '/files/b.jpg'] });
  });

  it('改写产物能被 parseCraftMarkers 解析成 draft 动作（防线闭环）', () => {
    const out = convertPostMarkersToDraft('[post] {"title":"T","text":"B"}');
    const r = parseCraftMarkers(out);
    expect(r.actions[0]).toMatchObject({ kind: 'draft', title: 'T', body: 'B' });
  });
});

describe('toPostImages — 图片归一', () => {
  it('附件字段直传（name/path/url/is_image）；标记图片并入、按 path 去重', () => {
    const imgs = toPostImages(
      [
        { name: '苗绣.jpg', path: 'C:/tmp/a.jpg', url: '/files/a.jpg', is_image: true },
        { name: '苗绣.jpg', path: 'C:/tmp/a.jpg', url: '/files/a.jpg', is_image: true },
      ],
      ['C:/tmp/b.jpg', 'C:/tmp/a.jpg'],
    );
    expect(imgs).toEqual([
      { name: '苗绣.jpg', path: 'C:/tmp/a.jpg', url: '/files/a.jpg', is_image: true },
      { name: 'b.jpg', path: 'C:/tmp/b.jpg', url: '', is_image: true },
    ]);
  });

  it('上限 9 张', () => {
    const many = Array.from({ length: 12 }, (_, i) => `p${i}.jpg`);
    expect(toPostImages(undefined, many)).toHaveLength(9);
  });
});

describe('[draft] 标记（craft-markers 协议扩展）', () => {
  it('解析结构化草稿动作（金额元→分、topics 去 #）并从展示文本剥掉', () => {
    const r = parseCraftMarkers(
      '草稿如下\n[draft] {"title":"山里来的温柔","body":"正文","topics":["手作","#苗绣",""],"product_name":"苗绣杯垫","price":68,"cost":20,"shipping":8}\n请确认。',
    );
    expect(r.markers[0]).toMatchObject({ tag: 'draft', ok: true });
    expect(r.actions[0]).toEqual({
      kind: 'draft',
      title: '山里来的温柔',
      body: '正文',
      topics: ['手作', '苗绣'],
      product_name: '苗绣杯垫',
      price_cents: 6800,
      cost_cents: 2000,
      shipping_cents: 800,
      images: [],
    });
    expect(r.cleaned).toBe('草稿如下\n请确认。');
  });

  it('缺 title/body 报错剥标记；金额非法同款', () => {
    const r = parseCraftMarkers('[draft] {}\n[draft] {"title":"x","price":"abc"}');
    expect(r.markers[0]).toMatchObject({ tag: 'draft', ok: false });
    expect(r.markers[0]!.error).toMatch(/title\/body/);
    expect(r.markers[1]).toMatchObject({ tag: 'draft', ok: false });
    expect(r.markers[1]!.error).toMatch(/金额/);
  });
});

// ── 决定词表（确认/confirm 草稿确认口径）────────────────────────────────────

describe('parseApprovalDecision 词表扩展', () => {
  it.each(['确认', '确认。', 'confirm', 'CONFIRM'])('批准词：%s → approved', (t) => {
    expect(parseApprovalDecision(t)).toBe('approved');
  });
  it('既有否定用例零回归', () => {
    expect(parseApprovalDecision('继续')).toBeNull();
    expect(parseApprovalDecision('批准这个方案然后开始执行')).toBeNull();
    expect(parseApprovalDecision('拒绝')).toBe('rejected');
    expect(parseApprovalDecision('批准')).toBe('approved');
  });
});

// ── 编排器状态机 ─────────────────────────────────────────────────────────────

describe('createCraftPostPipeline — 草稿→确认→两道审批→发布→落商品', () => {
  it('全流程：draft 落库→确认→品牌定稿门→对外发布门→商品→回挂→published', async () => {
    const { pipeline, apiStub, approvalStub, notices } = makePipeline();
    await pipeline.handleDraft('g1', DRAFT, [
      { name: '苗绣.jpg', path: 'C:/tmp/a.jpg', url: '/files/a.jpg', is_image: true },
    ]);

    // 草稿落库（status:draft）+ 待确认播报
    expect(apiStub.createdPosts).toEqual([
      {
        title: '山里来的温柔',
        body: '残障匠人手作苗绣杯垫',
        topics: ['手作', '苗绣'],
        images: [{ name: '苗绣.jpg', path: 'C:/tmp/a.jpg', url: '/files/a.jpg', is_image: true }],
      },
    ]);
    expect(pipeline.getState('g1')).toMatchObject({ phase: 'awaiting_confirm', postId: 'post-1' });
    expect(notices[notices.length - 1]!.content).toContain('status: draft');
    expect(notices[notices.length - 1]!.content).toContain('回复「确认」');

    // 用户确认 → 同步挂门①（品牌定稿=内容策划师节点）+ PATCH confirmed
    const took = await pipeline.takeInput('g1', '确认');
    expect(took).toBe(true);
    expect(approvalStub.calls).toHaveLength(1);
    expect(approvalStub.calls[0]).toMatchObject({ groupId: 'g1', nodeId: 'agent-content' });
    await flush();
    expect(apiStub.patches).toContainEqual({ id: 'post-1', patch: { status: 'confirmed' } });
    expect(notices[notices.length - 1]!.content).toContain('审批门① 品牌定稿');

    // 门①批准 → 门②（对外发布=运营专员节点）挂起
    approvalStub.calls[0]!.resolve('approved');
    await flush();
    expect(approvalStub.calls).toHaveLength(2);
    expect(approvalStub.calls[1]).toMatchObject({ nodeId: 'agent-ops' });
    expect(notices[notices.length - 1]!.content).toContain('审批门② 对外发布');

    // 门②批准 → FROZEN 安全序列：落商品 → 回挂 product_id → 最后 published
    approvalStub.calls[1]!.resolve('approved');
    await flush();
    expect(apiStub.patches).toContainEqual({ id: 'post-1', patch: { status: 'published' } });
    expect(apiStub.products).toEqual([
      {
        name: '苗绣杯垫',
        price_cents: 6800,
        cost_cents: 2000,
        shipping_cents: 800,
        image_url: '/files/a.jpg',
        source_post_id: 'post-1',
      },
    ]);
    expect(apiStub.patches).toContainEqual({ id: 'post-1', patch: { product_id: 'prod-1' } });
    // 严格时序：product_id 回挂必须先于 published（发布后内容冻结 FROZEN）
    expect(apiStub.ops).toEqual(['product:create', 'post:link', 'post:published']);
    expect(pipeline.getState('g1')).toBeUndefined();
    expect(notices[notices.length - 1]!.content).toContain('已通过两道审批并自动发布');
    expect(notices[notices.length - 1]!.content).toContain('source_post_id 关联博文');
  });

  it('商品名缺省回落博文标题；无图 image_url 空串', async () => {
    const { pipeline, apiStub, approvalStub } = makePipeline();
    await pipeline.handleDraft('g1', { ...DRAFT, product_name: '', images: [] });
    await pipeline.takeInput('g1', '同意');
    approvalStub.calls[0]!.resolve('approved');
    await flush();
    approvalStub.calls[1]!.resolve('approved');
    await flush();
    expect(apiStub.products[0]).toMatchObject({
      name: '山里来的温柔',
      image_url: '',
      source_post_id: 'post-1',
    });
  });

  it('门①被拒 → 停在 confirmed 可重进；重确认重走两道门', async () => {
    const { pipeline, apiStub, approvalStub, notices } = makePipeline();
    await pipeline.handleDraft('g1', DRAFT);
    await pipeline.takeInput('g1', '确认');
    approvalStub.calls[0]!.resolve('rejected');
    await flush();
    expect(pipeline.getState('g1')).toMatchObject({ phase: 'awaiting_confirm' });
    expect(notices[notices.length - 1]!.content).toContain('停在 confirmed');
    expect(apiStub.patches.filter((p) => p.patch.status === 'published')).toHaveLength(0);

    // 重进：确认 → 门① → 门② → 发布
    await pipeline.takeInput('g1', '确认');
    expect(approvalStub.calls).toHaveLength(2);
    approvalStub.calls[1]!.resolve('approved');
    await flush();
    approvalStub.calls[2]!.resolve('approved');
    await flush();
    expect(apiStub.patches.filter((p) => p.patch.status === 'published')).toHaveLength(1);
    expect(pipeline.getState('g1')).toBeUndefined();
  });

  it('门②超时/拒绝同样停在 confirmed，不发布不落商品', async () => {
    const { pipeline, apiStub, approvalStub, notices } = makePipeline();
    await pipeline.handleDraft('g1', DRAFT);
    await pipeline.takeInput('g1', '确认');
    approvalStub.calls[0]!.resolve('approved');
    await flush();
    approvalStub.calls[1]!.resolve('rejected');
    await flush();
    expect(pipeline.getState('g1')).toMatchObject({ phase: 'awaiting_confirm' });
    expect(notices[notices.length - 1]!.content).toContain('审批门② 对外发布');
    expect(apiStub.products).toHaveLength(0);
  });

  it('草稿拒绝 → 放弃（保留在 draft），状态清空', async () => {
    const { pipeline, apiStub, notices } = makePipeline();
    await pipeline.handleDraft('g1', DRAFT);
    const took = await pipeline.takeInput('g1', '拒绝');
    expect(took).toBe(true);
    expect(pipeline.getState('g1')).toBeUndefined();
    expect(notices[notices.length - 1]!.content).toContain('已放弃');
    // 记录不回退不改状态（数据面单向状态机）
    expect(apiStub.patches).toHaveLength(0);
  });

  it('审批门挂起期的决定消息只拦 fan-out（true），不重复裁决', async () => {
    const { pipeline, approvalStub } = makePipeline();
    await pipeline.handleDraft('g1', DRAFT);
    await pipeline.takeInput('g1', '确认');
    // 门①挂起中：此时来的「批准」由 tryResolveApprovalFromText 送达，
    // takeInput 只负责跳过 fan-out（防 swapDagRun 掐掉挂起门）。
    expect(await pipeline.takeInput('g1', '批准')).toBe(true);
    expect(approvalStub.calls).toHaveLength(1); // 没有重复注册
  });

  it('非决定文本 / 无流水线 → false 照常派发', async () => {
    const { pipeline } = makePipeline();
    expect(await pipeline.takeInput('g1', '确认')).toBe(false); // 无流水线
    await pipeline.handleDraft('g1', DRAFT);
    expect(await pipeline.takeInput('g1', '帮我改一下标题')).toBe(false);
  });

  it('发布 PATCH 失败 → 停在 confirmed 可重进；重试复用商品不重复建', async () => {
    const apiStub = makeApiStub({ failPublish: true });
    const { pipeline, approvalStub, notices } = makePipeline({ apiStub });
    await pipeline.handleDraft('g1', DRAFT);
    await pipeline.takeInput('g1', '确认');
    approvalStub.calls[0]!.resolve('approved');
    await flush();
    approvalStub.calls[1]!.resolve('approved');
    await flush();
    // FROZEN 序列下商品/回挂已在发布前完成；发布失败停在 confirmed
    expect(pipeline.getState('g1')).toMatchObject({ phase: 'awaiting_confirm' });
    expect(notices[notices.length - 1]!.content).toContain('自动发布失败');
    expect(notices[notices.length - 1]!.content).toContain('已挂接');
    expect(apiStub.products).toHaveLength(1);
    expect(apiStub.ops).toEqual(['product:create', 'post:link']); // 没走到 published

    // 重进：确认 → 两道门 → 发布成功；商品幂等（还是 1 个，复用 prod-1）
    apiStub.opts.failPublish = false;
    await pipeline.takeInput('g1', '确认');
    approvalStub.calls[2]!.resolve('approved');
    await flush();
    approvalStub.calls[3]!.resolve('approved');
    await flush();
    expect(apiStub.products).toHaveLength(1);
    expect(apiStub.patches.filter((p) => p.patch.product_id === 'prod-1')).toHaveLength(2); // 重试回挂同值幂等
    expect(apiStub.patches.filter((p) => p.patch.status === 'published')).toHaveLength(1);
    expect(pipeline.getState('g1')).toBeUndefined();
    expect(notices[notices.length - 1]!.content).toContain('已通过两道审批并自动发布');
  });

  it('落商品失败 → 本次不发布（FROZEN：product_id 必须 publish 前挂好），停在 confirmed', async () => {
    const { pipeline, apiStub, approvalStub, notices } = makePipeline({
      apiStub: makeApiStub({ failProduct: true }),
    });
    await pipeline.handleDraft('g1', DRAFT);
    await pipeline.takeInput('g1', '确认');
    approvalStub.calls[0]!.resolve('approved');
    await flush();
    approvalStub.calls[1]!.resolve('approved');
    await flush();
    expect(apiStub.patches.filter((p) => p.patch.status === 'published')).toHaveLength(0);
    expect(apiStub.ops).toEqual([]); // 商品没建 → 回挂/发布都不动
    expect(pipeline.getState('g1')).toMatchObject({ phase: 'awaiting_confirm' });
    expect(notices[notices.length - 1]!.content).toContain('商品落库失败');
    expect(notices[notices.length - 1]!.content).toContain('未发布');
  });

  it('商品已落库但响应丢失 → 重试按 source_post_id 先查后建，不重复建', async () => {
    const apiStub = makeApiStub({ failProductRespond: true });
    const { pipeline, approvalStub } = makePipeline({ apiStub });
    await pipeline.handleDraft('g1', DRAFT);
    await pipeline.takeInput('g1', '确认');
    approvalStub.calls[0]!.resolve('approved');
    await flush();
    approvalStub.calls[1]!.resolve('approved');
    await flush();
    // 首轮：服务端已落 prod-1 但响应丢失 → 视作失败，不发布
    expect(apiStub.serverProducts).toHaveLength(1);
    expect(apiStub.patches.filter((p) => p.patch.status === 'published')).toHaveLength(0);
    expect(pipeline.getState('g1')).toMatchObject({ phase: 'awaiting_confirm' });

    // 重进：listProducts 查到 source_post_id 命中 → 复用 prod-1，不新建
    await pipeline.takeInput('g1', '确认');
    approvalStub.calls[2]!.resolve('approved');
    await flush();
    approvalStub.calls[3]!.resolve('approved');
    await flush();
    expect(apiStub.serverProducts).toHaveLength(1); // 没有第二个商品
    expect(apiStub.patches).toContainEqual({ id: 'post-1', patch: { product_id: 'prod-1' } });
    expect(apiStub.patches.filter((p) => p.patch.status === 'published')).toHaveLength(1);
  });

  it('product_id 回挂失败 → 不发布（晚了会被 FROZEN 拒），停在 confirmed 可重试', async () => {
    const apiStub = makeApiStub({ failLink: true });
    const { pipeline, approvalStub, notices } = makePipeline({ apiStub });
    await pipeline.handleDraft('g1', DRAFT);
    await pipeline.takeInput('g1', '确认');
    approvalStub.calls[0]!.resolve('approved');
    await flush();
    approvalStub.calls[1]!.resolve('approved');
    await flush();
    expect(apiStub.patches.filter((p) => p.patch.status === 'published')).toHaveLength(0);
    expect(pipeline.getState('g1')).toMatchObject({ phase: 'awaiting_confirm' });
    expect(notices[notices.length - 1]!.content).toContain('回挂未成功');

    // 重进：回挂成功 → 发布；商品仍只有 1 个（复用）
    apiStub.opts.failLink = false;
    await pipeline.takeInput('g1', '确认');
    approvalStub.calls[2]!.resolve('approved');
    await flush();
    approvalStub.calls[3]!.resolve('approved');
    await flush();
    expect(apiStub.products).toHaveLength(1);
    expect(apiStub.patches.filter((p) => p.patch.status === 'published')).toHaveLength(1);
    expect(pipeline.getState('g1')).toBeUndefined();
  });

  it('草稿落库失败 → 不进确认环节（fail-soft 播报）', async () => {
    const { pipeline, notices } = makePipeline({ apiStub: makeApiStub({ failCreatePost: true }) });
    await pipeline.handleDraft('g1', DRAFT);
    expect(pipeline.getState('g1')).toBeUndefined();
    expect(notices[notices.length - 1]!.content).toContain('落库失败');
  });

  it('新草稿顶替旧流水线：旧审批门取消、旧活套作废', async () => {
    const { pipeline, approvalStub } = makePipeline();
    await pipeline.handleDraft('g1', DRAFT);
    await pipeline.takeInput('g1', '确认'); // 门①挂起
    expect(approvalStub.calls).toHaveLength(1);

    await pipeline.handleDraft('g1', { ...DRAFT, title: '第二版' });
    expect(approvalStub.cancels).toContainEqual({ groupId: 'g1', nodeId: 'agent-content' });
    expect(pipeline.getState('g1')).toMatchObject({ phase: 'awaiting_confirm', title: '第二版' });
  });

  it('同轮 [draft] 取最后一条 + 图片取附件与标记并集（runCraftFlowActions 口径）', async () => {
    const { pipeline, apiStub } = makePipeline();
    // runCraftFlowActions 只把最后一个 draft 动作交给 handleDraft；图片并集
    // 在 toPostImages 单测里覆盖，这里验证 handleDraft 的合并入参。
    await pipeline.handleDraft(
      'g1',
      { ...DRAFT, images: ['C:/tmp/marker.jpg'] },
      [{ name: 'a.jpg', path: 'C:/tmp/a.jpg', url: '', is_image: true }],
    );
    expect(apiStub.createdPosts[0]!.images).toEqual([
      { name: 'a.jpg', path: 'C:/tmp/a.jpg', url: '', is_image: true },
      { name: 'marker.jpg', path: 'C:/tmp/marker.jpg', url: '', is_image: true },
    ]);
  });
});

// ── 与 groups-chat pendingApprovals 真源接线（注册/决定/取消）────────────────

describe('审批门复用 pendingApprovals（决定路径①②天然生效）', () => {
  it('注册→会话短语「批准」裁决→取消幂等', async () => {
    clearPendingApprovals();
    const gate = registerPendingApproval('g-approval', 'agent-content');
    // 决定路径②：会话短语（parseApprovalDecision 词表）送达
    const { tryResolveApprovalFromText } = await import('../routes/groups/groups-chat');
    expect(tryResolveApprovalFromText('g-approval', '确认')).toBe(true);
    await expect(gate).resolves.toBe('approved');

    // 取消幂等
    const gate2 = registerPendingApproval('g-approval', 'agent-ops');
    expect(cancelPendingApproval('g-approval', 'agent-ops')).toBe(true);
    await expect(gate2).resolves.toBe('rejected');
    expect(cancelPendingApproval('g-approval', 'agent-ops')).toBe(false);
    clearPendingApprovals();
  });
});

// ── Task#6 防编造硬约束（2026-11-08 修草拟"盲写"）───────────────────────────

describe('buildDraftPrompt — 真实性硬规则（兜底防线）', () => {
  it('看不到图必须明说「无法读取图片内容」；视觉细节不得虚构', () => {
    const p = buildDraftPrompt('根据这张图发小红书博文草稿');
    expect(p).toContain('无法读取图片内容');
    expect(p).toContain('脑补');
    expect(p).toContain('不得虚构任何视觉细节');
  });

  it('商品交易字段严禁编造：无依据写「待确认」或省略，绝不臆造数字', () => {
    const p = buildDraftPrompt('随便写写');
    expect(p).toContain('严禁凭空编造');
    expect(p).toContain('「待确认」');
    expect(p).toContain('绝不臆造价格');
  });

  it('知识库不作商品事实来源；确认面预览含商品字段', () => {
    const p = buildDraftPrompt('x');
    expect(p).toContain('不是商品事实来源');
    expect(p).toContain('名称/售价/成本/运费');
  });

  it('原纪律保留：[draft] 骨架 / 只草拟不发布 / 用户原文', () => {
    const p = buildDraftPrompt('帮我写一篇苗绣杯垫的小红书');
    expect(p).toContain('[draft] {"title":"标题"');
    expect(p).toContain('只草拟、不发布');
    expect(p).toContain('禁止输出 [post]');
    expect(p).toContain('帮我写一篇苗绣杯垫的小红书');
  });

  it('协议行硬规则：最终回复必须以 [draft] 标记收尾，禁仿历史展示格式（2026-11-08 E2E 缺标记回归）', () => {
    const p = buildDraftPrompt('根据这张图发小红书博文草稿');
    expect(p).toContain('【协议行硬规则】');
    expect(p).toContain('必须以独占一行的 [draft] {…} 标记收尾');
    expect(p).toContain('缺了它草稿不会落库');
    expect(p).toContain('禁止用纯展示格式');
  });
});

describe('formatDraftFields — 确认面商品字段（待确认占位）', () => {
  it('全字段 → 名称 + ¥金额（元=分/100 两位小数）', () => {
    const s = formatDraftFields({
      productName: '苗绣杯垫',
      priceCents: 6800,
      costCents: 2000,
      shippingCents: 800,
    });
    expect(s).toContain('名称：苗绣杯垫');
    expect(s).toContain('售价：¥68.00');
    expect(s).toContain('成本：¥20.00');
    expect(s).toContain('运费：¥8.00');
    expect(s).toContain('可先修正');
  });

  it('缺依据（空名/0 分）→ 四处「待确认」占位', () => {
    const s = formatDraftFields({ productName: '', priceCents: 0, costCents: 0, shippingCents: 0 });
    expect(s.match(/待确认/g)).toHaveLength(4);
  });
});

describe('parseDraftCorrections — 修正指令解析（纯函数）', () => {
  it.each([
    ['价格 79', { priceCents: 7900 }],
    ['价格改成 79', { priceCents: 7900 }],
    ['售价：68.5', { priceCents: 6850 }],
    ['价格 88 元', { priceCents: 8800 }],
    ['成本 20', { costCents: 2000 }],
    ['进价 15', { costCents: 1500 }],
    ['运费 8', { shippingCents: 800 }],
    ['快递费改成 10', { shippingCents: 1000 }],
    ['价格待确认', { priceCents: 0 }],
    ['名称改成 苗绣杯垫', { productName: '苗绣杯垫' }],
    ['商品名称：蓝染围巾', { productName: '蓝染围巾' }],
    ['名称待确认', { productName: '' }],
  ])('%s → %j', (t, expected) => {
    expect(parseDraftCorrections(t)).toMatchObject(expected);
  });

  it('多字段一句全解析；「把/改成」填充词不碍事', () => {
    expect(parseDraftCorrections('价格 79，成本 20，运费 8')).toEqual({
      priceCents: 7900,
      costCents: 2000,
      shippingCents: 800,
    });
    expect(parseDraftCorrections('把价格改成 79')).toMatchObject({ priceCents: 7900 });
    expect(parseDraftCorrections('名称改成苗绣杯垫')).toMatchObject({ productName: '苗绣杯垫' });
  });

  it.each([
    '运费 8 是谁定的？', // 带提问不吞（残渣非填充词）
    '帮我看看价格 79', // 残留「看看」非填充词不吞
    '价格怎么定的？', // 无值
    '名称你定了吗？', // 无连接词不认（防误拦提问句）
    '确认', // 决定词不是修正
    '今天天气不错',
    '',
  ])('非纯修正指令不拦：%s', (t) => {
    expect(parseDraftCorrections(t)).toBeNull();
  });
});

describe('确认面商品字段 — handleDraft 播报 + takeInput 就地修正', () => {
  it('handleDraft 播报含商品字段：有值显示 ¥、可修正提示', async () => {
    const { pipeline, notices } = makePipeline();
    await pipeline.handleDraft('g1', DRAFT);
    const n = notices[notices.length - 1]!;
    expect(n.content).toContain('商品信息');
    expect(n.content).toContain('名称：苗绣杯垫');
    expect(n.content).toContain('售价：¥68.00');
    expect(n.content).toContain('成本：¥20.00');
    expect(n.content).toContain('运费：¥8.00');
    expect(n.content).toContain('名称改成');
  });

  it('缺依据草稿 → 确认面四处「待确认」占位（不编造）', async () => {
    const { pipeline, notices } = makePipeline();
    await pipeline.handleDraft('g1', {
      ...DRAFT,
      product_name: '',
      price_cents: 0,
      cost_cents: 0,
      shipping_cents: 0,
    });
    const n = notices[notices.length - 1]!;
    expect(n.content).toContain('名称：待确认');
    expect(n.content).toContain('售价：待确认');
    expect(n.content).toContain('成本：待确认');
    expect(n.content).toContain('运费：待确认');
    expect(n.content).not.toContain('¥'); // 一个臆造数字都不许出现
  });

  it('「价格改成 79」就地修正 → 重播确认块；随后「确认」照走审批门', async () => {
    const { pipeline, approvalStub, notices } = makePipeline();
    await pipeline.handleDraft('g1', DRAFT);
    expect(await pipeline.takeInput('g1', '价格改成 79')).toBe(true);
    const st = pipeline.getState('g1')!;
    expect(st.priceCents).toBe(7900);
    expect(st.productName).toBe('苗绣杯垫'); // 其余字段不动
    const fix = notices[notices.length - 1]!;
    expect(fix.content).toContain('已修正');
    expect(fix.content).toContain('售价：¥79.00');
    expect(approvalStub.calls).toHaveLength(0); // 修正不进审批门
    expect(await pipeline.takeInput('g1', '确认')).toBe(true);
    expect(approvalStub.calls).toHaveLength(1); // 确认照走
  });

  it('「名称待确认」清空商品名（落商品名回退博文标题）', async () => {
    const { pipeline } = makePipeline();
    await pipeline.handleDraft('g1', DRAFT);
    expect(await pipeline.takeInput('g1', '名称待确认')).toBe(true);
    expect(pipeline.getState('g1')!.productName).toBe('');
  });

  it('带提问/无关句不吞（照常派发返回 false，字段不动）', async () => {
    const { pipeline } = makePipeline();
    await pipeline.handleDraft('g1', DRAFT);
    expect(await pipeline.takeInput('g1', '运费 8 是谁定的？')).toBe(false);
    expect(pipeline.getState('g1')!.shippingCents).toBe(800);
    expect(await pipeline.takeInput('g1', '今天天气不错')).toBe(false);
    expect(pipeline.getState('g1')!.priceCents).toBe(6800);
  });

  it('审批门挂起期不吃修正（走各自语义，不打断门）', async () => {
    const { pipeline, approvalStub } = makePipeline();
    await pipeline.handleDraft('g1', DRAFT);
    expect(await pipeline.takeInput('g1', '确认')).toBe(true);
    expect(pipeline.getState('g1')!.phase).toBe('gate_brand');
    // 门挂起中：修正句不是决定 → false 照常派发（不改字段、不动门）
    expect(await pipeline.takeInput('g1', '价格改成 79')).toBe(false);
    expect(pipeline.getState('g1')!.priceCents).toBe(6800);
    expect(approvalStub.calls).toHaveLength(1);
  });
});
