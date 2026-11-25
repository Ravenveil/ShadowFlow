/**
 * service.ts — 门面（唯一入口）：HTTP 路由与 Node 内部调用方（lib/memory-bank.ts、
 * storage/craft-intake.ts）都从这里进，避免两套逻辑漂移（设计 §5.2 关键约定）。
 *
 * pack 生命周期（Python :1020-1115）+ stats/list/listSources/delete + blob。
 */

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { repoDataFile } from '../adapters/infra-repo-root';
import { MemoryBankError, packNotFound } from './errors';
import { MEMORY_CONFIG, MB_SCHEMA, LIMITS } from './config';
import { manifestPath, packDir, loadManifest, atomicWrite, validatePackId } from './paths';
import { connect, closePack, _resetForTests } from './db';
import { nowIso } from './text';
import { invalidateVectorCache } from './vector';
import {
  ingestText,
  ingestFile,
  ingestFolder,
  getBlob,
  deleteSource,
  deletePackFiles,
  stats,
  sourceDict,
} from './ingest';
import { queryPack, evaluateRetrieval } from './retrieve';
import type {
  PackManifest,
  SourceDict,
  FolderIngestResult,
  QueryOptions,
  QueryResponse,
  IngestOptions,
  FolderOptions,
} from './types';

export type { PackManifest, SourceDict, FolderIngestResult, QueryResponse };

function readManifestFile(packId: string): PackManifest {
  return loadManifest(packId) as unknown as PackManifest;
}

export function createPack(
  name: string,
  description = '',
  metadata: Record<string, unknown> = {},
  packIdArg?: string,
): PackManifest {
  const packId = packIdArg ?? randomUUID().replace(/-/g, '');
  validatePackId(packId);
  if (!name || !name.trim()) {
    throw new MemoryBankError('INVALID_PACK_NAME', 'Pack name cannot be empty');
  }
  if (fs.existsSync(manifestPath(packId))) {
    throw new MemoryBankError('PACK_EXISTS', `Pack already exists: ${packId}`, 409);
  }
  const now = nowIso();
  const manifest: PackManifest = {
    schema: MB_SCHEMA,
    pack_id: packId,
    name: name.trim(),
    description,
    status: 'ready',
    retrieval_profile: {
      mode: 'keyword',
      top_k: 5,
      child_size: MEMORY_CONFIG.child_size,
      child_overlap: MEMORY_CONFIG.child_overlap,
      parent_size: MEMORY_CONFIG.parent_size,
    },
    embedding_model: '',
    metadata: { ...metadata },
    stats: { sources: 0, units: 0, parents: 0, chunks: 0, bytes: 0 },
    created_at: now,
    updated_at: now,
  };
  fs.mkdirSync(packDir(packId), { recursive: true });
  // 初始化 DDL 并保留缓存连接（close 会让缓存句柄失效，后续 ingest 报 not open）
  connect(packId, true);
  atomicWrite(manifestPath(packId), JSON.stringify(manifest, null, 2));
  return manifest;
}

export function listPacks(): PackManifest[] {
  const root = packRootDir();
  if (!fs.existsSync(root)) return [];
  const packs: PackManifest[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = packManifestFile(entry.name);
    if (!fs.existsSync(file)) continue;
    try {
      const payload = JSON.parse(fs.readFileSync(file, 'utf-8')) as PackManifest;
      if (payload.schema === MB_SCHEMA) packs.push(payload);
    } catch {
      // Python :1076：跳过损坏 manifest，不让单个坏包拖垮列表
    }
  }
  return packs.sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
}

export function getPack(packId: string): PackManifest {
  const manifest = readManifestFile(packId);
  manifest.stats = stats(packId);
  return manifest;
}

export function deletePack(packId: string): void {
  loadManifest(packId);
  deletePackFiles(packId);
  invalidateVectorCache(packId);
}

export function listSources(packId: string, includeHistory = false): SourceDict[] {
  loadManifest(packId);
  const db = connect(packId);
  const where = includeHistory ? '' : `WHERE is_latest = 1 OR status = 'failed'`;
  const rows = db
    .prepare(`SELECT * FROM sources ${where} ORDER BY created_at DESC`)
    .all() as unknown as Parameters<typeof sourceDict>[0][];
  return rows.map((row) => sourceDict(row));
}

export function getSource(packId: string, sourceId: string): SourceDict {
  loadManifest(packId);
  const db = connect(packId);
  const row = db.prepare('SELECT * FROM sources WHERE source_id = ?').get(sourceId) as
    | Parameters<typeof sourceDict>[0]
    | undefined;
  if (!row) {
    throw new MemoryBankError('SOURCE_NOT_FOUND', `Knowledge source not found: ${sourceId}`, 404);
  }
  return sourceDict(row);
}

export function packStats(packId: string): ReturnType<typeof stats> {
  loadManifest(packId);
  return stats(packId);
}

export function query(
  packId: string,
  body: { query: string } & QueryOptions,
): QueryResponse {
  loadManifest(packId);
  return queryPack(packId, body.query, body);
}

export function ingestTextTyped(
  packId: string,
  text: string,
  opts: IngestOptions = {},
): SourceDict & { pack_id: string; deduplicated: boolean } {
  return ingestText(packId, text, opts);
}

export function ingestFileTyped(
  packId: string,
  data: Buffer,
  filename: string,
  mimeType: string,
  metadata: Record<string, unknown> = {},
  deduplicate = true,
): SourceDict & { pack_id: string; deduplicated: boolean } {
  return ingestFile(packId, data, filename, mimeType, metadata, deduplicate);
}

export function ingestFolderTyped(
  packId: string,
  folder: string,
  opts: FolderOptions = {},
): FolderIngestResult {
  return ingestFolder(packId, folder, opts);
}

export function readBlob(packId: string, sha256: string): { data: Buffer; mimeType: string } {
  return getBlob(packId, sha256);
}

export function removeSource(packId: string, sourceId: string): void {
  deleteSource(packId, sourceId);
}

export { evaluateRetrieval, _resetForTests, closePack, packNotFound, LIMITS };

// ── 内部小工具 ───────────────────────────────────────────────────────────────

function packRootDir(): string {
  return repoDataFile('knowledge');
}

function packManifestFile(packId: string): string {
  return path.join(repoDataFile('knowledge', packId), 'memory_bank.json');
}
