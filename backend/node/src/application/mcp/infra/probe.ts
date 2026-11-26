/**
 * mcp 域 — 探测统一分发（外部，技术变化驱动）
 *
 * 用例层只依赖 `ProbeFn`，真正按 transport 分派在这里：
 *   - stdio → 复用既有 `stdio-probe`（spawn + JSON-RPC over stdio）
 *   - http  → protocol/http-mcp（Streamable HTTP / 旧版 SSE 自动协商），
 *             总耗时上限同为 12s
 */

import { HttpMcpClient, HttpMcpError } from '../../../protocols/http-mcp';
import type { McpTarget, ProbeError, ProbeErrorCode, ProbeResult } from '../mcp-model';
import { probeServer } from './stdio-probe';

const TOTAL_TIMEOUT_MS = 12_000;
const MESSAGE_MAX = 500;

function truncate(message: string): string {
  return message.length > MESSAGE_MAX ? `${message.slice(0, MESSAGE_MAX)}…` : message;
}

function classifyHttp(err: unknown, timedOut: boolean): ProbeError {
  if (timedOut) {
    return { code: 'MCP_TIMEOUT', message: `probe exceeded ${TOTAL_TIMEOUT_MS}ms` };
  }
  if (err instanceof HttpMcpError) {
    const code: ProbeErrorCode = err.code;
    return { code, message: truncate(err.message) };
  }
  const message = err instanceof Error ? err.message : String(err);
  if (/ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ECONNRESET|EPIPE|fetch failed|socket hang up|aborted/i.test(message)) {
    return { code: 'MCP_HTTP_UNREACHABLE', message: truncate(message) };
  }
  return { code: 'MCP_HTTP_PROTOCOL', message: truncate(message) };
}

async function probeHttp(target: McpTarget): Promise<ProbeResult> {
  const started = Date.now();
  if (!target.url) {
    return {
      ok: false,
      tools: [],
      duration_ms: 0,
      error: { code: 'MCP_HTTP_PROTOCOL', message: 'http transport requires url' },
    };
  }

  const url = target.url;
  const state: { client: HttpMcpClient | null } = { client: null };
  let timedOut = false;
  let timer: NodeJS.Timeout | undefined;

  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      reject(new Error(`probe exceeded ${TOTAL_TIMEOUT_MS}ms`));
    }, TOTAL_TIMEOUT_MS);
    if (typeof timer.unref === 'function') timer.unref();
  });

  const work = (async () => {
    const client = await HttpMcpClient.connect({
      url,
      headers: target.headers,
      clientInfo: { name: 'shadowflow-mcp-admin', version: '0.1.0' },
    });
    state.client = client;
    try {
      return await client.listTools();
    } catch (err) {
      await client.close();
      throw err;
    }
  })();

  try {
    const tools = await Promise.race([work, timeout]);
    return { ok: true, tools, duration_ms: Date.now() - started };
  } catch (err) {
    return {
      ok: false,
      tools: [],
      duration_ms: Date.now() - started,
      error: classifyHttp(err, timedOut),
    };
  } finally {
    if (timer) clearTimeout(timer);
    if (state.client) {
      try {
        await state.client.close();
      } catch {
        // 关闭失败不影响探测结论
      }
    }
  }
}

export async function probeTarget(target: McpTarget): Promise<ProbeResult> {
  if (target.transport === 'http') return probeHttp(target);
  return probeServer({ command: target.command, args: target.args, env: target.env });
}
