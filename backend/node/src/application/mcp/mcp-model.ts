/**
 * mcp 域 — 领域模型（内部，业务变化驱动）
 *
 * MCP 服务器注册表：`.shadowflow/mcp.json` 的管理面。
 * 纯领域规则，禁止 import express / fs / sqlite / child_process；
 * 校验/归一化/排序都在这里，infra 与 http 只做 IO 和形状映射。
 */

/** 传输形态：stdio（子进程）/ http（Streamable HTTP 或旧版 SSE）。 */
export type McpTransport = 'stdio' | 'http';

/**
 * 一台 MCP 服务器的持久化形状（与既有 mcp.json 兼容）。
 * 旧数据只有 name/command/args/env —— 读入时按 stdio 处理，不报错。
 */
export interface McpServer {
  name: string;
  transport: McpTransport;
  command: string;
  args: string[];
  env: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  description?: string;
  updated_at: string;
}

/** 探测目标（不含 name）：stdio 只认 command/args/env，http 只认 url/headers。 */
export interface McpTarget {
  transport: McpTransport;
  command: string;
  args: string[];
  env: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
}

/** 探测（试连）结果形状。定义在 model 里，用例层才不用 import infra。 */
export type ProbeErrorCode =
  | 'MCP_TIMEOUT'
  | 'MCP_SPAWN_FAILED'
  | 'MCP_HANDSHAKE_FAILED'
  | 'MCP_HTTP_UNREACHABLE'
  | 'MCP_HTTP_AUTH'
  | 'MCP_HTTP_PROTOCOL';

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
export const URL_MAX = 2048;
export const HEADERS_MAX = 32;
export const HEADER_VALUE_MAX = 2048;

const NAME_RE = /^[A-Za-z0-9._-]{1,64}$/;

export type McpErrorCode =
  | 'MCP_INVALID_NAME'
  | 'MCP_INVALID_TRANSPORT'
  | 'MCP_INVALID_COMMAND'
  | 'MCP_INVALID_ARGS'
  | 'MCP_INVALID_ENV'
  | 'MCP_INVALID_URL'
  | 'MCP_INVALID_HEADERS'
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

/** 传输形态：缺省视为 stdio（兼容旧 mcp.json 条目）。 */
export function normalizeTransport(input: unknown): McpTransport {
  if (input === undefined || input === null || input === '') return 'stdio';
  if (input === 'stdio' || input === 'http') return input;
  throw new McpDomainError(
    'MCP_INVALID_TRANSPORT',
    400,
    `transport must be "stdio" or "http", got ${JSON.stringify(input)}`,
  );
}

/** http 传输的 url：必填、http/https、≤2048。 */
export function normalizeUrl(input: unknown): string {
  if (typeof input !== 'string' || input.trim().length === 0) {
    throw new McpDomainError('MCP_INVALID_URL', 400, 'url must be a non-empty string for http transport');
  }
  const url = input.trim();
  if (url.length > URL_MAX) {
    throw new McpDomainError('MCP_INVALID_URL', 400, `url exceeds ${URL_MAX} chars`);
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new McpDomainError('MCP_INVALID_URL', 400, 'url must be an absolute http(s) URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new McpDomainError('MCP_INVALID_URL', 400, `url protocol must be http/https, got "${parsed.protocol}"`);
  }
  return url;
}

/** http 传输的请求头：≤32 键、值为字符串且 ≤2048；空对象归一化为 undefined。 */
export function normalizeHeaders(input: unknown): Record<string, string> | undefined {
  if (input === undefined || input === null) return undefined;
  if (typeof input !== 'object' || Array.isArray(input)) {
    throw new McpDomainError('MCP_INVALID_HEADERS', 400, 'headers must be an object of string values');
  }
  const entries = Object.entries(input as Record<string, unknown>);
  if (entries.length > HEADERS_MAX) {
    throw new McpDomainError('MCP_INVALID_HEADERS', 400, `headers exceeds ${HEADERS_MAX} keys`);
  }
  const headers: Record<string, string> = {};
  for (const [key, value] of entries) {
    if (key.length === 0) {
      throw new McpDomainError('MCP_INVALID_HEADERS', 400, 'header names must be non-empty');
    }
    if (typeof value !== 'string') {
      throw new McpDomainError('MCP_INVALID_HEADERS', 400, 'each header value must be a string');
    }
    if (value.length > HEADER_VALUE_MAX) {
      throw new McpDomainError(
        'MCP_INVALID_HEADERS',
        400,
        `each header value must be <= ${HEADER_VALUE_MAX} chars`,
      );
    }
    headers[key] = value;
  }
  return entries.length > 0 ? headers : undefined;
}

/**
 * 归一化探测/spawn 目标 `{transport,command,args,env,url?,headers?}`（不含 name）。
 * - stdio：command 必填；url/headers 丢弃
 * - http：url 必填；command 归 ''、args=[]、env={}
 */
export function normalizeTarget(input: unknown): McpTarget {
  const body = asRecord(input);
  const transport = normalizeTransport(body.transport);

  if (transport === 'http') {
    const url = normalizeUrl(body.url);
    const headers = normalizeHeaders(body.headers);
    return {
      transport,
      command: '',
      args: [],
      env: {},
      url,
      ...(headers !== undefined ? { headers } : {}),
    };
  }

  const { command, args, env } = normalizeCommandSpec(body);
  return { transport, command, args, env };
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
  const target = normalizeTarget(body);

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
    transport: target.transport,
    command: target.command,
    args: target.args,
    env: target.env,
    ...(target.url !== undefined ? { url: target.url } : {}),
    ...(target.headers !== undefined ? { headers: target.headers } : {}),
    ...(description !== undefined ? { description } : {}),
    updated_at: updatedAt,
  };
}

/** 列表排序：按 name 字典序，保证输出稳定。 */
export function sortServers(servers: readonly McpServer[]): McpServer[] {
  return servers.slice().sort((a, b) => a.name.localeCompare(b.name));
}
