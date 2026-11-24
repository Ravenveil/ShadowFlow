/**
 * memos 域 — JSON 文件 Repository 实现（外部，技术变化驱动）。
 * 存储：$CWD/.shadowflow/memos.json；写模式 atomic tmp + rename。
 */

import fs from 'fs';
import path from 'path';
import {
  applyMemoPatch,
  sortByUpdatedDesc,
  type Memo,
  type MemoPatch,
  type MemoStore,
} from '../model';
import type { MemoRepository } from '../repository';

function storagePaths() {
  const dir = path.join(process.cwd(), '.shadowflow');
  return { dir, file: path.join(dir, 'memos.json') };
}

export class JsonMemoRepository implements MemoRepository {
  load(): MemoStore {
    const { file } = storagePaths();
    if (!fs.existsSync(file)) return { memos: [] };
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as Partial<MemoStore>;
      return { memos: Array.isArray(parsed.memos) ? (parsed.memos as Memo[]) : [] };
    } catch {
      return { memos: [] };
    }
  }

  persist(store: MemoStore): void {
    const { dir, file } = storagePaths();
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${file}.tmp.${process.pid}`;
    fs.writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf-8');
    fs.renameSync(tmp, file);
  }

  list(): Memo[] {
    return sortByUpdatedDesc(this.load().memos);
  }

  get(id: string): Memo | null {
    return this.load().memos.find((m) => m.memo_id === id) ?? null;
  }

  save(memo: Memo): void {
    const store = this.load();
    store.memos.push(memo);
    this.persist(store);
  }

  update(id: string, patch: MemoPatch, now?: () => number): Memo | null {
    const store = this.load();
    const idx = store.memos.findIndex((m) => m.memo_id === id);
    if (idx === -1) return null;
    const updated = applyMemoPatch(store.memos[idx], patch, now ? { now } : {});
    store.memos[idx] = updated;
    this.persist(store);
    return updated;
  }

  remove(id: string): boolean {
    const store = this.load();
    const before = store.memos.length;
    store.memos = store.memos.filter((m) => m.memo_id !== id);
    if (store.memos.length === before) return false;
    this.persist(store);
    return true;
  }
}
