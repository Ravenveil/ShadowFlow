/**
 * memory 域 — profiles SQLite Repository 实现（外部，技术变化驱动）
 * SQL 全部锁在本文件，逐字对齐原 storage/memory-profile-configs.ts。
 */

import { getDb } from '../../adapters/sqlite';
import {
  byUpdatedDesc,
  type MemoryProfile,
  type ProfilePatch,
} from '../profiles-model';
import type { ProfileRepository } from '../profiles-repository';

interface ProfileRow {
  profile_id: string;
  working_memory_limit: number;
  episodic_retention_days: number;
  semantic_retrieval_top_k: number;
  compression_top_k: number;
  writeback_policy: string;
  state_sync_policy: string;
  compression_policy: string;
  created_at: string;
  updated_at: string;
}

function rowToProfile(r: ProfileRow): MemoryProfile {
  return {
    profile_id: r.profile_id,
    working_memory_limit: r.working_memory_limit,
    episodic_retention_days: r.episodic_retention_days,
    semantic_retrieval_top_k: r.semantic_retrieval_top_k,
    compression_top_k: r.compression_top_k,
    writeback_policy: r.writeback_policy as MemoryProfile['writeback_policy'],
    state_sync_policy: r.state_sync_policy as MemoryProfile['state_sync_policy'],
    compression_policy: r.compression_policy as MemoryProfile['compression_policy'],
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export class SqliteProfileRepository implements ProfileRepository {
  insert(profile: MemoryProfile): void {
    getDb()
      .prepare(
        `INSERT INTO memory_profile_configs
         (profile_id, working_memory_limit, episodic_retention_days, semantic_retrieval_top_k,
          compression_top_k, writeback_policy, state_sync_policy, compression_policy,
          created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        profile.profile_id,
        profile.working_memory_limit,
        profile.episodic_retention_days,
        profile.semantic_retrieval_top_k,
        profile.compression_top_k,
        profile.writeback_policy,
        profile.state_sync_policy,
        profile.compression_policy,
        profile.created_at,
        profile.updated_at,
      );
  }

  list(): MemoryProfile[] {
    const rows = getDb()
      .prepare(`SELECT * FROM memory_profile_configs`)
      .all() as ProfileRow[];
    return rows.map(rowToProfile).sort(byUpdatedDesc);
  }

  get(id: string): MemoryProfile | null {
    const row = getDb()
      .prepare(`SELECT * FROM memory_profile_configs WHERE profile_id = ?`)
      .get(id) as ProfileRow | undefined;
    return row ? rowToProfile(row) : null;
  }

  update(profile: MemoryProfile): void {
    getDb()
      .prepare(
        `UPDATE memory_profile_configs SET
           working_memory_limit = ?, episodic_retention_days = ?, semantic_retrieval_top_k = ?,
           compression_top_k = ?, writeback_policy = ?, state_sync_policy = ?,
           compression_policy = ?, updated_at = ?
         WHERE profile_id = ?`,
      )
      .run(
        profile.working_memory_limit,
        profile.episodic_retention_days,
        profile.semantic_retrieval_top_k,
        profile.compression_top_k,
        profile.writeback_policy,
        profile.state_sync_policy,
        profile.compression_policy,
        profile.updated_at,
        profile.profile_id,
      );
  }

  remove(id: string): boolean {
    return getDb()
      .prepare(`DELETE FROM memory_profile_configs WHERE profile_id = ?`)
      .run(id).changes > 0;
  }
}

/** 保留类型导出，供兼容层复用。 */
export type { ProfilePatch };
