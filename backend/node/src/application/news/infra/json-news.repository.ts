/**
 * news 域 — JSON 文件 Repository（外部，技术变化驱动）。
 * 存储：$CWD/.shadowflow/news.json；首次运行灌入内置订阅源。
 */

import fs from 'fs';
import path from 'path';
import { DEFAULT_FEEDS, type NewsStore } from '../model';
import type { NewsRepository } from '../repository';

function storagePaths() {
  const dir = path.join(process.cwd(), '.shadowflow');
  return { dir, file: path.join(dir, 'news.json') };
}

/** 首次运行的种子数据：只有订阅源，没有条目（条目由 refresh 抓取）。 */
function seedStore(): NewsStore {
  return {
    feeds: DEFAULT_FEEDS.map((f, i) => ({
      feed_id: `seed-${i + 1}`,
      name: f.name,
      url: f.url,
      enabled: true,
      added_at: 0,
    })),
    items: [],
  };
}

export class JsonNewsRepository implements NewsRepository {
  load(): NewsStore {
    const { file } = storagePaths();
    if (!fs.existsSync(file)) return seedStore();
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as Partial<NewsStore>;
      const feeds = Array.isArray(parsed.feeds) ? parsed.feeds : [];
      return {
        feeds: feeds.length > 0 ? feeds : seedStore().feeds,
        items: Array.isArray(parsed.items) ? parsed.items : [],
      };
    } catch {
      return seedStore();
    }
  }

  persist(store: NewsStore): void {
    const { dir, file } = storagePaths();
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${file}.tmp.${process.pid}`;
    fs.writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf-8');
    fs.renameSync(tmp, file);
  }
}
