/**
 * memory 域 — JSON 文件 Repository 实现（外部，技术变化驱动）
 *
 * 这是「换存储只改这一处」的落点。换成 SQLite/PG 时新增一个
 * implements MemoryEntryRepository 的文件，在装配根换掉 new 即可，
 * application/ 与 adapters/web 零改动。
 *
 * 存储位置沿用现状：$CWD/.shadowflow/memory-entries.json
 * 写模式：atomic tmp + rename（与 settings.ts 一致）。
 */

import fs from 'fs';
import path from 'path';
import {
  applyPatch,
  sortByUpdatedDesc,
  type EntryPatch,
  type MemoryEntry,
  type MemoryScope,
  type MemoryStore,
} from '../model';
import type { MemoryEntryRepository } from '../repository';

function storagePaths() {
  const dir = path.join(process.cwd(), '.shadowflow');
  return { dir, file: path.join(dir, 'memory-entries.json') };
}

export class JsonMemoryEntryRepository implements MemoryEntryRepository {
  load(): MemoryStore {
    const { file } = storagePaths();
    if (!fs.existsSync(file)) return { enabled: true, entries: [] };
    let raw: string;
    try {
      raw = fs.readFileSync(file, 'utf-8');
    } catch {
      return { enabled: true, entries: [] };
    }
    try {
      const parsed = JSON.parse(raw) as Partial<MemoryStore>;
      return {
        enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : true,
        entries: Array.isArray(parsed.entries) ? (parsed.entries as MemoryEntry[]) : [],
      };
    } catch {
      return { enabled: true, entries: [] };
    }
  }

  persist(store: MemoryStore): void {
    const { dir, file } = storagePaths();
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${file}.tmp.${process.pid}`;
    fs.writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf-8');
    fs.renameSync(tmp, file);
  }

  list(scope?: MemoryScope): MemoryEntry[] {
    const { entries } = this.load();
    const filtered = scope ? entries.filter((e) => e.scope === scope) : entries;
    return sortByUpdatedDesc(filtered);
  }

  get(id: string): MemoryEntry | null {
    return this.load().entries.find((e) => e.id === id) ?? null;
  }

  save(entry: MemoryEntry): void {
    const store = this.load();
    store.entries.push(entry);
    this.persist(store);
  }

  update(id: string, patch: EntryPatch, now?: () => string): MemoryEntry | null {
    const store = this.load();
    const idx = store.entries.findIndex((e) => e.id === id);
    if (idx === -1) return null;
    // 不变量守护在 model.applyPatch，repo 只做整存整取
    const updated = applyPatch(store.entries[idx], patch, now ? { now } : {});
    store.entries[idx] = updated;
    this.persist(store);
    return updated;
  }

  remove(id: string): boolean {
    const store = this.load();
    const before = store.entries.length;
    store.entries = store.entries.filter((e) => e.id !== id);
    if (store.entries.length === before) return false;
    this.persist(store);
    return true;
  }

  getSettings(): { enabled: boolean } {
    return { enabled: this.load().enabled };
  }

  updateSettings(settings: { enabled: boolean }): { enabled: boolean } {
    const store = this.load();
    store.enabled = settings.enabled;
    this.persist(store);
    return { enabled: store.enabled };
  }
}
