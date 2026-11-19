/**
 * memory-profile-configs.ts — 兼容装配层（DDD 迁移后，2026-11-19）
 *
 * 领域规则已迁至 domains/memory/profiles-model.ts，
 * 用例编排已迁至 domains/memory/use_cases/profiles.ts，
 * SQL 已锁在 domains/memory/infra/sqlite-profile.repository.ts。
 *
 * 本文件只做「装配 + 导出兼容」，原样暴露迁移前的全部函数/常量/类型，
 * 调用方零改动。
 */

import { randomUUID } from 'crypto';
import { SqliteProfileRepository } from '../domains/memory/infra/sqlite-profile.repository';
import {
  makeCreateProfile,
  makeListProfiles,
  makeGetProfile,
  makeUpdateProfile,
  makeDeleteProfile,
} from '../domains/memory/use_cases/profiles';
import {
  FieldViolationError,
  UUID_RE,
  type MemoryProfile,
  type ProfilePatch,
  type WritebackPolicy,
  type StateSyncPolicy,
  type CompressionPolicy,
} from '../domains/memory/profiles-model';

const repo = new SqliteProfileRepository();
const deps = { newId: () => randomUUID() };

// ── 类型 / 常量（原样重导出） ────────────────────────────────────────────────
export { FieldViolationError, UUID_RE };
export type { MemoryProfile, ProfilePatch, WritebackPolicy, StateSyncPolicy, CompressionPolicy };

// ── 函数（原签名 + 原行为） ──────────────────────────────────────────────────

export function createProfile(patch: ProfilePatch): MemoryProfile {
  return makeCreateProfile(repo, deps)(patch);
}

export function listProfiles(): MemoryProfile[] {
  return makeListProfiles(repo)();
}

export function getProfile(profileId: string): MemoryProfile | null {
  return makeGetProfile(repo)(profileId);
}

export function updateProfile(profileId: string, patch: ProfilePatch): MemoryProfile | null {
  return makeUpdateProfile(repo, {})(profileId, patch);
}

export function deleteProfile(profileId: string): boolean {
  return makeDeleteProfile(repo)(profileId);
}
