/**
 * 新闻列表的取数（订阅源 + 条目）。
 *
 * 第二栏（选哪个源）和正文（按日期读条目）现在读同一份快照：
 * 加/删订阅源之后两边一起变，不用谁去通知谁。
 */
import { useSyncExternalStore } from 'react';
import { getNews, type NewsFeed, type NewsItem } from '@/shared/data/http/generic';

export interface NewsSnapshot {
  items: NewsItem[];
  feeds: NewsFeed[];
  state: 'loading' | 'ready' | 'error';
}

let snap: NewsSnapshot = { items: [], feeds: [], state: 'loading' };
let inflight = false;
let started = false;
const listeners = new Set<() => void>();

function emit(next: NewsSnapshot) {
  snap = next;
  for (const notify of listeners) notify();
}

/** force = true 时忽略缓存重取（刷新、加/删订阅源之后用）。 */
export async function loadNews(force = false): Promise<void> {
  if (inflight) return;
  if (started && !force) return;
  inflight = true;
  started = true;
  emit({ ...snap, state: 'loading' });
  try {
    const data = await getNews();
    emit({ items: data.items ?? [], feeds: data.feeds ?? [], state: 'ready' });
  } catch {
    emit({ ...snap, state: 'error' });
  } finally {
    inflight = false;
  }
}

export function useNews(): NewsSnapshot {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => snap,
    () => snap,
  );
}
