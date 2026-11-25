/**
 * NewsPane — 「新闻」的第二栏：这页要选的是**哪个订阅源**（对齐新闻站的分类栏）。
 *
 * 行上是源名与条目数，末行是「全部」。条目数与正文读同一份快照，
 * 刷新之后数字跟着变。
 */
import { useEffect } from 'react';
import { NEWS, PANE } from '@/shared/content/views';
import { loadNews, useNews } from '@/business/news/newsStore';

export function NewsPane({
  selected,
  onPick,
}: {
  selected?: string;
  onPick: (key: string) => void;
}) {
  const { items, feeds, state } = useNews();

  useEffect(() => {
    void loadNews();
  }, []);

  const countOf = (feedId: string) =>
    feedId ? items.filter((item) => item.feed_id === feedId).length : items.length;

  return (
    <aside className="pane" aria-label={PANE.feeds}>
      <div className="pane-scroll">
        {state === 'loading' && !items.length ? (
          <div className="pane-state">{PANE.loading}</div>
        ) : null}
        {state === 'error' ? <div className="pane-state">{PANE.loadFailed}</div> : null}

        <button
          type="button"
          className="pane-row"
          data-active={!selected ? 'true' : undefined}
          aria-pressed={!selected}
          onClick={() => onPick('')}
        >
          <span className="pane-row-text">
            <strong>{NEWS.all}</strong>
            <small>{countOf('')}</small>
          </span>
        </button>

        {feeds.map((feed) => (
          <button
            key={feed.feed_id}
            type="button"
            className="pane-row"
            data-active={selected === feed.feed_id ? 'true' : undefined}
            aria-pressed={selected === feed.feed_id}
            onClick={() => onPick(feed.feed_id)}
          >
            <span className="pane-row-text">
              <strong>{feed.name}</strong>
              <small>{countOf(feed.feed_id)}</small>
            </span>
          </button>
        ))}

        {state === 'ready' && !feeds.length ? (
          <div className="pane-state">{NEWS.noFeeds}</div>
        ) : null}
      </div>
    </aside>
  );
}
