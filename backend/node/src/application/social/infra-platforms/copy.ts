/**
 * social-platforms/copy.ts — 商品一键生成营销帖文案（2026-11-07）。
 *
 * 产业方向（手工艺人代运营）：手工艺人只上架商品，营销文案由我们产出。
 * 纯模板函数：不调 LLM（离线可测、零成本、输出确定）；后续要换 LLM 生成
 * 只替换本文件实现，storage / route 调用面不变。
 *
 * 口径：金额整数分进、¥ 展示出；文案按平台规格自动截断，保证产出直接过
 * createPost 校验，不会生成一条发不出去的帖子。
 */

import { findPlatform } from './index';

export interface ProductBrief {
  name: string;
  price_cents: number;
}

export interface MarketingCopy {
  title: string;
  content: string;
}

export function formatPrice(cents: number): string {
  const safe = Number.isFinite(cents) && cents > 0 ? cents : 0;
  return safe % 100 === 0 ? `¥${safe / 100}` : `¥${(safe / 100).toFixed(2)}`;
}

function clip(text: string, max: number): string {
  return max > 0 && text.length > max ? text.slice(0, max) : text;
}

/**
 * 按平台风味生成标题 + 正文。风格差异是刻意的：
 * 公众号讲手作故事、小红书种草带话题、抖音/快手口语短句、微博带话题词。
 */
export function marketingCopy(product: ProductBrief, platform: string): MarketingCopy {
  const spec = findPlatform(platform);
  const price = formatPrice(product.price_cents);
  const name = product.name.trim() || '手作好物';

  let title = '';
  let content = '';
  switch (platform) {
    case 'wechat_mp':
      title = `手作上新｜${name}`;
      content =
        `一件${name}，从手工艺人的工作台到你手中。\n\n` +
        `纯手工制作，每一件都带着手作的温度。售价 ${price}，` +
        `你的每一次购买，都是在支持一位认真生活的人靠手艺养活自己。\n\n` +
        `喜欢可以直接下单，我们会仔细打包、尽快寄出。`;
      break;
    case 'xiaohongshu':
      title = `${name}｜手作控必收`;
      content =
        `${name}到手啦！纯手工制作，质感真的绝\n\n` +
        `售价 ${price}，手作的温度是流水线给不了的\n` +
        `每一件背后都是一位手工艺人的认真生活\n\n` +
        `#手作 #好物推荐 #手工制作 #支持手艺人`;
      break;
    case 'douyin':
      title = name;
      content =
        `${name}，纯手工做的，${price}。` +
        `手艺人一针一线做出来的东西，真的不一样。喜欢的扣 1 #手作 #手工`;
      break;
    case 'weibo':
      content =
        `#手作好物# ${name}，纯手工制作，售价 ${price}。` +
        `每一件都是一位手工艺人的心血，购买即支持手艺人自食其力。喜欢的私信下单，仔细打包尽快寄出。`;
      break;
    case 'shipinhao':
      title = clip(name, 16);
      content = `${name}，纯手工制作，${price}。手作的温度，看得见。喜欢点这里下单。`;
      break;
    case 'kuaishou':
      content =
        `家人们看看这件${name}，纯手工做的，${price}。` +
        `实实在在的手艺活，不糊弄人。喜欢的直接拍，打包好就发。`;
      break;
    default:
      title = name;
      content = `${name}，纯手工制作，售价 ${price}。`;
  }

  return {
    title: clip(title, spec?.title_max ?? 0),
    content: clip(content, spec?.content_max ?? 500),
  };
}

// ─── 内容契约（《内容生成规范与模板库》第三章，2026-11-07）───────────────────
// 所有内容生成统一输出结构化契约对象，直接映射 sp_posts 落库（status=draft），
// 进入「草稿→审核→发布」链路。template() 是 marketingCopy 的契约化扩展：
// 生成面仍走纯模板（离线可测、零成本、输出确定），返回面补齐九字段。
// 模板骨架取自规范 T1-T8；brief 未提供的字段标「待补」不编造（铁律）。

import { lintContent, type LintResult } from './compliance-lint';

