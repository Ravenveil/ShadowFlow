/**
 * mcp 域 — mcp.json 条目 → McpTarget（外部，技术变化驱动）
 *
 * 供运行链路（spawners/mcp.ts）使用，避免 spawner 直接读 fs：
 *   - 找不到条目 / 文件缺失或坏 JSON → null（调用方自行回退 PATH 探测）
 *   - 条目存在但非法 → 抛 McpDomainError（调用方按配置错误处理）
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { normalizeTarget, type McpTarget } from '../mcp-model';

function configPath(): string {
  return path.join(process.cwd(), '.shadowflow', 'mcp.json');
}

export async function resolveTarget(name: string): Promise<McpTarget | null> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await fs.readFile(configPath(), 'utf-8'));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const list = (parsed as { servers?: unknown }).servers;
  if (!Array.isArray(list)) return null;

  const found = list.find(
    (item) => item && typeof item === 'object' && (item as { name?: unknown }).name === name,
  );
  if (!found) return null;
  return normalizeTarget(found);
}
