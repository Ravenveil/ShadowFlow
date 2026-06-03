/**
 * map-limit.ts — 有界并发池(批 2 Phase 2b · B5)。
 *
 * 把 items 过 fn,最多 limit 个并发在跑,结果按输入顺序返回。任一 fn 抛错 → 整体 reject
 * (快速失败,与 Promise.all 一致语义)。limit ≤ 0 兜底为 1(串行)。
 * 用于 chat DAG 同层调度:防大团队同层 Promise.all 无限并发(= Phase 2a 的 MAX_FANOUT 缺口)。
 */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const n = items.length;
  const results: R[] = new Array(n);
  if (n === 0) return results;
  const cap = Math.max(1, Math.floor(limit));
  let next = 0;

  async function worker(): Promise<void> {
    // 每个 worker 不断领取下一个未处理的下标,直到取尽。
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const i = next++;
      if (i >= n) return;
      results[i] = await fn(items[i], i);
    }
  }

  const workers = Array.from({ length: Math.min(cap, n) }, () => worker());
  await Promise.all(workers); // 任一 worker reject → 整体 reject
  return results;
}