/** 规范第三章 format 枚举（任务类型）。 */
export type ContentFormat =
  | 'note' // T1 小红书种草笔记
  | 'short_video' // T2 抖音口播脚本（视频号/快手变体）
  | 'moments' // T3 朋友圈/社媒短文案（微博 T5 变体）
  | 'article' // T4 公众号品牌长文
  | 'detail_page' // T6 电商详情页
  | 'csr_proposal' // T7 CSR 企业采购提案（B 端）
  | 'product_card' // T8 商品卡短描述
  | 'service_reply'; // T8 客服话术

export const CONTENT_FORMATS: ContentFormat[] = [
  'note',
  'short_video',
  'moments',
  'article',
  'detail_page',
  'csr_proposal',
  'product_card',
  'service_reply',
];

export function isContentFormat(v: unknown): v is ContentFormat {
  return typeof v === 'string' && (CONTENT_FORMATS as string[]).includes(v);
}

/** media[] 契约形态：只出视觉指导提示词，不直接生图（规范第三章）。 */
export interface MediaGuide {
  type: 'image' | 'video';
  prompt: string;
}

/** 内容契约对象（规范第三章九字段），直接映射 sp_posts。 */
export interface ContentContract {
  platform: string;
  format: ContentFormat;
  title: string;
  content: string;
  tags: string[];
  cta: string;
  media: MediaGuide[];
  /** 固定 true——AI 生成内容显式标识（法定义务，V07 未核前保守全带标）。 */
  ai_label: boolean;
  label_text: string;
  /** 合规 lint 结果（词表/结构/标识三道机器检查；人工门在发布链）。 */
  compliance: LintResult;
}

const LABEL_TEXT = '内容由 AI 生成';

/**
 * template(format, brief, platform) → 契约对象（规范第六章对接清单 ①）。
 * 标题/正文按平台 title_max/content_max 硬裁剪，保证产出直接过 createPost 校验。
 */
