/**
 * paths.ts — pack 目录/manifest/DB/blob 路径解析与 ID 校验（Python :828-836, :538-546, :988-1005）。
 *
 * 数据根：storage/repo-root.ts 的 repoDataFile('knowledge') → <repo>/.shadowflow/knowledge，
 * 与 Python 的 SHADOWFLOW_KNOWLEDGE_DIR 默认值（相对仓库根）对齐，且兼容
 * SHADOWFLOW_DATA_DIR 覆盖（repo-root 已内置），单测注入 tmp 目录零成本。
 */

import path from 'path';
import fs from 'fs';
import { repoDataFile } from '../storage/repo-root';
import { MemoryBankError } from './errors';

const PACK_ID_RE = /^[a-f0-9]{32}$/;
const SHA_RE = /^[a-f0-9]{64}$/;

export function validatePackId(packId: string): void {
  if (typeof packId !== 'string' || !PACK_ID_RE.test(packId)) {
    throw new MemoryBankError(
      'INVALID_PACK_ID',
      'pack_id must be a 32-character lowercase UUID hex',
    );
  }
}

export function validateSha(sha: string): void {
  if (!SHA_RE.test(sha)) {
    throw new MemoryBankError('INVALID_BLOB_ID', 'Blob id must be a SHA-256 hex string');
  }
}

export function packDir(packId: string): string {
  validatePackId(packId);
  return repoDataFile('knowledge', packId);
}

export function manifestPath(packId: string): string {
  return path.join(packDir(packId), 'memory_bank.json');
}

export function dbPath(packId: string): string {
  return path.join(packDir(packId), 'memory_bank.sqlite');
}

/** blobs/{sha前2位}/{sha}{suffix}，内容寻址、不可变（Python _store_blob :988-1005）。 */
export function blobPath(packId: string, sha256: string, suffix: string): string {
  return path.join(packDir(packId), 'blobs', sha256.slice(0, 2), `${sha256}${safeSuffix(suffix)}`);
}

/** 读 manifest + schema/pack_id 一致性校验（Python _load_manifest :838-848）。 */
export function loadManifest(packId: string): Record<string, unknown> {
  const file = manifestPath(packId);
  let raw: string;
  try {
    raw = fs.readFileSync(file, 'utf-8');
  } catch {
    throw new MemoryBankError('PACK_NOT_FOUND', `Knowledge pack not found: ${packId}`, 404);
  }
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw) as Record<string, unknown>;
  } catch (err) {
    throw new MemoryBankError(
      'PACK_CORRUPT',
      `Cannot read pack manifest: ${(err as Error).message}`,
      500,
    );
  }
  if (
    payload.schema !== 'shadowflow.memory_bank/1' ||
    payload.pack_id !== packId
  ) {
    throw new MemoryBankError(
      'PACK_SCHEMA_MISMATCH',
      'Unsupported or inconsistent pack manifest',
      500,
    );
  }
  return payload;
}

/** 文件名 → 归一小写扩展名（Python _safe_suffix :626-631）。 */
export function safeSuffix(filename: string): string {
  const lower = filename.toLowerCase();
  if (/^\.[a-z0-9]{1,10}$/.test(lower)) return lower;
  const ext = path.extname(lower);
  return /^\.[a-z0-9]{1,10}$/.test(ext) ? ext : '.bin';
}

/** 原子写文本文件（临时文件 + rename，Python _atomic_write :548-557）。 */
export function atomicWrite(file: string, content: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${Math.random().toString(36).slice(2)}`;
  fs.writeFileSync(tmp, content, 'utf-8');
  fs.renameSync(tmp, file);
}
