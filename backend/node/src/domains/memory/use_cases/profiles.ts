/**
 * memory 域 — profiles 用例（application 层）
 *
 * 只依赖 profiles-model（规则）+ profiles-repository（接口），可注入内存 repo 单测。
 * 行为逐字对齐原 storage/memory-profile-configs.ts。
 */

import {
  applyProfilePatch,
  byUpdatedDesc,
  createProfile,
  type MemoryProfile,
  type ProfilePatch,
} from '../profiles-model';
import type { ProfileRepository } from '../profiles-repository';

export type ProfileDeps = { newId?: () => string; now?: () => string };

/** 新建 profile：校验 + 默认值 + 持久化。 */
export const makeCreateProfile =
  (repo: ProfileRepository, deps: ProfileDeps = {}) =>
  (patch: ProfilePatch): MemoryProfile => {
    const profile = createProfile(patch, deps);
    repo.insert(profile);
    return profile;
  };

/** 列表：按 updated_at 倒序。 */
export const makeListProfiles =
  (repo: ProfileRepository) =>
  (): MemoryProfile[] =>
    repo.list().sort(byUpdatedDesc);

/** 取单条（不存在 null）。 */
export const makeGetProfile =
  (repo: ProfileRepository) =>
  (id: string): MemoryProfile | null =>
    repo.get(id);

/** 更新：校验 → 应用 patch → 持久化；不存在返回 null。 */
export const makeUpdateProfile =
  (repo: ProfileRepository, deps: ProfileDeps = {}) =>
  (id: string, patch: ProfilePatch): MemoryProfile | null => {
    const existing = repo.get(id);
    if (!existing) return null;
    const updated = applyProfilePatch(existing, patch, deps);
    repo.update(updated);
    return updated;
  };

/** 删除：返回是否删到。 */
export const makeDeleteProfile =
  (repo: ProfileRepository) =>
  (id: string): boolean =>
    repo.remove(id);
