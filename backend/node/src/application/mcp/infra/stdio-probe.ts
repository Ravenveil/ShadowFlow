/**
 * mcp 域 — stdio 探测实现（外部，技术变化驱动）
 *
 * 试连一台 MCP 服务器：spawn → initialize（5s）→ tools/list（5s），
 * 总耗时上限 12s；无论成败都 close(true)，不留孤儿进程。
 */

import { JsonRpcStdioTransport } from '../../../protocols/jsonrpc-stdio';
import type { ProbeError, ProbeResult, ProbeTool } from '../mcp-model';

const INIT_TIMEOUT_MS = 5000;
const LIST_TIMEOUT_MS = 5000;
const TOTAL_TIMEOUT_MS = 12_000;
const MESSAGE_MAX = 500;

export interface ProbeInput {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

function truncate(message: string): string {
  return message.length > MESSAGE_MAX ? `${message.slice(0, MESSAGE_MAX)}…` : message;
}

function mapTools(result: unknown): ProbeTool[] {
  const list = (result as { tools?: unknown } | null)?.tools;
  if (!Array.isArray(list)) return [];
  const tools: ProbeTool[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    if (typeof rec.name !== 'string') continue;
    tools.push(
      typeof rec.description === 'string'
        ? { name: rec.name, description: rec.description }
        : { name: rec.name },
    );
  }
  return tools;
}

function classify(err: unknown, timedOut: boolean): ProbeError {
  if (timedOut) {
    return { code: 'MCP_TIMEOUT', message: `probe exceeded ${TOTAL_TIMEOUT_MS}ms` };
  }
  const message = err instanceof Error ? err.message : String(err);
  if (/ENOENT|EACCES|EPERM|stdio pipes not available/i.test(message)) {
    return { code: 'MCP_SPAWN_FAILED', message: truncate(message) };
  }
  return { code: 'MCP_HANDSHAKE_FAILED', message: truncate(message) };
}

export async function probeServer(input: ProbeInput): Promise<ProbeResult> {
  const started = Date.now();
  const env = { ...process.env, ...(input.env ?? {}) };
  // 用对象持有 transport：超时分支里工作协程可能仍在跑，finally 必须能关掉它。
  const state: { transport: JsonRpcStdioTransport | null } = { transport: null };
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
    state.transport = JsonRpcStdioTransport.fromCommand(input.command, input.args ?? [], env);
    await state.transport.request(
      'initialize',
      {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'shadowflow-mcp-admin', version: '0.1.0' },
      },
      INIT_TIMEOUT_MS,
    );
    const result = await state.transport.request<unknown>('tools/list', {}, LIST_TIMEOUT_MS);
    return mapTools(result);
  })();

  try {
    const tools = await Promise.race([work, timeout]);
    return { ok: true, tools, duration_ms: Date.now() - started };
  } catch (err) {
    return {
      ok: false,
      tools: [],
      duration_ms: Date.now() - started,
      error: classify(err, timedOut),
    };
  } finally {
    if (timer) clearTimeout(timer);
    if (state.transport) {
      try {
        await state.transport.close(true);
      } catch {
        // 关闭失败不影响探测结论
      }
    }
  }
}
