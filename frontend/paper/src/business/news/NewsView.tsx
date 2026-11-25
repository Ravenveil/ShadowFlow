/**
 * NewsView — 新闻（工作台子页）。
 *
 * 形态对齐新闻站：**按日期分组的密集列表**（每条：序号 · 来源 · 时分 · 标题 · 摘要），
 * 不是一排大卡片。选哪个订阅源由第二栏（NewsPane）决定，页头大字就是源名，
 * 所以正文里不再摆一排源标签。
 */
import { useEffect, useMemo, useState } from 'react';
import { NEWS, SUBVIEW } from '@/shared/content/views';
import { IconSearch } from '@/shared/ui/icons';
import { clockLabel } from '@/shared/ui/format';
import { addNewsFeed, removeNewsFeed, refreshNews, type NewsItem } from '@/shared/data/http/generic';
import { loadNews, useNews } from '@/business/news/newsStore';

const dayFmt = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' });

/** 分类 key → 文案（顺序即筛选条顺序）。 */
const CATEGORY_TABS: { key: string; label: string }[] = [
  { key: '', label: NEWS.catAll },
  { key: 'model', label: NEWS.catModel },
  { key: 'industry', label: NEWS.catIndustry },
  { key: 'opinion', label: NEWS.catOpinion },
  { key: 'product', label: NEWS.catProduct },
  { key: 'dev', label: NEWS.catDev },
];

/** RSS 摘要常带内联 HTML（<a href=…>查看全文</a>），上屏前剥掉标签与多余空白。 */
function plainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 按自然日分组：组内按发布时间倒序，序号在这里就排好。 */
function groupByDay(items: NewsItem[]): { key: string; label: string; items: NewsItem[] }[] {
  const sorted = [...items].sort((a, b) => (b.published_at ?? 0) - (a.published_at ?? 0));
  const groups: { key: string; label: string; items: NewsItem[] }[] = [];
  for (const item of sorted) {
    const ts = item.published_at ?? 0;
    const key = ts ? new Date(ts).toDateString() : '';
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.items.push(item);
      continue;
    }
    groups.push({ key, label: key ? dayFmt.format(new Date(ts)) : NEWS.noDate, items: [item] });
  }
  return groups;
}

