/**
 * http-mcp.ts — MCP over HTTP 客户端（Node 标准库 fetch，不引第三方依赖）
 *
 * 支持两种形态，connect() 时自动协商：
 *   1. Streamable HTTP（新）：单个 url，POST JSON-RPC，
 *      `Accept: application/json, text/event-stream` + `Content-Type: application/json`；
 *      响应可以是 application/json，也可以是 text/event-stream；从响应头
 *      `Mcp-Session-Id` 保存会话 id 并在后续请求带上；initialize 后发
 *      `notifications/initialized`。
 *   2. 旧版 SSE：GET url（Accept: text/event-stream）等待 `event: endpoint`
 *      帧拿到 POST 地址（相对地址按 url resolve），后续请求 POST 到该地址，
 *      响应从 `event: message` 帧按 id 匹配。
 *
 * 协商顺序：先 POST initialize；404/405（或明确不支持 POST）回退旧版 SSE；
 * 401/403 直接失败为 MCP_HTTP_AUTH。
 *
 * 总超时由调用方控制（每次 request 自带 timeoutMs；close() 中止在途请求与 SSE 连接）。
 */

import { TextDecoder } from 'node:util';
import {
  SseFrameDecoder,
  pickJsonRpcResponse,
  sseFramePayloads,
  type SseFrame,
} from './sse-frames';

export type HttpMcpErrorCode =
  | 'MCP_HTTP_UNREACHABLE'
  | 'MCP_HTTP_AUTH'
  | 'MCP_HTTP_PROTOCOL'
  | 'MCP_TIMEOUT';

const MESSAGE_MAX = 500;
const DEFAULT_TIMEOUT_MS = 30_000;
const CONNECT_TIMEOUT_MS = 10_000;

export class HttpMcpError extends Error {
  constructor(
    public readonly code: HttpMcpErrorCode,
    message: string,
    /** 服务端明确不支持 Streamable POST（404/405）→ 允许回退旧版 SSE。 */
    public readonly unsupported = false,
  ) {
    super(truncate(message));
    this.name = 'HttpMcpError';
  }
}

function truncate(message: string): string {
  return message.length > MESSAGE_MAX ? `${message.slice(0, MESSAGE_MAX)}…` : message;
}

export interface HttpMcpClientOptions {
  url: string;
  headers?: Record<string, string>;
  protocolVersion?: string;
  clientInfo?: { name: string; version: string };
  /** initialize 超时，默认 10s。 */
  connectTimeoutMs?: number;
}

export interface McpToolInfo {
  name: string;
  description?: string;
}

interface PendingCall {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

export class HttpMcpClient {
  private readonly url: string;
  private readonly headers: Record<string, string>;
  private readonly protocolVersion: string;
  private readonly clientInfo: { name: string; version: string };
  private readonly connectTimeoutMs: number;

  private mode: 'streamable' | 'sse' = 'streamable';
  private postUrl: string;
  private sessionId: string | null = null;
  private nextId = 1;
  private pending = new Map<number, PendingCall>();
  private closed = false;
  private readonly abort = new AbortController();

  private endpointPromise: Promise<string> | null = null;
  private endpointResolve: ((url: string) => void) | null = null;
  private endpointReject: ((err: Error) => void) | null = null;

  private constructor(opts: HttpMcpClientOptions) {
    this.url = opts.url;
    this.headers = opts.headers ?? {};
    this.protocolVersion = opts.protocolVersion ?? '2024-11-05';
    this.clientInfo = opts.clientInfo ?? { name: 'shadowflow-mcp', version: '0.1.0' };
    this.connectTimeoutMs = opts.connectTimeoutMs ?? CONNECT_TIMEOUT_MS;
    this.postUrl = opts.url;
  }

  /** 连接 + initialize + notifications/initialized；失败时内部已关闭。 */
  static async connect(opts: HttpMcpClientOptions): Promise<HttpMcpClient> {
    const client = new HttpMcpClient(opts);
    try {
      await client.handshake();
      return client;
    } catch (err) {
      await client.close();
      throw err;
    }
  }

  /** 传输形态（connect 后确定），便于诊断。 */
  get transportMode(): 'streamable' | 'sse' {
    return this.mode;
  }

  private get initParams(): Record<string, unknown> {
    return {
      protocolVersion: this.protocolVersion,
      capabilities: {},
      clientInfo: this.clientInfo,
    };
  }

  private async handshake(): Promise<void> {
    try {
      await this.initializeStreamable();
      this.mode = 'streamable';
      await this.notify('notifications/initialized');
      return;
    } catch (err) {
      if (!(err instanceof HttpMcpError) || !err.unsupported) throw err;
    }
    await this.connectLegacySse();
    this.mode = 'sse';
    await this.notify('notifications/initialized');
  }

