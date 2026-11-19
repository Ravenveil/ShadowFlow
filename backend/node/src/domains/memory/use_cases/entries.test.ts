/**
 * entries 用例单测 —— 证明依赖倒置成立：
 * 注入内存 repo，不启 server、不碰磁盘、不 import infra。
 * 这正是「真分层」与「假分层」的区别证据。
 */
import { describe, it, expect } from 'vitest';
import { createMemoryEntry } from '../model';
import type { MemoryEntry, MemoryScope, MemoryStore } from '../model';
import type { MemoryEntryRepository } from '../repository';
import {
  makeListEntries,
  makeCreateEntry,
  makeUpdateEntry,
  makeDeleteEntry,
  makeGetSettings,
  makeUpdateSettings,
} from './entries';

/** 内存 repo：完全实现接口，零 IO。 */
class InMemoryRepo implements MemoryEntryRepository {
  store: MemoryStore = { enabled: true, entries: [] };
  load() { return this.store; }
  persist(s: MemoryStore) { this.store = s; }
  list(scope?: MemoryScope) {
    const rows = scope ? this.store.entries.filter((e) => e.scope === scope) : this.store.entries;
    return rows.slice().sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }
  get(id: string) { return this.store.entries.find((e) => e.id === id) ?? null; }
  save(e: MemoryEntry) { this.store.entries.push(e); }
  update(id: string, patch: Partial<Pick<MemoryEntry, 'scope' | 'title' | 'content'>>) {
    const idx = this.store.entries.findIndex((e) => e.id === id);
    if (idx === -1) return null;
    const next = { ...this.store.entries[idx], ...patch, updated_at: '2026-01-01T00:00:01.000Z' };
    this.store.entries[idx] = next;
    return next;
  }
  remove(id: string) {
    const before = this.store.entries.length;
    this.store.entries = this.store.entries.filter((e) => e.id !== id);
    return this.store.entries.length !== before;
  }
  getSettings() { return { enabled: this.store.enabled }; }
  updateSettings(s: { enabled: boolean }) { this.store.enabled = s.enabled; return s; }
}

const fixedDeps = {
  now: () => '2026-01-01T00:00:00.000Z',
  newId: () => '11111111-1111-1111-1111-111111111111',
};

describe('memory entries 用例（注入内存 repo，零 IO）', () => {
  it('新建 → 列表 → 按 scope 过滤，业务规则在 model 生效', () => {
    const repo = new InMemoryRepo();
    // 通过 model 工厂注入固定依赖验证不变量，再走用例持久化
    const entry = createMemoryEntry(
      { scope: 'user', title: '  偏好  ', content: 'x' },
      fixedDeps,
    );
    expect(entry.title).toBe('偏好'); // trim 规则
    repo.save(entry);
    expect(makeListEntries(repo)()).toHaveLength(1);
    expect(makeListEntries(repo)('project')).toHaveLength(0);
    expect(makeListEntries(repo)('user')).toHaveLength(1);
  });

  it('makeCreateEntry 校验入参形状，不合法返回 invalid 而非抛错', () => {
    const repo = new InMemoryRepo();
    const create = makeCreateEntry(repo);
    expect(create({ scope: 'user' }).kind).toBe('invalid'); // 缺 title
    expect(create({ scope: 'bad', title: 't' }).kind).toBe('invalid'); // 非法 scope
    expect(repo.store.entries).toHaveLength(0);
  });

  it('标题超长被领域不变量拦截（TITLE_TOO_LONG）', () => {
    const repo = new InMemoryRepo();
    const result = makeCreateEntry(repo)({ scope: 'user', title: 'x'.repeat(121) });
    expect(result).toMatchObject({ kind: 'invalid', code: 'TITLE_TOO_LONG' });
  });

  it('更新不存在 id → not_found；删除同理', () => {
    const repo = new InMemoryRepo();
    const id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    expect(makeUpdateEntry(repo)(id, { title: 't' })).toMatchObject({ kind: 'not_found' });
    expect(makeDeleteEntry(repo)(id)).toMatchObject({ kind: 'not_found' });
  });

  it('非法 id 在用例层拦截（INVALID_ID），不进 repo', () => {
    const repo = new InMemoryRepo();
    expect(makeUpdateEntry(repo)('not-a-uuid', { title: 't' })).toMatchObject({
      kind: 'invalid', code: 'INVALID_ID',
    });
  });

  it('开关读写走接口，校验 enabled 必须布尔', () => {
    const repo = new InMemoryRepo();
    expect(makeGetSettings(repo)()).toEqual({ enabled: true });
    expect(makeUpdateSettings(repo)({ enabled: 'yes' }).kind).toBe('invalid');
    expect(makeUpdateSettings(repo)({ enabled: false })).toMatchObject({
      kind: 'ok', value: { enabled: false },
    });
    expect(makeGetSettings(repo)()).toEqual({ enabled: false });
  });
});
