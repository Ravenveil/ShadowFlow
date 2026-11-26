/**
 * skill-runners/mcp.ts — MCP (Model Context Protocol) runner (Story 15.23)
 *
 * Spec format: `mcp:<server>/<tool>` — e.g. `mcp:fs/edit_file`.
 *
 * Flow:
 *   1. resolve `<server>` via `.shadowflow/mcp.json` (transport/url/headers 保留)；
 *      条目不存在时回退 PATH 探测（老行为，按 stdio 处理）
 *   2. stdio：spawn + JSON-RPC over stdio，`initialize`（5s timeout）
 *      http ：HttpMcpClient（Streamable HTTP / 旧版 SSE 自动协商）内部完成 initialize
 *   3. 发送 `tools/list`，找不到 `<tool>` → MCP_TOOL_NOT_FOUND
 *   4. 发送 `tools/call`，参数仍为 `{ goal, system }`
 *   5. 把 `result.content[]` 文本拼成单个 delta + end
 *
 * Non-streaming: MCP `tools/call` is request/response (no notifications).
 * The runner therefore yields a single text delta then end.
 */

import { resolveMcpServer } from '../../../../detectors/acp-detector';
import { JsonRpcStdioTransport } from '../../../../protocols/jsonrpc-stdio';
import { HttpMcpClient } from '../../../../protocols/http-mcp';
import { resolveTarget } from '../../../mcp/infra/resolve-target';
import type { McpTarget } from '../../../mcp/mcp-model';
import { parseAndExtract, type SseEvent } from '../../cli-parsers/parser';
import type { RunnerInput } from './types';
import fs from 'node:fs';
import path from 'node:path';

const HANDSHAKE_TIMEOUT_MS = 5000;
const TOOL_CALL_TIMEOUT_MS = 600_000;

const INITIALIZE_PARAMS = {
  protocolVersion: '2024-11-05',
  capabilities: {},
  clientInfo: { name: 'shadowflow-skill-studio', version: '0.1.0' },
};

/** stdio / http 两种运行链路的统一门面（initialize 在 open 阶段完成）。 */
interface McpSession {
  request<T = unknown>(method: string, params?: unknown, timeoutMs?: number): Promise<T>;
  close(): Promise<void>;
}

async function resolveSpawnTarget(serverName: string): Promise<McpTarget> {
  const fromConfig = await resolveTarget(serverName);
  if (fromConfig) return fromConfig;
  // 兼容老行为：mcp.json 没登记时把 name 当 PATH 上的二进制按 stdio 启动。
  const cmd = await resolveMcpServer(serverName);
  return { transport: 'stdio', command: cmd.command, args: cmd.args, env: {} };
}

async function openSession(target: McpTarget): Promise<McpSession> {
  if (target.transport === 'http') {
    if (!target.url) throw new Error('http transport requires url');
    const client = await HttpMcpClient.connect({
      url: target.url,
      headers: target.headers,
      clientInfo: INITIALIZE_PARAMS.clientInfo,
    });
    return {
      request: (method, params, timeoutMs) => client.request(method, params, timeoutMs),
      close: () => client.close(),
    };
  }

  const env = { ...process.env, ...target.env };
  const transport = JsonRpcStdioTransport.fromCommand(target.command, target.args, env);
  try {
    await transport.request('initialize', INITIALIZE_PARAMS, HANDSHAKE_TIMEOUT_MS);
  } catch (err) {
    await transport.close(true);
    throw err;
  }
  return {
    request: (method, params, timeoutMs) => transport.request(method, params, timeoutMs),
    close: () => transport.close(true),
  };
}

function errorCodeOf(err: unknown): string {
  const msg = (err as Error).message ?? String(err);
  const explicit = (err as { code?: unknown }).code;
  if (typeof explicit === 'string' && explicit.startsWith('MCP_')) return explicit;
  if (/timed out/i.test(msg)) return 'MCP_TIMEOUT';
  if (/method not found|tools\/call|^-\d+:/i.test(msg)) return 'MCP_TOOL_ERROR';
  return 'MCP_ERROR';
}

export async function* runMcpExecutor(
  input: RunnerInput,
  spec: string,
): AsyncGenerator<SseEvent> {
  const slash = spec.indexOf('/');
  if (slash <= 0 || slash === spec.length - 1) {
    yield {
      event: 'error',
      data: {
        code: 'MCP_INVALID_SPEC',
        spec,
        message: `expected "<server>/<tool>", got "${spec}"`,
      },
    };
    return;
  }
  const serverName = spec.slice(0, slash);
  const toolName = spec.slice(slash + 1);

  let target: McpTarget;
  try {
    target = await resolveSpawnTarget(serverName);
  } catch (err) {
    const e = err as Error & { code?: string };
    yield {
      event: 'error',
      data: {
        code: e.code === 'MCP_SERVER_NOT_FOUND' ? 'MCP_SERVER_NOT_FOUND' : 'MCP_UNREACHABLE',
        server: serverName,
        message: e.message,
      },
    };
    return;
  }

  let session: McpSession;
  try {
    session = await openSession(target);
  } catch (err) {
    yield {
      event: 'error',
      data: { code: 'MCP_UNREACHABLE', server: serverName, message: (err as Error).message },
    };
    return;
  }

  // Per-session artifact dir.
  try { fs.mkdirSync(input.cwd, { recursive: true }); } catch { /* ignore */ }
  const artifactCallback = (filename: string, content: string, _type: string) => {
    const safeName = path.basename(filename);
    const filePath = path.join(input.cwd, safeName);
    try { fs.writeFileSync(filePath, content, 'utf-8'); } catch { /* ignore */ }
  };

  const onAbort = () => { void session.close(); };
  if (input.signal) {
    if (input.signal.aborted) onAbort();
    else input.signal.addEventListener('abort', onAbort, { once: true });
  }

  try {
    // 1. tools/list — verify tool exists.
    const tools = await session.request<{ tools: Array<{ name: string; inputSchema?: unknown }> }>(
      'tools/list',
      {},
      HANDSHAKE_TIMEOUT_MS,
    );
    const found = (tools.tools ?? []).find((t) => t.name === toolName);
    if (!found) {
      yield {
        event: 'error',
        data: {
          code: 'MCP_TOOL_NOT_FOUND',
          server: serverName,
          tool: toolName,
          message: `tool "${toolName}" not in server "${serverName}". Available: ${(tools.tools ?? []).map((t) => t.name).join(', ') || '(none)'}`,
        },
      };
      return;
    }

    // 2. tools/call
    const result = await session.request<{ content?: Array<{ type: string; text?: string }>; isError?: boolean }>(
      'tools/call',
      { name: toolName, arguments: { goal: input.prompt, system: input.system_prompt } },
      TOOL_CALL_TIMEOUT_MS,
    );

    const text = (result.content ?? [])
      .filter((c) => c.type === 'text' && typeof c.text === 'string')
      .map((c) => c.text!)
      .join('\n');

    if (text) {
      // Run through parser for <sf:*> tag extraction symmetry.
      const { events } = parseAndExtract(text, input.session_id, artifactCallback);
      for (const e of events) yield e;
      // Always also yield raw delta so plain text passes through.
      yield { event: 'delta', data: { text } };
    }

    yield { event: 'end', data: result.isError ? { tool_error: true } : {} };
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    yield { event: 'error', data: { code: errorCodeOf(err), message: msg, server: serverName, tool: toolName } };
  } finally {
    if (input.signal) input.signal.removeEventListener('abort', onAbort);
    await session.close();
  }
}
