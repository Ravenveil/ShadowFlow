/**
 * mcp 域 — Repository 接口（内部，依赖倒置点）。
 *
 * 整存整取：`raw` 是 mcp.json 的顶层对象，写回时与 servers 合并，
 * 保证用户手写的未知顶层字段（如 version）不被抹掉。
 */

import type { McpServer } from './mcp-model';

export interface McpRepository {
  /** 读取全部服务器 + 顶层原始字段；坏文件/坏条目 fail-soft。 */
  readAll(): Promise<{ servers: McpServer[]; raw: Record<string, unknown> }>;
  /** 写回全部服务器，保留 raw 里的未知顶层字段。 */
  writeAll(servers: McpServer[], raw: Record<string, unknown>): Promise<void>;
}
