/**
 * claude-stream-json.ts — Anthropic Claude CLI line-delimited JSON parser (Story 15.19 v2)
 *
 * 2026-05-11 bug fix — `claude --output-format stream-json --verbose` (the
 * args we now spawn with) emits a NESTED envelope:
 *
 *   {"type":"system","subtype":"init",...}
 *   {"type":"stream_event","event":{"type":"message_start", ...}}
 *   {"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"..."}}}
 *   {"type":"stream_event","event":{"type":"content_block_stop","index":0}}
 *   {"type":"assistant","message":{"id":"...","content":[...]}}
 *   {"type":"result","usage":{...},"total_cost_usd":...,"stop_reason":"end_turn"}
 *
 * Earlier code only matched the FLAT `evt.type==='content_block_delta'` shape
 * (the non-verbose mode), so every line was silently skipped, text_delta
 * never accumulated, and the front-end saw a hung SSE stream → "已达最大
 * 重试次数". This parser now handles BOTH the flat (legacy) and nested
 * (verbose) envelopes, plus the `result` terminator. Reference:
 * github.com/nexu-io/open-design apps/daemon/src/claude-stream.ts.
 */

import type { Readable } from 'node:stream';
import { parseAndExtract, type SseEvent } from '../../parser';
import type { CliStreamArtifactCb } from './plain-line';

interface DeltaShape {
  type?: string;       // 'text_delta' | 'thinking_delta' | 'input_json_delta'
  text?: string;
  thinking?: string;
  partial_json?: string;
}

interface ClaudeFlatEvent {
  type?: string;        // legacy flat: 'content_block_delta' | 'message_start' | ...
  delta?: DeltaShape;
  // 'result' carries usage / stop_reason at the top level
  stop_reason?: string;
  usage?: Record<string, unknown>;
  // 'assistant' / 'user' carry message
  message?: { content?: Array<{ type?: string; text?: string }> };
}

interface ClaudeNestedEvent extends ClaudeFlatEvent {
  // verbose mode: `{type:'stream_event', event:{...}}` wraps the real event.
  event?: ClaudeFlatEvent;
  subtype?: string;     // 'system' subtype: 'init' | 'status'
}

type ClaudeJsonEvent = ClaudeNestedEvent;

/**
 * Extract a text delta from a single parsed JSON line, regardless of whether
 * it's the flat or nested envelope. Returns the text to append, or '' if the
 * event carries no text content.
 */
function extractTextDelta(evt: ClaudeJsonEvent): string {
  // Flat: { type: 'content_block_delta', delta: { type: 'text_delta', text } }
  if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta' && typeof evt.delta.text === 'string') {
    return evt.delta.text;
  }
  // Flat (legacy non-verbose): { type: 'content_block_delta', delta: { text } }
  if (evt.type === 'content_block_delta' && typeof evt.delta?.text === 'string') {
    return evt.delta.text;
  }
  // Nested (verbose): { type: 'stream_event', event: { type: 'content_block_delta', delta: {...} } }
  if (evt.type === 'stream_event' && evt.event) {
    const inner = evt.event;
    if (inner.type === 'content_block_delta' && inner.delta?.type === 'text_delta' && typeof inner.delta.text === 'string') {
      return inner.delta.text;
    }
    if (inner.type === 'content_block_delta' && typeof inner.delta?.text === 'string') {
      return inner.delta.text;
    }
  }
  // Final 'assistant' message wrapper — drain any text content blocks the
  // verbose stream may not have surfaced individually.
  if (evt.type === 'assistant' && Array.isArray(evt.message?.content)) {
    let acc = '';
    for (const block of evt.message!.content!) {
      if (block && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string') {
        acc += block.text;
      }
    }
    return acc;
  }
  return '';
}

/** Is this a stream-terminator event? (`message_stop` / `result`) */
function isTerminator(evt: ClaudeJsonEvent): boolean {
  if (evt.type === 'message_stop' || evt.type === 'result') return true;
  if (evt.type === 'stream_event' && evt.event?.type === 'message_stop') return true;
  return false;
}

export async function* parseClaudeStreamJson(
  stdout: Readable,
  sessionId: string,
  artifactCb: CliStreamArtifactCb,
): AsyncGenerator<SseEvent> {
  // Two buffers:
  //  - `lineBuf`: half-received JSON lines.
  //  - `textBuf`: accumulated text deltas, fed to <sf:*> parser.
  let lineBuf = '';
  let textBuf = '';
  let sawComplete = false;

  // 2026-05-11 review HIGH-1 (15.19): 防恶意/破损 CLI 长时间不发 \n 导致 lineBuf
  // 无界增长 → OOM。1MB 上限对正常 stream 远超富裕，触上限即放弃当前积累
  // 行（resync 到下个 \n）。textBuf 同理 — 但 textBuf 由 <sf:*> 解析器持续 drain，
  // 自然有界，给个 4MB 兜底防极端 case。
  const MAX_LINE_BUF = 1 * 1024 * 1024;
  const MAX_TEXT_BUF = 4 * 1024 * 1024;

  for await (const chunk of stdout) {
    lineBuf += chunk.toString('utf8');
    if (lineBuf.length > MAX_LINE_BUF) {
      console.warn(
        `[claude-stream-json] lineBuf exceeded ${MAX_LINE_BUF}B without newline — resyncing`,
      );
      // Drop everything before the LAST char so we resume at the next chunk.
      lineBuf = lineBuf.slice(-1);
    }
    const lines = lineBuf.split('\n');
    lineBuf = lines.pop() ?? '';
    if (textBuf.length > MAX_TEXT_BUF) {
      console.warn(
        `[claude-stream-json] textBuf exceeded ${MAX_TEXT_BUF}B — truncating`,
      );
      textBuf = textBuf.slice(-MAX_TEXT_BUF / 2);
    }

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      let evt: ClaudeJsonEvent;
      try {
        evt = JSON.parse(line) as ClaudeJsonEvent;
      } catch {
        // Skip malformed line — claude shouldn't emit them but keep robust.
        continue;
      }

      // 2026-05-11 — accept both flat and nested envelopes; see file header.
      const text = extractTextDelta(evt);
      if (text) {
        textBuf += text;
        const { buffer: remaining, events } = parseAndExtract(textBuf, sessionId, artifactCb);
        textBuf = remaining;
        for (const e of events) {
          if (e.event === 'complete') sawComplete = true;
          yield e;
        }
        continue;
      }
      if (isTerminator(evt)) {
        // Drain whatever's left in the text buffer.
        if (textBuf.trim()) {
          const { buffer: remaining, events } = parseAndExtract(textBuf, sessionId, artifactCb);
          textBuf = remaining;
          for (const e of events) {
            if (e.event === 'complete') sawComplete = true;
            yield e;
          }
        }
      }
    }
  }

  // Stream-end drain — same dual-envelope handling.
  if (lineBuf.trim()) {
    try {
      const evt = JSON.parse(lineBuf) as ClaudeJsonEvent;
      const text = extractTextDelta(evt);
      if (text) textBuf += text;
    } catch {
      // ignore
    }
  }
  if (textBuf.trim()) {
    const { events } = parseAndExtract(textBuf, sessionId, artifactCb);
    for (const e of events) {
      if (e.event === 'complete') sawComplete = true;
      yield e;
    }
  }

  if (!sawComplete) {
    yield {
      event: 'complete',
      data: {
        session_id: sessionId,
        run_id: `run-${sessionId.slice(0, 8)}`,
        redirect: `/editor?session=${sessionId}`,
      },
    };
  }
}
