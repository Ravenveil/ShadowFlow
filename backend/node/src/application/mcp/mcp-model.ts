/**
 * mcp 域 — 领域模型（内部，业务变化驱动）
 *
 * MCP 服务器注册表：`.shadowflow/mcp.json` 的管理面。
 * 纯领域规则，禁止 import express / fs / sqlite / child_process；
 * 校验/归一化/排序都在这里，infra 与 http 只做 IO 和形状映射。
 */

/** 一台 MCP stdio 服务器的持久化形状（与既有 mcp.json 兼容）。 */
export interface McpServer {
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  description?: string;
  updated_at: string;
}

/** 探测（试连）结果形状。定义在 model 里，用例层才不用 import infra。 */
export type ProbeErrorCode = 'MCP_TIMEOUT' | 'MCP_SPAWN_FAILED' | 'MCP_HANDSHAKE_FAILED';

export interface ProbeTool {
  name: string;
  description?: string;
}

export interface ProbeError {
  code: ProbeErrorCode;
  message: string;
}

export interface ProbeResult {
  ok: boolean;
  tools: ProbeTool[];
  duration_ms: number;
  error?: ProbeError;
}

export const NAME_MAX = 64;
export const COMMAND_MAX = 512;
export const ARGS_MAX = 64;
export const ARG_MAX = 512;
export const ENV_MAX = 64;
export const ENV_VALUE_MAX = 2048;
export const DESCRIPTION_MAX = 280;

const NAME_RE = /^[A-Za-z0-9._-]{1,64}$/;

export type McpErrorCode =
  | 'MCP_INVALID_NAME'
  | 'MCP_INVALID_COMMAND'
  | 'MCP_INVALID_ARGS'
  | 'MCP_INVALID_ENV'
  | 'MCP_DESCRIPTION_TOO_LONG'
  | 'MCP_DUPLICATE_NAME'
  | 'MCP_NOT_FOUND';

export class McpDomainError extends Error {
  constructor(
    public readonly code: McpErrorCode,
    public readonly status: number,
    message: string = code,
  ) {
    super(message);
    this.name = 'McpDomainError';
  }
}

function asRecord(input: unknown): Record<string, unknown> {
  return input && typeof input === 'object' && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {};
}

/** 服务器名：URL 路径与 `executor: mcp:<name>/<tool>` 的键，字符集受限。 */
export function normalizeName(input: unknown): string {
  if (typeof input !== 'string' || !NAME_RE.test(input)) {
    throw new McpDomainError(
      'MCP_INVALID_NAME',
      400,
      `name must match ${NAME_RE} (1..${NAME_MAX} chars of A-Z a-z 0-9 . _ -)`,
    );
  }
  return input;
}

/**
 * 归一化 spawn 规格 {command,args,env}（不含 name/description）。
 * 保存前试连（/api/mcp/probe）与整条服务器校验共用同一套规则。
 */
export function normalizeCommandSpec(input: unknown): {
  command: string;
  args: string[];
  env: Record<string, string>;
} {
  const body = asRecord(input);

  if (typeof body.command !== 'string' || body.command.trim().length === 0) {
    throw new McpDomainError('MCP_INVALID_COMMAND', 400, 'command must be a non-empty string');
  }
  const command = body.command.trim();
  if (command.length > COMMAND_MAX) {
    throw new McpDomainError('MCP_INVALID_COMMAND', 400, `command exceeds ${COMMAND_MAX} chars`);
  }

  const rawArgs = body.args === undefined || body.args === null ? [] : body.args;
  if (!Array.isArray(rawArgs)) {
    throw new McpDomainError('MCP_INVALID_ARGS', 400, 'args must be an array of strings');
  }
  if (rawArgs.length > ARGS_MAX) {
    throw new McpDomainError('MCP_INVALID_ARGS', 400, `args exceeds ${ARGS_MAX} items`);
  }
  const args: string[] = [];
  for (const arg of rawArgs) {
    if (typeof arg !== 'string') {
      throw new McpDomainError('MCP_INVALID_ARGS', 400, 'each arg must be a string');
    }
    if (arg.length > ARG_MAX) {
      throw new McpDomainError('MCP_INVALID_ARGS', 400, `each arg must be <= ${ARG_MAX} chars`);
    }
    args.push(arg);
  }

  const rawEnv = body.env === undefined || body.env === null ? {} : body.env;
  if (!rawEnv || typeof rawEnv !== 'object' || Array.isArray(rawEnv)) {
    throw new McpDomainError('MCP_INVALID_ENV', 400, 'env must be an object of string values');
  }
  const entries = Object.entries(rawEnv as Record<string, unknown>);
  if (entries.length > ENV_MAX) {
    throw new McpDomainError('MCP_INVALID_ENV', 400, `env exceeds ${ENV_MAX} keys`);
  }
  const env: Record<string, string> = {};
  for (const [key, value] of entries) {
    if (typeof value !== 'string') {
      throw new McpDomainError('MCP_INVALID_ENV', 400, 'each env value must be a string');
    }
    if (value.length > ENV_VALUE_MAX) {
      throw new McpDomainError('MCP_INVALID_ENV', 400, `each env value must be <= ${ENV_VALUE_MAX} chars`);
    }
    env[key] = value;
  }

  return { command, args, env };
}

/**
 * 领域工厂：校验并归一化一台服务器。
 * 缺省字段补空值；updated_at 缺失时由注入的 now 生成（读盘时可传 () => ''）。
 */
export function normalizeServer(
  input: unknown,
  deps: { now?: () => string } = {},
): McpServer {
  const body = asRecord(input);
  const name = normalizeName(body.name);
  const { command, args, env } = normalizeCommandSpec(body);

  let description: string | undefined;
  if (body.description !== undefined && body.description !== null) {
    if (typeof body.description !== 'string' || body.description.length > DESCRIPTION_MAX) {
      throw new McpDomainError(
        'MCP_DESCRIPTION_TOO_LONG',
        400,
        `description must be <= ${DESCRIPTION_MAX} chars`,
      );
    }
    const trimmed = body.description.trim();
    if (trimmed.length > 0) description = trimmed;
  }

  const updatedAt =
    typeof body.updated_at === 'string' && body.updated_at.length > 0
      ? body.updated_at
      : (deps.now ?? (() => new Date().toISOString()))();

  return {
    name,
    command,
    args,
    env,
    ...(description !== undefined ? { description } : {}),
    updated_at: updatedAt,
  };
}

/** 列表排序：按 name 字典序，保证输出稳定。 */
export function sortServers(servers: readonly McpServer[]): McpServer[] {
  return servers.slice().sort((a, b) => a.name.localeCompare(b.name));
}
