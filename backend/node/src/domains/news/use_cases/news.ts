/**
 * news 域 — 用例（内部，应用编排）。
 *
 * 依赖注入 repository / fetchFeed，便于测试与替换传输方式。
 */

import {
  createFeed,
  itemIdOf,
  mergeItems,
  type NewsFeed,
  type NewsItem,
  type RawNews,
} from '../model';
import type { NewsRepository } from '../repository';

export type Result<T> =
  | { kind: 'ok'; value: T }
  | { kind: 'not_found' }
  | { kind: 'invalid'; code: string };

export interface NewsDeps {
  repo: NewsRepository;
  fetchFeed: (url: string) => Promise<RawNews[]>;
  now?: () => number;
  newId?: () => string;
}

export function listFeeds(deps: NewsDeps): { feeds: NewsFeed[]; items: number } {
  const store = deps.repo.load();
  return { feeds: store.feeds, items: store.items.length };
}

export function listItems(
  deps: NewsDeps,
  query: { feedId?: string; limit?: number } = {},
): { items: NewsItem[]; feeds: NewsFeed[] } {
  const store = deps.repo.load();
  const limit = Math.min(Math.max(query.limit ?? 80, 1), 200);
  const items = (query.feedId ? store.items.filter((i) => i.feed_id === query.feedId) : store.items).slice(0, limit);
  return { items, feeds: store.feeds };
}

export function addFeed(deps: NewsDeps, input: { url?: unknown; name?: unknown }): Result<NewsFeed> {
  const url = typeof input.url === 'string' ? input.url : '';
  const name = typeof input.name === 'string' ? input.name : undefined;
  let feed: NewsFeed;
  try {
    feed = createFeed(url, name, { now: deps.now, newId: deps.newId });
  } catch (err) {
    return { kind: 'invalid', code: err instanceof Error ? err.message : 'INVALID_URL' };
  }
  const store = deps.repo.load();
  if (store.feeds.some((f) => f.url === feed.url)) {
    return { kind: 'invalid', code: 'FEED_EXISTS' };
  }
  deps.repo.persist({ ...store, feeds: [...store.feeds, feed] });
  return { kind: 'ok', value: feed };
}

export function removeFeed(deps: NewsDeps, feedId: string): Result<{ feed_id: string }> {
  const store = deps.repo.load();
  if (!store.feeds.some((f) => f.feed_id === feedId)) return { kind: 'not_found' };
  deps.repo.persist({
    feeds: store.feeds.filter((f) => f.feed_id !== feedId),
    items: store.items.filter((i) => i.feed_id !== feedId),
  });
  return { kind: 'ok', value: { feed_id: feedId } };
}

export interface RefreshReport {
  added: number;
  total: number;
  failed: { feed: string; reason: string }[];
}

/** 并发抓取所有启用的订阅源，合并去重后落盘。 */
export async function refreshNews(deps: NewsDeps): Promise<RefreshReport> {
  const store = deps.repo.load();
  const now = (deps.now ?? (() => Date.now()))();
  const enabled = store.feeds.filter((f) => f.enabled);
  const failed: RefreshReport['failed'] = [];
  const incoming: NewsItem[] = [];

  const outcomes = await Promise.allSettled(enabled.map((feed) => deps.fetchFeed(feed.url)));
  outcomes.forEach((outcome, index) => {
    const feed = enabled[index];
    if (outcome.status === 'rejected') {
      failed.push({
        feed: feed.name,
        reason: outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason),
      });
      return;
    }
    for (const raw of outcome.value) {
      incoming.push({
        item_id: itemIdOf(feed.feed_id, raw.link),
        feed_id: feed.feed_id,
        source: feed.name,
        title: raw.title,
        link: raw.link,
        summary: raw.summary,
        published_at: raw.publishedAt,
        fetched_at: now,
      });
    }
  });

  const before = store.items.length;
  const items = mergeItems(store.items, incoming);
  deps.repo.persist({ feeds: store.feeds, items });
  return { added: Math.max(0, items.length - before), total: items.length, failed };
}
