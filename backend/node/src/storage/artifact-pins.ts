/**
 * artifact-pins.ts — 单后端迁移：POST /api/artifacts/:id/pin 的 Node 数据层
 * （移植自 Python backend/python/shadowflow/runtime/artifact_pins.py）。
 *
 * 存储：<repo>/.shadowflow/artifacts/artifact_pins.json
 * Shape：{ artifact_id: pinned_at_iso8601 }；toggle 语义（再 POST 一次撤销）。
 * 原子写 tmp + rename，与 Python os.replace 等价，legacy↔single 共享同一文件。
 */

import fs from 'fs';
import path from 'path';
import { repoDataFile } from './repo-root';

const ARTIFACT_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;

export function isValidArtifactId(id: string): boolean {
  return ARTIFACT_ID_RE.test(id);
}

function pinsFile(): string {
  return repoDataFile('artifacts', 'artifact_pins.json');
}

export function loadPins(): Record<string, string> {
  const file = pinsFile();
  try {
    if (!fs.existsSync(file)) return {};
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, string>)
      : {};
  } catch {
    return {};
  }
}

function savePins(store: Record<string, string>): void {
  const file = pinsFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(store), 'utf-8');
  fs.renameSync(tmp, file);
}

/** toggle 置顶：返回 pinned_at（现为置顶）或 null（已撤销）。 */
export function togglePin(artifactId: string): string | null {
  const store = loadPins();
  if (Object.prototype.hasOwnProperty.call(store, artifactId)) {
    delete store[artifactId];
    savePins(store);
    return null;
  }
  const pinnedAt = new Date().toISOString();
  store[artifactId] = pinnedAt;
  savePins(store);
  return pinnedAt;
}

export function pinnedIds(): Set<string> {
  return new Set(Object.keys(loadPins()));
}
