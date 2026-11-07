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
