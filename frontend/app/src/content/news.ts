/**
 * news.ts — 新闻看板文案（组件不内联字面量）。
 */

export const NEWS_THEMES = [
  { id: "paper", label: "纸感" },
  { id: "warm", label: "暖褐" },
  { id: "night", label: "夜间" },
] as const;

export type NewsTheme = (typeof NEWS_THEMES)[number]["id"];

export const NEWS = {
  title: "新闻",
  refresh: "刷新",
  refreshing: "抓取中…",
  all: "全部",
  addFeed: "添加订阅",
  addPlaceholder: "RSS / Atom 链接",
  add: "添加",
  deleteFeed: "取消订阅",
  empty: "暂无内容，点击刷新抓取订阅源",
  loadFailed: "新闻加载失败",
  updated: (n: number) => `已更新 ${n} 条`,
  failed: (n: number) => `${n} 个订阅源抓取失败`,
  added: "订阅已添加",
} as const;
