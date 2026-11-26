/**
 * mcp 域 — JSON 文件 Repository 实现（外部，技术变化驱动）
 *
 * 存储：$CWD/.shadowflow/mcp.json（与 detectors/acp-detector.ts
 * resolveMcpServer() 读的是同一份文件，形状 { servers: [...] }）。
 * 写模式：atomic tmp + rename；坏 JSON 视为空配置，不抛。
 */

import fs from 'fs';
import path from 'path';
import { normalizeServer, type McpServer } from '../mcp-model';
import type { McpRepository } from '../mcp-repository';

function configPaths() {
  const dir = path.join(process.cwd(), '.shadowflow');
  return { dir, file: path.join(dir, 'mcp.json') };
}

/** 落盘形状：只写已知字段，未知的服务器级字段不保留（顶层字段经 raw 保留）。 */
function toStored(server: McpServer): Record<string, unknown> {
  return {
    name: server.name,
    transport: server.transport,
    command: server.command,
    args: server.args,
    env: server.env,
    ...(server.url !== undefined ? { url: server.url } : {}),
    ...(server.headers !== undefined ? { headers: server.headers } : {}),
    ...(server.description !== undefined ? { description: server.description } : {}),
    updated_at: server.updated_at,
  };
}

export class JsonMcpRepository implements McpRepository {
  async readAll(): Promise<{ servers: McpServer[]; raw: Record<string, unknown> }> {
    const { file } = configPaths();
    let parsed: unknown;
    try {
      parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch {
      return { servers: [], raw: {} };
    }
    const raw =
      parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    const list = Array.isArray(raw.servers) ? (raw.servers as unknown[]) : [];
    const servers: McpServer[] = [];
    for (const item of list) {
      try {
        // now: () => '' — 读盘不产生时间戳副作用，缺 updated_at 保持空串。
        servers.push(normalizeServer(item, { now: () => '' }));
      } catch {
        // 单条坏配置跳过，不影响其余服务器
      }
    }
    return { servers, raw };
  }

  async writeAll(servers: McpServer[], raw: Record<string, unknown>): Promise<void> {
    const { dir, file } = configPaths();
    fs.mkdirSync(dir, { recursive: true });
    const payload = { ...raw, servers: servers.map(toStored) };
    const tmp = `${file}.tmp.${process.pid}`;
    fs.writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
    fs.renameSync(tmp, file);
  }
}