  private async initializeStreamable(): Promise<void> {
    const id = this.nextId++;
    await this.postStreamable({ jsonrpc: '2.0', id, method: 'initialize', params: this.initParams }, this.connectTimeoutMs);
  }

  private async connectLegacySse(): Promise<void> {
    this.endpointPromise = new Promise<string>((resolve, reject) => {
      this.endpointResolve = resolve;
      this.endpointReject = reject;
    });
    // 背景读流；失败统一走 rejectEndpoint / failAll，不外抛。
    void this.runSseLoop().catch(() => {});
    const endpoint = await this.raceTimeout(
      this.endpointPromise,
      this.connectTimeoutMs,
      'legacy SSE endpoint handshake',
    );
    this.postUrl = endpoint;
    await this.requestSse('initialize', this.initParams, this.connectTimeoutMs);
  }

  /** 发请求并等待响应；timeoutMs 为单次超时（调用方控制总超时）。 */
  async request<T = unknown>(method: string, params?: unknown, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
    if (this.closed) throw this.fail('MCP_HTTP_PROTOCOL', 'client already closed');
    if (this.mode === 'sse') {
      return (await this.requestSse(method, params, timeoutMs)) as T;
    }
    const id = this.nextId++;
    const payload = { jsonrpc: '2.0', id, method, ...(params !== undefined ? { params } : {}) };
    return (await this.postStreamable(payload, timeoutMs)) as T;
  }

  /** fire-and-forget 通知；失败不影响调用方。 */
  async notify(method: string, params?: unknown): Promise<void> {
    if (this.closed) return;
    const payload = { jsonrpc: '2.0', method, ...(params !== undefined ? { params } : {}) };
    try {
      if (this.mode === 'sse') {
        const res = await fetch(this.postUrl, {
          method: 'POST',
          headers: this.buildHeaders(true),
          body: JSON.stringify(payload),
          signal: this.abort.signal,
        });
        await res.body?.cancel();
        return;
      }
      await this.postStreamable(payload, this.connectTimeoutMs);
    } catch {
      // 通知是 best-effort：服务端忽略时后续 tools/list 会暴露真实问题
    }
  }

