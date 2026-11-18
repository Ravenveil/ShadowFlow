/**
 * team-workflow-versions.ts — 单后端迁移：Team workflow 版本仓的 Node 数据层
 * （移植自 Python backend/python/shadowflow/runtime/team_workflow_versions.py，逐函数对齐）。
 *
 * 每次 PUT …/workflow 成功保存时自动追加一份快照；restore 把指定版本写回
 * team 记录并再记一个新版本（append-only，「恢复到 vN」不抹历史）；branch
 * 给新变体记下初始版本。
 *
 * 存储：<repo>/.shadowflow/team_workflow_versions/{team_id}.json，与 team
 * 本体分离（同 Python 存储先例）。Store shape:
 *   { team_id, versions: [{version, saved_at, summary, workflow}] }
 */

import fs from 'fs';
import path from 'path';
import { repoDataFile } from './repo-root';

const TEAM_ID_RE = /^[a-zA-Z0-9_-]+$/;

export interface WorkflowVersionEntry {
  version: number;
  saved_at: string;
  summary: string | null;
  workflow: Record<string, unknown>;
}

interface VersionStore {
  team_id: string;
  versions: WorkflowVersionEntry[];
}

function versionsFile(teamId: string): string {
  return repoDataFile('team_workflow_versions', `${teamId}.json`);
}

function loadStore(teamId: string): VersionStore {
  const file = versionsFile(teamId);
  try {
    if (!fs.existsSync(file)) return { team_id: teamId, versions: [] };
    const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf-8'));
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed) ||
      !Array.isArray((parsed as Record<string, unknown>).versions)
    ) {
      return { team_id: teamId, versions: [] };
    }
    return parsed as VersionStore;
  } catch {
    return { team_id: teamId, versions: [] };
  }
}

/** 原子写：tmp + rename（对齐 Python _save_store 的 mkstemp/os.replace）。 */
function saveStore(store: VersionStore): void {
  const file = versionsFile(store.team_id);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(store), 'utf-8');
  fs.renameSync(tmp, file);
}

/** 追加一份 workflow 快照；返回新版本条目。version = 已有条数 + 1。 */
export function recordVersion(
  teamId: string,
  workflow: Record<string, unknown>,
  summary: string | null = null,
): WorkflowVersionEntry {
  const store = loadStore(teamId);
  const entry: WorkflowVersionEntry = {
    version: store.versions.length + 1,
    saved_at: new Date().toISOString(),
    summary,
    workflow,
  };
  store.versions.push(entry);
  saveStore(store);
  return entry;
}

/** 全部版本条目，最老在前（空仓 → []）。 */
export function listVersions(teamId: string): WorkflowVersionEntry[] {
  return [...loadStore(teamId).versions];
}

/** 按 1-based 版本号取单条，不存在返回 null。 */
export function getVersion(
  teamId: string,
  version: number,
): WorkflowVersionEntry | null {
  for (const entry of loadStore(teamId).versions) {
    if (entry.version === version) return entry;
  }
  return null;
}

/** 最新一条版本，空仓返回 null。 */
export function latestVersion(teamId: string): WorkflowVersionEntry | null {
  const versions = loadStore(teamId).versions;
  return versions.length > 0 ? versions[versions.length - 1]! : null;
}
