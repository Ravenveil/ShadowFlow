/**
 * news 域 — 领域模型（内部，业务变化驱动）
 *
 * 新闻看板：订阅源 + 聚合条目。纯领域，禁止 import express / fs / 网络库。
 */

export interface NewsFeed {
  feed_id: string;
  name: string;
  url: string;
  enabled: boolean;
  added_at: number;
}

/** LLM 内容管线产物（AIHOT 式：评分 + 中文改写 + 推荐 + 分类）。 */
export type NewsCategory = 'model' | 'industry' | 'opinion' | 'product' | 'dev';

export interface NewsVerdict {
  /** 0-10 价值分，一位小数。 */
  score: number;
  title_zh?: string;
  summary_zh?: string;
  reason?: string;
  category?: NewsCategory;
}

export interface NewsItem {
  /** 稳定 id：feed_id + 链接，去重与前端 key 共用。 */
  item_id: string;
  feed_id: string;
  source: string;
  title: string;
  link: string;
  summary: string;
  /** epoch ms；无法解析时为 0。 */
  published_at: number;
  fetched_at: number;
  /** LLM 评分产物；未评分（管线失败/未跑）为 undefined，界面按无分渲染。 */
  verdict?: NewsVerdict;
}

export interface NewsStore {
  feeds: NewsFeed[];
  items: NewsItem[];
}

export interface RawNews {
  title: string;
  link: string;
  summary: string;
  publishedAt: number;
}

/** 首次运行的内置订阅源（后端配置，前端不写死任何源名）。 */
export const DEFAULT_FEEDS: ReadonlyArray<{ name: string; url: string }> = [
  { name: "36氪", url: "https://36kr.com/feed" },
  { name: "少数派", url: "https://sspai.com/feed" },
  { name: "Hacker News", url: "https://hnrss.org/frontpage" },
];

export const NAME_MAX = 60;
export const ITEMS_CAP = 400;
export const SUMMARY_MAX = 240;

/** http(s) 归一：去空白；协议或主机不合法返回 null。 */
export function normalizeFeedUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const url = raw.trim();
  if (!/^https?:\/\//i.test(url)) return null;
  try {
    const parsed = new URL(url);
    return parsed.hostname ? parsed.toString() : null;
  } catch {
    return null;
  }
}

/** 从 URL 推导默认源名（hostname 去 www.）。 */
export function defaultFeedName(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return url;
  }
}

export function createFeed(
  url: string,
  name?: string,
  deps: { now?: () => number; newId?: () => string } = {},
): NewsFeed {
  const normalized = normalizeFeedUrl(url);
  if (!normalized) throw new Error("INVALID_URL");
  const label = (name ?? "").trim();
  if (label.length > NAME_MAX) throw new Error("NAME_TOO_LONG");
  return {
    feed_id: (deps.newId ?? (() => crypto.randomUUID()))(),
    name: label || defaultFeedName(normalized),
    url: normalized,
    enabled: true,
    added_at: (deps.now ?? (() => Date.now()))(),
  };
}

export function itemIdOf(feedId: string, link: string): string {
  return `${feedId}::${link}`;
}

/** 合并抓取结果：按 item_id 去重，保留新抓取内容，按发布时间倒序并截断。 */
export function mergeItems(
  existing: readonly NewsItem[],
  incoming: readonly NewsItem[],
): NewsItem[] {
  const map = new Map<string, NewsItem>();
  for (const item of existing) map.set(item.item_id, item);
  for (const item of incoming) map.set(item.item_id, item);
  return [...map.values()]
    .sort((a, b) => b.published_at - a.published_at || b.fetched_at - a.fetched_at)
    .slice(0, ITEMS_CAP);
}
