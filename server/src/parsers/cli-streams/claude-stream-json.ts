/**
 * claude-stream-json.ts — Anthropic Claude CLI line-delimited JSON parser (Story 15.19 v2)
 *
 * `claude --output-format stream-json --print` emits one JSON event per line:
 *   {"type":"content_block_delta","delta":{"text":"..."}}
 *   {"type":"message_start", ...}
 *   {"type":"message_stop"}
 *
 * We extract the text deltas, accumulate them into a buffer, and feed that
 * buffer to `parseAndExtract` so any embedded `<sf:*>` tags emitted by the
 * skill prompt are translated to the same SSE events the existing
 * `anthropic-direct` path produces.
 */

import type { Readable } from 'node:stream';
import { parseAndExtract, type SseEvent } from '../../parser';
import type { CliStreamArtifactCb } from './plain-line';

interface ClaudeJsonEvent {
  type?: string;
  delta?: { text?: string; type?: string };
  // We don't care about other fields — schema is permissive on purpose.
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

      if (
        evt.type === 'content_block_delta' &&
        evt.delta &&
        typeof evt.delta.text === 'string'
      ) {
        textBuf += evt.delta.text;
        const { buffer: remaining, events } = parseAndExtract(textBuf, sessionId, artifactCb);
        textBuf = remaining;
        for (const e of events) {
          if (e.event === 'complete') sawComplete = true;
          yield e;
        }
      } else if (evt.type === 'message_stop') {
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

  // Stream-end drain.
  if (lineBuf.trim()) {
    try {
      const evt = JSON.parse(lineBuf) as ClaudeJsonEvent;
      if (evt.delta && typeof evt.delta.text === 'string') {
        textBuf += evt.delta.text;
      }
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
