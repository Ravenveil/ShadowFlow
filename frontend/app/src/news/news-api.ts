/**
 * news-api.ts — 新闻看板的 HTTP 契约（对应后端 domains/news/adapters/news.ts）。
 */

import { apiFetch } from "../chat-api";

export interface NewsFeed {
  feed_id: string;
  name: string;
  url: string;
  enabled: boolean;
  added_at: number;
}

export interface NewsItem {
  item_id: string;
  feed_id: string;
  source: string;
  title: string;
  link: string;
  summary: string;
  published_at: number;
  fetched_at: number;
}

export interface NewsListResponse {
  items: NewsItem[];
  feeds: NewsFeed[];
}

export interface NewsRefreshReport {
  added: number;
  total: number;
  failed: { feed: string; reason: string }[];
}

export function getNews(limit = 120): Promise<NewsListResponse> {
  return apiFetch<NewsListResponse>(`/api/news/items?limit=${limit}`);
}

export function getNewsFeeds(): Promise<{ feeds: NewsFeed[]; items: number }> {
  return apiFetch<{ feeds: NewsFeed[]; items: number }>("/api/news/feeds");
}

export function refreshNews(): Promise<NewsRefreshReport> {
  return apiFetch<NewsRefreshReport>("/api/news/refresh", { method: "POST" });
}

export function addNewsFeed(url: string, name?: string): Promise<{ feed: NewsFeed }> {
  return apiFetch<{ feed: NewsFeed }>("/api/news/feeds", {
    method: "POST",
    body: JSON.stringify({ url, name }),
  });
}

export function removeNewsFeed(feedId: string): Promise<null> {
  return apiFetch<null>(`/api/news/feeds/${encodeURIComponent(feedId)}`, { method: "DELETE" });
}
