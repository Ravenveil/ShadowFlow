/**
 * research 域 — ARC run 目录的文件系统实现（外部）
 *
 * 扫描根（按优先级合并，都存在才生效）：
 *   1. env `ARC_ARTIFACTS_ROOTS` —— 分号分隔的额外根（部署时可指到挂载卷）
 *   2. `~/AutoResearchClaw/artifacts` —— ARC 官方默认安装位的产物目录
 *   3. `<cwd>/.shadowflow/projects/<会话>/artifacts` —— 经会话工作目录跑的 run
 *
 * 安全面：run id 必须过 model 的 isValidRunId；相对路径 resolve 后必须
 * 仍在 run 目录内（resolvePath 返回 null 即拒绝），与 fs-browse 同一防线。
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { ArcDirEntry, ArcRunReader, ArcRunStateFiles } from '../repository';
import { isValidRunId, parseStageDirName, type ArcStageDirScan } from '../arc-model';

const TEXT_HEAD_BYTES = 256 * 1024;
const GOAL_HEAD_BYTES = 8 * 1024;

function existingDirs(candidates: string[]): string[] {
  const seen = new Set<string>();
  const roots: string[] = [];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const resolved = path.resolve(candidate);
    const key = resolved.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      if (fs.statSync(resolved).isDirectory()) roots.push(resolved);
    } catch {
      /* 根不存在就跳过：ARC 没装、会话目录没建都是正常状态 */
    }
  }
  return roots;
}

/** 默认扫描根：ARC 安装位 + 所有会话工作区下的 artifacts。 */
export function defaultArcRoots(cwd: string = process.cwd()): string[] {
  const fromEnv = (process.env.ARC_ARTIFACTS_ROOTS ?? '')
    .split(path.delimiter)
    .map((part) => part.trim())
    .filter(Boolean);
  const home = path.join(os.homedir(), 'AutoResearchClaw', 'artifacts');
  const projects = path.join(cwd, '.shadowflow', 'projects');
  const sessionArtifacts: string[] = [];
  try {
    for (const entry of fs.readdirSync(projects, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      sessionArtifacts.push(path.join(projects, entry.name, 'artifacts'));
    }
  } catch {
    /* 没有项目目录 = 没有会话内 run */
  }
  return existingDirs([...fromEnv, home, ...sessionArtifacts]);
}

/** 在多个根下定位 run 目录；同名 run 先到先得（rc- 名含时间戳哈希，冲突罕见）。 */
async function locateRun(roots: string[], runId: string): Promise<string | null> {
  for (const root of roots) {
    const candidate = path.join(root, runId);
    try {
      if ((await fsp.stat(candidate)).isDirectory()) return candidate;
    } catch {
      /* 继续找下一个根 */
    }
  }
  return null;
}

async function safeList(dir: string): Promise<ArcDirEntry[]> {
  let rows: fs.Dirent[];
  try {
    rows = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const entries: ArcDirEntry[] = [];
  for (const row of rows) {
    if (row.name.startsWith('.')) continue;
    const full = path.join(dir, row.name);
    let size = 0;
    let mtimeMs = 0;
    try {
      const stat = await fsp.stat(full);
      size = stat.size;
      mtimeMs = stat.mtimeMs;
    } catch {
      /* 竞态：列到的文件转瞬被清掉，给零值即可 */
    }
    entries.push({ name: row.name, isDir: row.isDirectory(), size, mtimeMs });
  }
  return entries;
}

async function readJsonIfExists(file: string): Promise<unknown> {
  try {
    return JSON.parse(await fsp.readFile(file, 'utf-8'));
  } catch {
    return null;
  }
}

async function readHead(file: string, maxBytes: number): Promise<{ content: string; truncated: boolean; size: number } | null> {
  let stat: fs.Stats;
  try {
    stat = await fsp.stat(file);
  } catch {
    return null;
  }
  if (!stat.isFile()) return null;
  try {
    const handle = await fsp.open(file, 'r');
    try {
      const length = Math.min(maxBytes, stat.size);
      const buffer = Buffer.alloc(length);
      await handle.read(buffer, 0, length, 0);
      return { content: buffer.toString('utf-8'), truncated: stat.size > maxBytes, size: stat.size };
    } finally {
      await handle.close();
    }
  } catch {
    return null;
  }
}

async function readStateFiles(runDir: string): Promise<ArcRunStateFiles> {
  const [checkpoint, heartbeat, summary, decisions, goal] = await Promise.all([
    readJsonIfExists(path.join(runDir, 'checkpoint.json')),
    readJsonIfExists(path.join(runDir, 'heartbeat.json')),
    readJsonIfExists(path.join(runDir, 'pipeline_summary.json')),
    readJsonIfExists(path.join(runDir, 'decision_history.json')),
    readHead(path.join(runDir, 'stage-01', 'goal.md'), GOAL_HEAD_BYTES),
  ]);
  return { checkpoint, heartbeat, summary, decisions, goalText: goal?.content ?? null };
}

async function listStageDirs(runDir: string): Promise<ArcStageDirScan[]> {
  const scans: ArcStageDirScan[] = [];
  let rows: fs.Dirent[];
  try {
    rows = await fsp.readdir(runDir, { withFileTypes: true });
  } catch {
    return scans;
  }
  for (const row of rows) {
    if (!row.isDirectory()) continue;
    const parsed = parseStageDirName(row.name);
    if (!parsed) continue;
    const full = path.join(runDir, row.name);
    scans.push({
      dir: row.name,
      index: parsed.index,
      attempt: parsed.attempt,
      entries: (await safeList(full)).map(({ name, isDir, size }) => ({ name, isDir, size })),
    });
  }
  return scans;
}

export function createArcFsReader(roots: string[] = defaultArcRoots()): ArcRunReader {
  return {
    async listRunIds() {
      const ids: string[] = [];
      for (const root of roots) {
        let rows: fs.Dirent[];
        try {
          rows = await fsp.readdir(root, { withFileTypes: true });
        } catch {
          continue;
        }
        for (const row of rows) {
          if (row.isDirectory() && isValidRunId(row.name) && !ids.includes(row.name)) ids.push(row.name);
        }
      }
      return ids;
    },

    async runDir(runId) {
      if (!isValidRunId(runId)) return null;
      return locateRun(roots, runId);
    },

    async readStateFiles(runId) {
      const dir = await this.runDir(runId);
      if (!dir) return { checkpoint: null, heartbeat: null, summary: null, decisions: null, goalText: null };
      return readStateFiles(dir);
    },

    async listStageDirs(runId) {
      const dir = await this.runDir(runId);
      if (!dir) return [];
      return listStageDirs(dir);
    },

    async listDir(runId, relPath) {
      const dir = await this.resolvePath(runId, relPath);
      if (!dir) return null;
      return safeList(dir);
    },

    async readJson(runId, relPath) {
      const file = await this.resolvePath(runId, relPath);
      if (!file) return null;
      return readJsonIfExists(file);
    },

    async readText(runId, relPath, maxBytes = TEXT_HEAD_BYTES) {
      const file = await this.resolvePath(runId, relPath);
      if (!file) return null;
      return readHead(file, maxBytes);
    },

    async resolvePath(runId, relPath) {
      const dir = await this.runDir(runId);
      if (!dir) return null;
      const resolved = path.resolve(dir, relPath);
      const rel = path.relative(dir, resolved);
      if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
      return resolved;
    },
  };
}
