/**
 * memory 域 — profiles 子域 Repository 接口（依赖倒置点）
 */

import type { MemoryProfile, ProfilePatch } from './profiles-model';

export interface ProfileRepository {
  insert(profile: MemoryProfile): void;
  list(): MemoryProfile[];
  get(id: string): MemoryProfile | null;
  update(profile: MemoryProfile): void;
  remove(id: string): boolean;
}

/** 内存实现，供 use_case 单测注入。 */
export class InMemoryProfileRepository implements ProfileRepository {
  readonly rows = new Map<string, MemoryProfile>();

  constructor(seed: MemoryProfile[] = []) {
    for (const r of seed) this.rows.set(r.profile_id, { ...r });
  }

  insert(profile: MemoryProfile): void {
    this.rows.set(profile.profile_id, { ...profile });
  }

  list(): MemoryProfile[] {
    return Array.from(this.rows.values()).map((r) => ({ ...r }));
  }

  get(id: string): MemoryProfile | null {
    const r = this.rows.get(id);
    return r ? { ...r } : null;
  }

  update(profile: MemoryProfile): void {
    this.rows.set(profile.profile_id, { ...profile });
  }

  remove(id: string): boolean {
    return this.rows.delete(id);
  }
}
