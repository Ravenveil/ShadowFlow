/**
 * createListStore — 一份列表，两处界面共用同一个快照。
 *
 * 为什么要它：第二栏（选谁）和正文（看谁）现在是两块并排的组件。
 * 各自 useEffect 各拉一次，就会得到两份会分叉的快照 —— 正文里新建完一条，
 * 左边那列还是旧的；网络差的时候还会一先一后各闪一次加载态。
 *
 * 这里只做最小的三件事：留一个快照、最多一次在飞、变了通知订阅者。
 * 一次性页面（新闻 / 定时 / 主机）照旧自己取，只有「列表 + 详情」这种
 * 成对出现的才需要它。
 */
import { useSyncExternalStore } from 'react';

export interface ListSnapshot<T> {
  items: T[];
  state: 'loading' | 'ready' | 'error';
}

export interface ListStore<T> {
  /** force = true 时忽略缓存重取（新建 / 删除之后要让两处立刻一致）。 */
  load: (force?: boolean) => Promise<void>;
  /** 组件侧订阅：快照变了就重渲染。 */
  useList: () => ListSnapshot<T>;
}

export function createListStore<T>(fetcher: () => Promise<T[]>): ListStore<T> {
  let snap: ListSnapshot<T> = { items: [], state: 'loading' };
  let inflight = false;
  let started = false;
  const listeners = new Set<() => void>();

  function emit(next: ListSnapshot<T>) {
    snap = next;
    for (const notify of listeners) notify();
  }

  async function load(force = false): Promise<void> {
    if (inflight) return;
    // 已取过就直接用缓存：切视图回来不该再闪一次「加载中」。
    if (started && !force) return;
    inflight = true;
    started = true;
    emit({ items: snap.items, state: 'loading' });
    try {
      const items = await fetcher();
      emit({ items: Array.isArray(items) ? items : [], state: 'ready' });
    } catch {
      // 取失败保留上一次的列表：错误提示比空白更有用。
      emit({ items: snap.items, state: 'error' });
    } finally {
      inflight = false;
    }
  }

  function useList(): ListSnapshot<T> {
    return useSyncExternalStore(
      (onChange) => {
        listeners.add(onChange);
        return () => listeners.delete(onChange);
      },
      () => snap,
      () => snap,
    );
  }

  return { load, useList };
}