export default function NewsView({ selected }: { selected?: string }) {
  const { items, feeds, state } = useNews();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addUrl, setAddUrl] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    void loadNews();
  }, []);

  const activeFeed = feeds.find((feed) => feed.feed_id === selected) ?? null;

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = items.filter((item) => {
      if (activeFeed && item.feed_id !== activeFeed.feed_id) return false;
      if (category && item.verdict?.category !== category) return false;
      if (!q) return true;
      return (
        (item.title ?? '').toLowerCase().includes(q) ||
        (item.verdict?.title_zh ?? '').toLowerCase().includes(q) ||
        (item.summary ?? '').toLowerCase().includes(q) ||
        (item.source ?? '').toLowerCase().includes(q)
      );
    });
    return groupByDay(filtered);
  }, [items, activeFeed, query, category]);

  const runRefresh = async () => {
    setRefreshing(true);
    setNotice(null);
    try {
      const report = await refreshNews();
      await loadNews(true);
      const failures = report.failed?.length ?? 0;
      const enriched = report.enriched ?? 0;
      const parts = [failures > 0 ? NEWS.failed(failures) : null, NEWS.updated(report.added)];
      if (enriched > 0) parts.push(NEWS.enriched(enriched));
      setNotice(parts.filter(Boolean).join(' · '));
    } catch {
      setNotice(NEWS.loadFailed);
    } finally {
      setRefreshing(false);
    }
  };

  const submitFeed = async () => {
    const url = addUrl.trim();
    if (!url || adding) return;
    setAdding(true);
    setNotice(null);
    try {
      await addNewsFeed(url);
      setAddUrl('');
      setAddOpen(false);
      setNotice(NEWS.added);
      await loadNews(true);
    } catch {
      setNotice(NEWS.loadFailed);
    } finally {
      setAdding(false);
    }
  };

  const dropFeed = async () => {
    if (!activeFeed) return;
    try {
      await removeNewsFeed(activeFeed.feed_id);
      await loadNews(true);
    } catch {
      setNotice(NEWS.loadFailed);
    }
  };

  return (
    <section className="subview">
      <header className="subview-head">
        <h1 className="subview-title">{activeFeed ? activeFeed.name : NEWS.title}</h1>
      </header>

      <div className="subview-toolbar">
        <button
          className="subview-btn"
          data-primary="true"
          type="button"
          onClick={() => void runRefresh()}
          disabled={refreshing}
        >
          {refreshing ? NEWS.refreshing : NEWS.refresh}
        </button>
        <button
          className="subview-btn"
          type="button"
          onClick={() => setAddOpen((open) => !open)}
          aria-expanded={addOpen}
        >
          {NEWS.addFeed}
        </button>
        {activeFeed ? (
          <button className="subview-btn" type="button" onClick={() => void dropFeed()}>
            {NEWS.deleteFeed}
          </button>
        ) : null}
        <label className="subview-search">
          <IconSearch size={14} />
          <input
            className="subview-input"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            aria-label={NEWS.title}
          />
        </label>
      </div>

      {addOpen ? (
        <form
          className="subview-form"
          onSubmit={(e) => {
            e.preventDefault();
            void submitFeed();
          }}
        >
          <input
            className="subview-input"
            value={addUrl}
            onChange={(e) => setAddUrl(e.currentTarget.value)}
            placeholder={NEWS.addPlaceholder}
            aria-label={NEWS.addFeed}
          />
          <button
            className="subview-btn"
            data-primary="true"
            type="submit"
            disabled={adding || !addUrl.trim()}
          >
            {NEWS.add}
          </button>
        </form>
      ) : null}

      {notice ? (
        <p className="subview-blurb" role="status">
          {notice}
        </p>
      ) : null}

      <div className="news-cats" role="tablist" aria-label={NEWS.catLabel}>
        {CATEGORY_TABS.map((tab) => (
          <button
            key={tab.key}
            className="news-cat"
            type="button"
            data-active={category === tab.key}
            onClick={() => setCategory(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {state === 'loading' && !items.length ? (
        <div className="subview-state">{SUBVIEW.loading}</div>
      ) : state === 'error' ? (
        <div className="subview-state">
          <span>{NEWS.loadFailed}</span>
          <button className="subview-btn" type="button" onClick={() => void loadNews(true)}>
            {SUBVIEW.retry}
          </button>
        </div>
      ) : groups.length === 0 ? (
        <div className="subview-state">{NEWS.empty}</div>
      ) : (
        <div className="news-feed">
          {groups.map((group) => (
            <section className="news-day" key={group.key || 'undated'}>
              <h2 className="news-day-head">{group.label}</h2>
              <ol className="news-list">
                {group.items.map((item, i) => {
                  const v = item.verdict;
                  return (
                    <li className="news-item" key={item.item_id}>
                      <span className="news-no">{String(i + 1).padStart(2, '0')}</span>
                      <div className="news-body">
                        <div className="news-meta">
                          <span className="news-src">{item.source}</span>
                          <span className="news-time">{clockLabel(item.published_at)}</span>
                          {v ? (
                            <span className="news-score" data-high={v.score >= 7}>
                              {NEWS.scoreBy(v.score)}
                            </span>
                          ) : null}
                          {v?.category ? (
                            <span className="news-cat-tag">
                              {CATEGORY_TABS.find((t) => t.key === v.category)?.label ?? v.category}
                            </span>
                          ) : null}
                        </div>
                        <h3 className="news-title">
                          <a href={item.link} target="_blank" rel="noreferrer">
                            {v?.title_zh || item.title}
                          </a>
                        </h3>
                        {v?.summary_zh || v?.reason ? (
                          <p className="news-summary">
                            {v?.summary_zh}
                            {v?.summary_zh && v?.reason ? ' —— ' : ''}
                            {v?.reason}
                          </p>
                        ) : item.summary ? (
                          <p className="news-summary">{plainText(item.summary)}</p>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