export function template(
  format: ContentFormat,
  brief: ProductBrief,
  platform: string,
): ContentContract {
  const spec = findPlatform(platform);
  const name = brief.name.trim() || '手作好物';
  const price = formatPrice(brief.price_cents);
  const copy = marketingCopy(brief, platform);

  let title = copy.title;
  let content = copy.content;
  let tags: string[] = [];
  let cta = '';
  let media: MediaGuide[] = [];

  switch (format) {
    case 'note': // T1：人群/场景+情绪标题 → 体验主体 → 小缺点/建议 → 站内引导 → 话题标签 5-8
      tags = ['#手作', '#好物推荐', '#手工制作', '#支持手艺人', '#手作控必收'];
      cta = '喜欢的评论区聊聊，进主页看更多手作';
      media = [
        { type: 'image', prompt: `${name} 自然光俯拍特写，麻布/木桌背景` },
        { type: 'image', prompt: `手工艺人制作${name}的工作台场景` },
      ];
      break;
    case 'short_video': // T2：时间轴表（时间｜口播台词｜画面标注｜字幕要点）
      title = clip(name, spec?.title_max ?? 16);
      content = [
        `【0-3s 钩子】你见过真正纯手工做的${name}吗？| 画面：成品特写 | 字幕：纯手工`,
        `【3-8s 痛点】流水线千篇一律，手作每件都不同。| 画面：对比镜头 | 字幕：手作的温度`,
        `【8-20s 卖点】${name}，纯手工制作，${price}。| 画面：工艺细节 | 字幕：${price}`,
        `【20-30s 演示】使用/摆放演示。| 画面：使用场景 | 字幕：`,
        `【末 5s CTA】喜欢的扣 1。| 画面：成品+字幕 | 字幕：扣 1`,
      ].join('\n');
      tags = ['#手作', '#手工'];
      cta = '喜欢的扣 1';
      media = [{ type: 'video', prompt: `${name} 制作过程竖版短视频，15-30s，真实感优先` }];
      break;
    case 'moments': // T3：一句主张 + 一个细节 + 一个行动；微博（T5）带 2-3 个话题
      tags = platform === 'weibo' ? ['#手作好物#', '#支持手艺人#'] : [];
      cta = '想看的扣 1，想买的私信';
      media = [{ type: 'image', prompt: `${name} 生活场景实拍，自然光` }];
      break;
    case 'article': // T4：双段式标题 → 场景/工艺 → 产品清单与价格 → 下单方式 → AIGC 声明块
      content = `${copy.content}\n\n【产品清单】${name} · ${price}\n【AIGC 声明】${LABEL_TEXT}`;
      tags = [];
      cta = '喜欢可以直接下单，我们会仔细打包、尽快寄出';
      media = [
        { type: 'image', prompt: `${name} 工艺细节组图` },
        { type: 'image', prompt: '手工艺人工作台场景' },
      ];
      break;
    case 'detail_page': // T6：首屏主张 → 参数 → 规格 → 养护 → 包装 → 购买须知 → 资质声明
      title = clip(`${name}｜产品详情`, spec?.title_max ?? 0);
      content = [
        `【首屏主张】${name}，纯手工制作，${price}。`,
        '【材质工艺】待补：材质与工艺参数（商家提供，不编造）。',
        '【尺寸规格】待补：尺寸规格表（商家提供）。',
        '【使用与养护】待补：使用与养护说明。',
        '【包装清单】待补：包装清单。',
        '【购买须知】发货/退换规则以商家公示为准。',
        '【资质与检测】待补：检测报告/备案编号（无资质不写功效）。',
      ].join('\n');
      tags = [];
      cta = '下单前请阅读购买须知';
      media = [{ type: 'image', prompt: `${name} 白底细节图 + 尺寸参照图` }];
      break;
    case 'csr_proposal': // T7：ESG 主张 → 礼盒方案 → 交付开票 → 公益叙事（克制）→ 案例 → 下一步
      title = clip(`${name}｜企业采购礼盒方案`, spec?.title_max ?? 0);
      content = [
        '【企业价值主张】以手作礼盒支持手工艺人自食其力（ESG / 员工关怀视角）。',
        `【礼盒方案】基于${name}（单件 ${price}）组合礼盒；规格/定制/价位带待与商家确认。`,
        '【交付与开票】待补：交付周期与开票信息。',
        '【公益叙事】创作者视角克制陈述，不渲染苦难、不贴标签、不承诺捐款分成。',
        '【案例与数据】待补。',
        '【下一步】欢迎联系洽谈。',
      ].join('\n');
      tags = [];
      cta = '欢迎联系洽谈';
      media = [{ type: 'image', prompt: `${name} 礼盒包装效果图` }];
      break;
    case 'product_card': // T8 商品卡：≤50 字三段（材质 + 工艺 + 使用场景）
      title = clip(name, spec?.title_max ?? 20);
      content = clip(`${name}｜材质：详询客服，用料实在 | 工艺：纯手工制作 | 场景：桌面陈设、日常使用`, 50);
      tags = [];
      cta = '详询客服';
      media = [{ type: 'image', prompt: `${name} 商品主图，干净背景` }];
      break;
    case 'service_reply': // T8 客服话术：售前 3 问 + 售后 2 类，禁承诺功效与绝对化
      title = clip(`${name}｜客服话术`, spec?.title_max ?? 0);
      content = [
        `【售前·材质】Q：${name}什么材质？A：手工选材制作，具体材质详询客服确认。`,
        '【售前·发货】Q：多久发货？A：下单后仔细打包尽快寄出，具体时效以店铺公示为准。',
        '【售前·定制】Q：能定制吗？A：支持定制咨询，详询客服。',
        '【售后·退换】非人为损坏按店铺退换规则处理。',
        '【售后·破损赔付】运输破损包赔，签收时请当面检查。',
        '（话术纪律：禁承诺功效、禁绝对化用语。）',
      ].join('\n');
      tags = [];
      cta = '详询客服';
      media = [];
      break;
  }

  const safeTitle = clip(title, spec?.title_max ?? 0);
  const safeContent = clip(content, spec?.content_max ?? 500);
  return {
    platform,
    format,
    title: safeTitle,
    content: safeContent,
    tags,
    cta,
    media,
    ai_label: true,
    label_text: LABEL_TEXT,
    // 三道机器检查随契约一并给出；命中红线由人工门打回（规范第五章）。
    compliance: lintContent({
      platform,
      title: safeTitle,
      content: safeContent,
      ai_label: true,
      label_text: LABEL_TEXT,
    }),
  };
}
