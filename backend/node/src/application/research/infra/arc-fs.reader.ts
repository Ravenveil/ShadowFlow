/**
 * research 域 — ARC run 目录的文件系统实现（外部）
 *
 * 扫描根（按优先级合并，存在的才生效；每次请求现算，服务启动后才出现的
 * 会话目录不会漏）：
 *   1. env `ARC_ARTIFACTS_ROOTS` —— 分号分隔的额外根（部署时可指到挂载卷）
 *   2. `~/AutoResearchClaw/artifacts` —— ARC 官方默认安装位的产物目录
 *   3. `<cwd>/.shadowflow/projects/<会话>/artifacts` —— 旧位置的会话工作目录
 *   4. `<chat 根>/chat-workspaces/<会话>/artifacts` —— 现行会话工作目录
 *      （`researchclaw run` 把 run 落在 cwd 下的 artifacts/，而 cwd = 会话工作目录）
 *
 * 一个根可以是「直接装着 rc-* 的目录」，也可以是会话工作目录本身（run 在其
 * artifacts/ 下一层）：`resolveRoot` 两种形状都认，前端传会话工作目录即可。
 *
 * 安全面：run id 必须过 model 的 isValidRunId；相对路径 resolve 后必须
 * 仍在 run 目录内（resolvePath 返回 null 即拒绝），与 fs-browse 同一防线。
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chatWorkspacesRoot } from '../../runtime/chat-workspace';

import type { ArcDirEntry, ArcRunReader, ArcRunStateFiles } from '../repository';
import { isValidRunId, normalizeHeartbeat, parseStageDirName, type ArcStageDirScan } from '../arc-model';

const TEXT_HEAD_BYTES = 256 * 1024;
const GOAL_HEAD_BYTES = 8 * 1024;

function isDirectory(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function existingDirs(candidates: string[]): string[] {
  const seen = new Set<string>();
  const roots: string[] = [];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const resolved = path.resolve(candidate);
    const key = resolved.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    // 根不存在就跳过：ARC 没装、会话目录没建都是正常状态
    if (isDirectory(resolved)) roots.push(resolved);
  }
  return roots;
}

/** `<parent>/<id>/artifacts`：每个会话工作目录下的 artifacts 目录（存不存在由 existingDirs 裁决）。 */
function sessionArtifactDirs(parent: string): string[] {
  try {
    return fs
      .readdirSync(parent, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(parent, entry.name, 'artifacts'));
  } catch {
    return []; // 没有会话目录 = 没有会话内 run
  }
}

/** 默认扫描根：额外根 + ARC 安装位 + 所有会话工作区下的 artifacts。 */
export function defaultArcRoots(cwd: string = process.cwd()): string[] {
  const fromEnv = (process.env.ARC_ARTIFACTS_ROOTS ?? '')
    .split(path.delimiter)
    .map((part) => part.trim())
    .filter(Boolean);
  const home = path.join(os.homedir(), 'AutoResearchClaw', 'artifacts');
  const legacyProjects = path.join(cwd, '.shadowflow', 'projects');
  const sessionArtifacts = [
    ...sessionArtifactDirs(legacyProjects),
    ...sessionArtifactDirs(chatWorkspacesRoot()),
  ];
  return existingDirs([...fromEnv, home, ...sessionArtifacts]);
}

/** 目录下直接有 run 子目录（rc-*）。 */
function holdsRunDirs(root: string): boolean {
  try {
    return fs
      .readdirSync(root, { withFileTypes: true })
      .some((entry) => entry.isDirectory() && isValidRunId(entry.name));
  } catch {
    return false;
  }
}

/**
 * 把调用方给的根归一到「直接装着 rc-* 的目录」。会话工作目录传进来时 run 其实在
 * artifacts/ 下一层 —— 多认这一层，调用方不必知道 ARC 的落盘约定。
 */
function resolveRoot(root: string): string {
  const direct = path.resolve(root);
  if (holdsRunDirs(direct)) return direct;
  const nested = path.join(direct, 'artifacts');
  return isDirectory(nested) ? nested : direct;
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

/** 心跳超过这个时长就不再认它的 pid：pid 可能已被别的进程复用，会被误判成「还在跑」。 */
const HEARTBEAT_MAX_AGE_MS = 6 * 60 * 60 * 1000;

/** 信号 0 只做存在性探测，不真的发信号。 */
function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * heartbeat.json 记着当前进程的 pid：进程还在 = run 可能仍在推进；进程已不在
 * （被停止 / 崩溃）而汇总又没写，就是一次被中断的运行。
 * 只对与本服务同机的 run 成立（跨机产物根上的 pid 没有意义）。
 */
function heartbeatLiveness(raw: unknown): boolean | null {
  const heartbeat = normalizeHeartbeat(raw);
  if (!heartbeat?.pid) return null;
  if (!pidAlive(heartbeat.pid)) return false;
  const ageMs = heartbeat.timestamp ? Date.now() - Date.parse(heartbeat.timestamp) : 0;
  return !(Number.isFinite(ageMs) && ageMs > HEARTBEAT_MAX_AGE_MS);
}

async function readStateFiles(runDir: string): Promise<ArcRunStateFiles> {
  const [checkpoint, heartbeat, summary, decisions, goal] = await Promise.all([
    readJsonIfExists(path.join(runDir, 'checkpoint.json')),
    readJsonIfExists(path.join(runDir, 'heartbeat.json')),
    readJsonIfExists(path.join(runDir, 'pipeline_summary.json')),
    readJsonIfExists(path.join(runDir, 'decision_history.json')),
    readHead(path.join(runDir, 'stage-01', 'goal.md'), GOAL_HEAD_BYTES),
  ]);
  return { checkpoint, heartbeat, heartbeatLive: heartbeatLiveness(heartbeat), summary, decisions, goalText: goal?.content ?? null };
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
  const scanRoots = existingDirs(roots.map(resolveRoot));
  return {
    async listRunIds() {
      const ids: string[] = [];
      for (const root of scanRoots) {
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
      return locateRun(scanRoots, runId);
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
