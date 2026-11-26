/**
 * mcp 域 — 用例（内部），只依赖 model + repository 接口与注入的 probe 函数。
 */

import {
  McpDomainError,
  normalizeName,
  normalizeServer,
  normalizeTarget,
  sortServers,
  type McpServer,
  type McpTarget,
  type ProbeResult,
} from '../mcp-model';
import type { McpRepository } from '../mcp-repository';

/** 探测函数：stdio 与 http 都传完整 target，由 infra/probe 统一分发。 */
export type ProbeFn = (target: McpTarget) => Promise<ProbeResult>;

export interface McpDeps {
  repo: McpRepository;
  probe: ProbeFn;
  /** 注入时钟，测试可固定 updated_at。 */
  now?: () => string;
}

export interface UseCaseError {
  code: string;
  message: string;
  status: number;
}

export type Result<T> = { kind: 'ok'; value: T } | { kind: 'error'; error: UseCaseError };

function toError(err: unknown): UseCaseError {
  if (err instanceof McpDomainError) {
    return { code: err.code, message: err.message, status: err.status };
  }
  const message = err instanceof Error ? err.message : String(err);
  return { code: 'MCP_INTERNAL', message, status: 500 };
}

function nowOf(deps: McpDeps): { now?: () => string } {
  return deps.now ? { now: deps.now } : {};
}

/** 已存储的服务器 → 探测 target（http 只带 url/headers，stdio 带 command/args/env）。 */
function toTarget(server: McpServer): McpTarget {
  if (server.transport === 'http') {
    return {
      transport: 'http',
      command: '',
      args: [],
      env: {},
      ...(server.url !== undefined ? { url: server.url } : {}),
      ...(server.headers !== undefined ? { headers: server.headers } : {}),
    };
  }
  return {
    transport: 'stdio',
    command: server.command,
    args: server.args,
    env: server.env,
  };
}

export async function listServers(deps: McpDeps): Promise<Result<McpServer[]>> {
  try {
    const { servers } = await deps.repo.readAll();
    return { kind: 'ok', value: sortServers(servers) };
  } catch (err) {
    return { kind: 'error', error: toError(err) };
  }
}

export async function createServer(deps: McpDeps, input: unknown): Promise<Result<McpServer>> {
  try {
    const server = normalizeServer(input, nowOf(deps));
    const { servers, raw } = await deps.repo.readAll();
    if (servers.some((s) => s.name === server.name)) {
      throw new McpDomainError('MCP_DUPLICATE_NAME', 409, `server "${server.name}" already exists`);
    }
    await deps.repo.writeAll(sortServers([...servers, server]), raw);
    return { kind: 'ok', value: server };
  } catch (err) {
    return { kind: 'error', error: toError(err) };
  }
}

export async function updateServer(
  deps: McpDeps,
  name: string,
  input: unknown,
): Promise<Result<McpServer>> {
  try {
    const target = normalizeName(name);
    const { servers, raw } = await deps.repo.readAll();
    const idx = servers.findIndex((s) => s.name === target);
    if (idx === -1) {
      throw new McpDomainError('MCP_NOT_FOUND', 404, `server "${target}" not found`);
    }

    const current = servers[idx];
    const body =
      input && typeof input === 'object' && !Array.isArray(input)
        ? (input as Record<string, unknown>)
        : {};
    // 基于现有字段 + 显式给出的补丁重走整条校验；updated_at 由 normalizeServer 刷新。
    const merged = {
      name: current.name,
      transport: current.transport,
      command: current.command,
      args: current.args,
      env: current.env,
      url: current.url,
      headers: current.headers,
      description: current.description,
      ...('name' in body ? { name: body.name } : {}),
      ...('transport' in body ? { transport: body.transport } : {}),
      ...('command' in body ? { command: body.command } : {}),
      ...('args' in body ? { args: body.args } : {}),
      ...('env' in body ? { env: body.env } : {}),
      ...('url' in body ? { url: body.url } : {}),
      ...('headers' in body ? { headers: body.headers } : {}),
      ...('description' in body ? { description: body.description } : {}),
    };
    const updated = normalizeServer(merged, nowOf(deps));
    if (updated.name !== target && servers.some((s) => s.name === updated.name)) {
      throw new McpDomainError('MCP_DUPLICATE_NAME', 409, `server "${updated.name}" already exists`);
    }

    await deps.repo.writeAll(sortServers(servers.map((s, i) => (i === idx ? updated : s))), raw);
    return { kind: 'ok', value: updated };
  } catch (err) {
    return { kind: 'error', error: toError(err) };
  }
}

export async function deleteServer(deps: McpDeps, name: string): Promise<Result<true>> {
  try {
    const target = normalizeName(name);
    const { servers, raw } = await deps.repo.readAll();
    if (!servers.some((s) => s.name === target)) {
      throw new McpDomainError('MCP_NOT_FOUND', 404, `server "${target}" not found`);
    }
    await deps.repo.writeAll(servers.filter((s) => s.name !== target), raw);
    return { kind: 'ok', value: true };
  } catch (err) {
    return { kind: 'error', error: toError(err) };
  }
}

export async function probeByName(deps: McpDeps, name: string): Promise<Result<ProbeResult>> {
  try {
    const target = normalizeName(name);
    const { servers } = await deps.repo.readAll();
    const found = servers.find((s) => s.name === target);
    if (!found) {
      throw new McpDomainError('MCP_NOT_FOUND', 404, `server "${target}" not found`);
    }
    const result = await deps.probe(toTarget(found));
    return { kind: 'ok', value: result };
  } catch (err) {
    return { kind: 'error', error: toError(err) };
  }
}

/** 保存前试连：不落库，只校验 target（stdio/http 各自归一化）后直接探测。 */
export async function probeAdHoc(deps: McpDeps, input: unknown): Promise<Result<ProbeResult>> {
  try {
    const target = normalizeTarget(input);
    const result = await deps.probe(target);
    return { kind: 'ok', value: result };
  } catch (err) {
    return { kind: 'error', error: toError(err) };
  }
}
