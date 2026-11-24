/**
 * NewsView — 新闻看板（订阅源聚合 + 独立阅读主题）。
 *
 * 数据来自后端 /api/news/*，本组件不写死任何源名或条目。
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Plus, RefreshCw, X } from "lucide-react";
import { NEWS, NEWS_THEMES, type NewsTheme } from "../content/news";
import {
  addNewsFeed,
  getNews,
  refreshNews,
  removeNewsFeed,
  type NewsFeed,
  type NewsItem,
} from "./news-api";

const THEME_KEY = "sf-news-theme";

function readNewsTheme(): NewsTheme {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (NEWS_THEMES.some((t) => t.id === saved)) return saved as NewsTheme;
  } catch {
    /* 隐私模式忽略 */
  }
  return "paper";
}

/** 相对时间：刚刚 / N 分钟 / N 小时 / 昨天 / MM-DD。 */
function fmtNewsTime(iso: number): string {
  if (!iso) return "";
  const diff = Date.now() - iso;
  if (diff < 60_000) return "刚刚";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} 小时前`;
  if (diff < 172800_000) return "昨天";
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function NewsView() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [feeds, setFeeds] = useState<NewsFeed[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [feedId, setFeedId] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [theme, setTheme] = useState<NewsTheme>(readNewsTheme);
  const [addOpen, setAddOpen] = useState(false);
  const [addUrl, setAddUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const autoRefreshed = useRef(false);

  const load = async () => {
    const data = await getNews();
    setItems(data.items);
    setFeeds(data.feeds);
    setState("ready");
    return data.items.length;
  };

  const runRefresh = async () => {
    setRefreshing(true);
    setNotice(null);
    try {
      const report = await refreshNews();
      await load();
      setNotice(
        report.failed.length > 0
          ? `${NEWS.failed(report.failed.length)} · ${NEWS.updated(report.added)}`
          : NEWS.updated(report.added),
      );
    } catch {
      setNotice(NEWS.loadFailed);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    let alive = true;
    load()
      .then((count) => {
        // 首次进入且本地无缓存时静默抓取一次
        if (alive && count === 0 && !autoRefreshed.current) {
          autoRefreshed.current = true;
          void runRefresh();
        }
      })
      .catch(() => {
        if (alive) setState("error");
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* 隐私模式忽略 */
    }
  }, [theme]);

  const visible = useMemo(
    () => (feedId ? items.filter((i) => i.feed_id === feedId) : items),
    [items, feedId],
  );

  const submitFeed = async () => {
    const url = addUrl.trim();
    if (!url || adding) return;
    setAdding(true);
    setNotice(null);
    try {
      await addNewsFeed(url);
      setAddUrl("");
      setAddOpen(false);
      setNotice(NEWS.added);
      await load();
      void runRefresh();
    } catch {
      setNotice(NEWS.loadFailed);
    } finally {
      setAdding(false);
    }
  };

  const dropFeed = async (id: string) => {
    try {
      await removeNewsFeed(id);
      if (feedId === id) setFeedId("");
      await load();
    } catch {
      setNotice(NEWS.loadFailed);
    }
  };

  return (
    <section className="sf-subview news-view" data-news-theme={theme}>
      <header className="news-head">
        <h1>{NEWS.title}</h1>
        <div className="news-head-actions">
          <div className="news-themes" role="group">
            {NEWS_THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                data-active={theme === t.id ? "true" : undefined}
                onClick={() => setTheme(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="news-refresh"
            onClick={() => void runRefresh()}
            disabled={refreshing}
            title={NEWS.refresh}
          >
            {refreshing ? <Loader2 size={14} className="sf-spin" /> : <RefreshCw size={14} />}
            {refreshing ? NEWS.refreshing : NEWS.refresh}
          </button>
        </div>
      </header>

      <div className="news-bar">
        <div className="news-chips">
          <button
            type="button"
            data-active={feedId === "" ? "true" : undefined}
            onClick={() => setFeedId("")}
          >
            {NEWS.all}
          </button>
          {feeds.map((feed) => (
            <span key={feed.feed_id} className="news-chip" data-active={feedId === feed.feed_id ? "true" : undefined}>
              <button type="button" onClick={() => setFeedId(feed.feed_id)}>
                {feed.name}
              </button>
              <button
                type="button"
                className="news-chip-x"
                title={NEWS.deleteFeed}
                aria-label={NEWS.deleteFeed}
                onClick={() => void dropFeed(feed.feed_id)}
              >
                <X size={9} />
              </button>
            </span>
          ))}
          <button type="button" className="news-add" onClick={() => setAddOpen((v) => !v)}>
            <Plus size={12} />
            {NEWS.addFeed}
          </button>
        </div>

        {addOpen && (
          <form
            className="news-add-form"
            onSubmit={(e) => {
              e.preventDefault();
              void submitFeed();
            }}
          >
            <input
              autoFocus
              value={addUrl}
              onChange={(e) => setAddUrl(e.currentTarget.value)}
              placeholder={NEWS.addPlaceholder}
            />
            <button type="submit" disabled={adding}>
              {adding ? <Loader2 size={12} className="sf-spin" /> : NEWS.add}
            </button>
          </form>
        )}
      </div>

      {notice && <p className="news-notice">{notice}</p>}

      {state === "loading" ? (
        <p className="news-empty">
          <Loader2 size={14} className="sf-spin" />
        </p>
      ) : state === "error" ? (
        <p className="news-empty">{NEWS.loadFailed}</p>
      ) : visible.length === 0 ? (
        <p className="news-empty">{NEWS.empty}</p>
      ) : (
        <div className="news-grid">
          {visible.map((item) => (
            <a
              key={item.item_id}
              className="news-card"
              href={item.link}
              target="_blank"
              rel="noreferrer"
            >
              <div className="news-card-meta">
                <span className="news-source">{item.source}</span>
                <time>{fmtNewsTime(item.published_at)}</time>
              </div>
              <h3>{item.title}</h3>
              {item.summary && <p>{item.summary}</p>}
            </a>
          ))}
        </div>
      )}
    </section>
  );
}
