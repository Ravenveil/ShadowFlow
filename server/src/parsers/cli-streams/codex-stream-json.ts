/**
 * codex-stream-json.ts — OpenAI codex CLI line-delimited JSON parser (Story 15.19 v2)
 *
 * `codex --stream` emits OpenAI-style events:
 *   {"type":"response.output_text.delta","delta":"..."}
 *   {"type":"response.completed"}
 *
 * Like the Claude variant, we extract deltas → text buffer → `parseAndExtract`.
 * If an unknown event shape arrives we treat any string `delta` field as text.
 */

import type { Readable } from 'node:stream';
import { parseAndExtract, type SseEvent } from '../../parser';
import type { CliStreamArtifactCb } from './plain-line';

interface CodexEvent {
  type?: string;
  delta?: unknown;
  text?: unknown;
}

function extractDeltaText(evt: CodexEvent): string | null {
  // Most common shape: delta is a string.
  if (typeof evt.delta === 'string') return evt.delta;
  // Some intermediate codex versions nest `delta.text` or `delta.content`.
  if (evt.delta && typeof evt.delta === 'object') {
    const obj = evt.delta as { text?: unknown; content?: unknown };
    if (typeof obj.text === 'string') return obj.text;
    if (typeof obj.content === 'string') return obj.content;
  }
  if (typeof evt.text === 'string') return evt.text;
  return null;
}

export async function* parseCodexStreamJson(
  stdout: Readable,
  sessionId: string,
  artifactCb: CliStreamArtifactCb,
): AsyncGenerator<SseEvent> {
  let lineBuf = '';
  let textBuf = '';
  let sawComplete = false;

  // 2026-05-11 review HIGH-1 (15.19): 防 unbounded buffer OOM (与 claude-stream-json 同款).
  const MAX_LINE_BUF = 1 * 1024 * 1024;
  const MAX_TEXT_BUF = 4 * 1024 * 1024;

  for await (const chunk of stdout) {
    lineBuf += chunk.toString('utf8');
    if (lineBuf.length > MAX_LINE_BUF) {
      console.warn(`[codex-stream-json] lineBuf exceeded ${MAX_LINE_BUF}B — resyncing`);
      lineBuf = lineBuf.slice(-1);
    }
    const lines = lineBuf.split('\n');
    lineBuf = lines.pop() ?? '';
    if (textBuf.length > MAX_TEXT_BUF) {
      console.warn(`[codex-stream-json] textBuf exceeded ${MAX_TEXT_BUF}B — truncating`);
      textBuf = textBuf.slice(-MAX_TEXT_BUF / 2);
    }

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      let evt: CodexEvent;
      try {
        evt = JSON.parse(line) as CodexEvent;
      } catch {
        continue;
      }

      const deltaText = extractDeltaText(evt);
      if (deltaText !== null) {
        textBuf += deltaText;
        const { buffer: remaining, events } = parseAndExtract(textBuf, sessionId, artifactCb);
        textBuf = remaining;
        for (const e of events) {
          if (e.event === 'complete') sawComplete = true;
          yield e;
        }
      } else if (
        evt.type === 'response.completed' ||
        evt.type === 'message_stop' ||
        evt.type === 'done'
      ) {
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
