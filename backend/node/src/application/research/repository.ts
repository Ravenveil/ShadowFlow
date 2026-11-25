/**
 * research 域 — 仓储接口（内部，依赖倒置点）
 *
 * 用例只认这里的 ArcRunReader；换扫描来源（远端 run 目录、zip 包）
 * 只换 infra 实现，业务与 HTTP 零改动。
 */

import type { ArcStageDirScan } from './arc-model';

/** 目录里的一项（infra 扫描的原始形状）。 */
export interface ArcDirEntry {
  name: string;
  isDir: boolean;
  size: number;
  mtimeMs: number;
}

/** 一次 run 的状态文件集合（原样 JSON，解析归 model）。 */
export interface ArcRunStateFiles {
  checkpoint: unknown;
  heartbeat: unknown;
  summary: unknown;
  decisions: unknown;
  goalText: string | null;
}

export interface ArcRunReader {
  /** 全部 run id（rc-* 目录名），无序。 */
  listRunIds(): Promise<string[]>;
  /** run 目录绝对路径；不存在返回 null。 */
  runDir(runId: string): Promise<string | null>;
  /** 状态文件一次读齐（缺的给 null）。 */
  readStateFiles(runId: string): Promise<ArcRunStateFiles>;
  /** stage-NN(_vK) 目录扫描（含每层文件清单）。 */
  listStageDirs(runId: string): Promise<ArcStageDirScan[]>;
  /** run 目录内相对路径下的一层列表；不存在返回 null。 */
  listDir(runId: string, relPath: string): Promise<ArcDirEntry[] | null>;
  /** 读 run 内 JSON 文件；不存在或解析失败返回 null。 */
  readJson(runId: string, relPath: string): Promise<unknown>;
  /** 读 run 内文本（截头）；不存在返回 null。 */
  readText(runId: string, relPath: string, maxBytes: number): Promise<{ content: string; truncated: boolean; size: number } | null>;
  /** run 内文件的绝对路径（raw 直链用）；越界返回 null。 */
  resolvePath(runId: string, relPath: string): Promise<string | null>;
}