  async listTools(): Promise<McpToolInfo[]> {
    const result = await this.request<{ tools?: unknown }>('tools/list', {});
    const list = result?.tools;
    if (!Array.isArray(list)) return [];
    const tools: McpToolInfo[] = [];
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

  callTool(name: string, args: Record<string, unknown>, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<unknown> {
    return this.request('tools/call', { name, arguments: args }, timeoutMs);
  }

  /** 关闭：中止在途 fetch / SSE 长连接，并拒绝所有等待中的请求。 */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    try {
      this.abort.abort();
    } catch {
      /* ignore */
    }
    const err = this.fail('MCP_HTTP_PROTOCOL', 'client closed');
    this.rejectEndpoint(err);
    this.failAll(err);
  }

  // ── Streamable HTTP ───────────────────────────────────────────────────

  private async postStreamable(payload: unknown, timeoutMs: number): Promise<unknown> {
    const id = (payload as { id?: number }).id;
    return this.withTimeout(timeoutMs, `JSON-RPC request`, async (signal) => {
      const res = await fetch(this.url, {
        method: 'POST',
        headers: this.buildHeaders(true),
        body: JSON.stringify(payload),
        signal,
      });
      this.checkStatus(res);
      const sid = res.headers.get('mcp-session-id');
      if (sid) this.sessionId = sid;

      if (id === undefined) {
        await res.body?.cancel();
        return undefined;
      }

      const contentType = (res.headers.get('content-type') ?? '').toLowerCase();
      if (contentType.includes('text/event-stream')) {
        return this.readStreamableSse(res, id);
      }

      const text = await res.text();
      if (text.trim().length === 0) {
        throw this.fail('MCP_HTTP_PROTOCOL', `empty response body for "${methodOf(payload)}"`);
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw this.fail('MCP_HTTP_PROTOCOL', `invalid JSON response: ${text}`);
      }
      const picked = pickJsonRpcResponse(parsed, id);
      if (!picked) {
        throw this.fail('MCP_HTTP_PROTOCOL', `no JSON-RPC response for id ${id}`);
      }
      if (picked.error) {
        throw this.fail('MCP_HTTP_PROTOCOL', `${picked.error.code}: ${picked.error.message}`);
      }
      return picked.result;
    });
  }

  /** 逐块读 SSE 响应体，直到出现匹配 id 的响应帧。 */
  private async readStreamableSse(res: Response, id: number): Promise<unknown> {
    const body = res.body;
    if (!body) throw this.fail('MCP_HTTP_PROTOCOL', 'SSE response has no body');
    const reader = body.getReader();
    const decoder = new TextDecoder();
    const sse = new SseFrameDecoder();
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value) continue;
        for (const frame of sse.push(decoder.decode(value, { stream: true }))) {
          for (const msg of sseFramePayloads(frame)) {
            const picked = pickJsonRpcResponse(msg, id);
            if (!picked) continue;
            if (picked.error) {
              throw this.fail('MCP_HTTP_PROTOCOL', `${picked.error.code}: ${picked.error.message}`);
            }
            return picked.result;
          }
        }
      }
      throw this.fail('MCP_HTTP_PROTOCOL', `SSE stream ended without response for id ${id}`);
    } finally {
      try {
        await reader.cancel();
      } catch {
        /* ignore */
      }
    }
  }

  // ── 旧版 SSE ─────────────────────────────────────────────────────────

  private async runSseLoop(): Promise<void> {
    let res: Response;
    try {
      res = await fetch(this.url, {
        method: 'GET',
        headers: { ...this.headers, Accept: 'text/event-stream' },
        signal: this.abort.signal,
      });
    } catch (err) {
      const failure =
        this.closed
          ? this.fail('MCP_HTTP_PROTOCOL', 'client closed')
          : this.fail('MCP_HTTP_UNREACHABLE', `SSE connect failed: ${errorMessage(err)}`);
      this.rejectEndpoint(failure);
      this.failAll(failure);
      return;
    }
    if (res.status === 401 || res.status === 403) {
      const failure = this.fail('MCP_HTTP_AUTH', `HTTP ${res.status} ${res.statusText} on SSE stream`);
      this.rejectEndpoint(failure);
      this.failAll(failure);
      return;
    }
    if (!res.ok || !res.body) {
      const failure = this.fail('MCP_HTTP_PROTOCOL', `SSE stream HTTP ${res.status} ${res.statusText}`);
      this.rejectEndpoint(failure);
      this.failAll(failure);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    const sse = new SseFrameDecoder();
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value) continue;
        for (const frame of sse.push(decoder.decode(value, { stream: true }))) {
          this.handleLegacyFrame(frame);
        }
      }
    } catch (err) {
      if (!this.closed) {
        const failure = this.fail('MCP_HTTP_PROTOCOL', `SSE stream error: ${errorMessage(err)}`);
        this.rejectEndpoint(failure);
        this.failAll(failure);
      }
      return;
    } finally {
      try {
        await reader.cancel();
      } catch {
        /* ignore */
      }
    }
    if (!this.closed) {
      const failure = this.fail('MCP_HTTP_PROTOCOL', 'SSE stream closed by server');
      this.rejectEndpoint(failure);
      this.failAll(failure);
    }
  }

  private handleLegacyFrame(frame: SseFrame): void {
    if (frame.event === 'endpoint') {
      const raw = frame.data.trim();
      try {
        this.resolveEndpoint(new URL(raw, this.url).toString());
      } catch {
        this.rejectEndpoint(this.fail('MCP_HTTP_PROTOCOL', `invalid endpoint frame: ${raw}`));
      }
      return;
    }
    for (const msg of sseFramePayloads(frame)) {
      this.dispatchPayload(msg);
    }
  }

  private async requestSse(method: string, params: unknown, timeoutMs: number): Promise<unknown> {
    const id = this.nextId++;
    const settled = new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending.delete(id)) {
          reject(this.fail('MCP_TIMEOUT', `request "${method}" timed out after ${timeoutMs}ms`));
        }
      }, timeoutMs);
      if (typeof timer.unref === 'function') timer.unref();
      this.pending.set(id, { resolve, reject, timer });
    });

    const payload = { jsonrpc: '2.0', id, method, ...(params !== undefined ? { params } : {}) };
    let res: Response;
    try {
      res = await fetch(this.postUrl, {
        method: 'POST',
        headers: this.buildHeaders(true),
        body: JSON.stringify(payload),
        signal: this.abort.signal,
      });
    } catch (err) {
      this.abandon(id);
      throw this.closed
        ? this.fail('MCP_HTTP_PROTOCOL', 'client closed')
        : this.fail('MCP_HTTP_UNREACHABLE', `POST failed: ${errorMessage(err)}`);
    }

    if (res.status === 401 || res.status === 403) {
      this.abandon(id);
      throw this.fail('MCP_HTTP_AUTH', `HTTP ${res.status} ${res.statusText}`);
    }
    if (!res.ok) {
      this.abandon(id);
      throw this.fail('MCP_HTTP_PROTOCOL', `HTTP ${res.status} ${res.statusText}`);
    }

    const contentType = (res.headers.get('content-type') ?? '').toLowerCase();
    if (contentType.includes('application/json')) {
      // 兼容把响应直接回在 POST body 里的实现
      const text = await res.text();
      try {
        this.dispatchPayload(JSON.parse(text));
      } catch {
        /* 非 JSON：仍需等 SSE 帧 */
      }
    } else {
      await res.body?.cancel();
    }

    return settled;
  }

  // ── 公共工具 ─────────────────────────────────────────────────────────

  private buildHeaders(withContentType: boolean): Record<string, string> {
    return {
      Accept: 'application/json, text/event-stream',
      ...(withContentType ? { 'Content-Type': 'application/json' } : {}),
      ...(this.sessionId ? { 'Mcp-Session-Id': this.sessionId } : {}),
      ...this.headers,
    };
  }

  private checkStatus(res: Response): void {
    if (res.status === 401 || res.status === 403) {
      throw this.fail('MCP_HTTP_AUTH', `HTTP ${res.status} ${res.statusText}`);
    }
    if (res.status === 404 || res.status === 405) {
      throw this.fail('MCP_HTTP_PROTOCOL', `HTTP ${res.status} ${res.statusText} (streamable HTTP unsupported)`, true);
    }
    if (!res.ok) {
      throw this.fail('MCP_HTTP_PROTOCOL', `HTTP ${res.status} ${res.statusText}`);
    }
  }

  private dispatchPayload(payload: unknown): void {
    const items = Array.isArray(payload) ? payload : [payload];
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const rec = item as Record<string, unknown>;
      const id = rec.id;
      if (typeof id !== 'number') continue;
      const pend = this.pending.get(id);
      if (!pend) continue; // 未匹配的响应/通知，忽略
      this.pending.delete(id);
      clearTimeout(pend.timer);
      const error = rec.error as { code?: unknown; message?: unknown } | undefined;
      if (error && typeof error === 'object') {
        pend.reject(this.fail('MCP_HTTP_PROTOCOL', `${error.code ?? '?'}: ${String(error.message ?? '')}`));
      } else {
        pend.resolve(rec.result);
      }
    }
  }

  private abandon(id: number): void {
    const pend = this.pending.get(id);
    if (!pend) return;
    this.pending.delete(id);
    clearTimeout(pend.timer);
  }

  private failAll(err: Error): void {
    for (const [, pend] of this.pending) {
      clearTimeout(pend.timer);
      pend.reject(err);
    }
    this.pending.clear();
  }

  private resolveEndpoint(url: string): void {
    const resolve = this.endpointResolve;
    this.endpointResolve = null;
    this.endpointReject = null;
    resolve?.(url);
  }

  private rejectEndpoint(err: Error): void {
    const reject = this.endpointReject;
    this.endpointResolve = null;
    this.endpointReject = null;
    reject?.(err);
  }

  private fail(code: HttpMcpErrorCode, message: string, unsupported = false): HttpMcpError {
    return new HttpMcpError(code, message, unsupported);
  }

  /** fetch + 读 body 全流程的超时（超时后 abort 在途连接）。 */
  private async withTimeout<T>(
    timeoutMs: number,
    label: string,
    fn: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const ac = new AbortController();
    const onAbort = () => ac.abort();
    this.abort.signal.addEventListener('abort', onAbort, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      ac.abort();
    }, timeoutMs);
    if (typeof timer.unref === 'function') timer.unref();
    try {
      return await fn(ac.signal);
    } catch (err) {
      if (err instanceof HttpMcpError) throw err;
      if (this.closed) throw this.fail('MCP_HTTP_PROTOCOL', 'client closed');
      if (timedOut) throw this.fail('MCP_TIMEOUT', `${label} timed out after ${timeoutMs}ms`);
      throw this.fail('MCP_HTTP_UNREACHABLE', `fetch failed: ${errorMessage(err)}`);
    } finally {
      clearTimeout(timer);
      this.abort.signal.removeEventListener('abort', onAbort);
    }
  }

  private raceTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(this.fail('MCP_TIMEOUT', `${label} timed out after ${timeoutMs}ms`)),
        timeoutMs,
      );
      if (typeof timer.unref === 'function') timer.unref();
      promise.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (err) => {
          clearTimeout(timer);
          reject(err);
        },
      );
    });
  }
}

function methodOf(payload: unknown): string {
  const method = (payload as { method?: unknown }).method;
  return typeof method === 'string' ? method : 'request';
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
