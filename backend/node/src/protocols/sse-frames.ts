/**
 * sse-frames.ts — SSE 帧解码与 JSON-RPC 响应匹配（protocols 层共用工具）
 *
 * 从 `text/event-stream` 字节流里切 `event:`/`data:` 帧，并把 message 帧
 * 还原成 JSON-RPC 消息，供 http-mcp.ts 的两种传输形态共用。
 */

export interface SseFrame {
  event: string;
  data: string;
}

/** 增量 SSE 帧解码（`event:` / `data:` 行，空行结束一帧）。 */
export class SseFrameDecoder {
  private buffer = '';
  private eventName = '';
  private dataLines: string[] = [];

  push(chunk: string): SseFrame[] {
    this.buffer += chunk;
    const frames: SseFrame[] = [];
    let idx: number;
    while ((idx = this.buffer.indexOf('\n')) >= 0) {
      let line = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + 1);
      if (line.endsWith('\r')) line = line.slice(0, -1);
      if (line === '') {
        if (this.dataLines.length > 0) {
          frames.push({ event: this.eventName || 'message', data: this.dataLines.join('\n') });
        }
        this.eventName = '';
        this.dataLines = [];
        continue;
      }
      if (line.startsWith(':')) continue; // comment / keep-alive
      const colon = line.indexOf(':');
      const field = colon === -1 ? line : line.slice(0, colon);
      let value = colon === -1 ? '' : line.slice(colon + 1);
      if (value.startsWith(' ')) value = value.slice(1);
      if (field === 'event') this.eventName = value;
      else if (field === 'data') this.dataLines.push(value);
    }
    return frames;
  }
}

export interface PickedResponse {
  result?: unknown;
  error?: { code: unknown; message: unknown };
}

/** 在单个响应或 batch 数组中按 id 找匹配项。 */
export function pickJsonRpcResponse(payload: unknown, id: number): PickedResponse | null {
  const items = Array.isArray(payload) ? payload : [payload];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    if (rec.id !== id) continue;
    if (rec.error && typeof rec.error === 'object') {
      const error = rec.error as { code?: unknown; message?: unknown };
      return { error: { code: error.code, message: error.message } };
    }
    return { result: rec.result };
  }
  return null;
}

/** SSE 帧 → JSON-RPC 消息列表（只认 message 事件；坏 JSON 忽略）。 */
export function sseFramePayloads(frame: SseFrame): unknown[] {
  if (frame.event !== 'message') return [];
  try {
    return [JSON.parse(frame.data)];
  } catch {
    return [];
  }
}
