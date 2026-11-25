/**
 * news 域 — Repository 接口（内部，依赖倒置点）。
 */

import type { NewsStore } from './model';

export interface NewsRepository {
  load(): NewsStore;
  persist(store: NewsStore): void;
}
