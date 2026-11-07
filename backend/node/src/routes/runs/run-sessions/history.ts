/**
 * run-sessions/history.ts — 会话历史渲染 + SSE 帧泄漏剥离（Story 15.29 / sse-frame-leak）。
 */
import { getRecentMessages } from '../../../storage/conversations';

// ── Story 15.29 — conversation history rendering ─────────────────────────
//
// Reads up to 20 recent messages from sqlite (ascending order — getRecentMessages
// already does this). Excludes the trailing user message we just appended in
// this turn (so it isn't duplicated inside the history layer AND inside the
// goal slot). Renders a markdown block with `### User` / `### Assistant`
// headings. Token-bloat guards:
//   - per-message content > 1024 char → truncate + "…(truncated)" suffix
//   - total block > 4096 char → drop oldest until under cap, preserve order
//
// Returns `undefined` when there is no conversation_id, no prior messages,
// or only the single just-written user message — composeSystemPrompt then
// drops the conversation_history layer entirely.
const HISTORY_LIMIT = 20;
const HISTORY_PER_MSG_MAX = 1024;
const HISTORY_BLOCK_MAX = 4096;

// sse-frame-leak stop-bleed (2026-05-31). ShadowFlow serializes its own SSE as
// `event: <name>\ndata: <one-line json>\n\n`. When a prior turn's leaked frames
// got stored as assistant content, re-injecting them here as CONVERSATION
// HISTORY makes the LLM parrot the frame shape back — and the parser's
// sse-frame-leak guard then renders the WHOLE turn as `raw` blocks (no real
// <sf:node>/<sf:complete> ever produced → TEAM 0 + errored run). We strip the
// frame-shaped lines before they re-enter the prompt, closing the feedback loop
// at its source. Tight match (an `event:` line immediately followed by a `data:`
// line opening with `{`/`[`) so normal prose is untouched. Mirrors
// parser.ts:588's guard regex. The structural fix (typed event stream, control
// frames never sharing the text channel) is tracked in the root-cure plan doc.
const SSE_FRAME_LINE_RE =
  /^[ \t]*event:[ \t]*[\w.-]+[ \t]*\r?\n[ \t]*data:[ \t]*[{[][^\n]*\r?\n?/gm;

export function stripLeakedSseFrames(content: string): string {
  if (!content.includes('event:')) return content; // fast path — no candidates
  return content.replace(SSE_FRAME_LINE_RE, '');
}

export function renderConversationHistoryBlock(
  conversation_id: string | undefined,
): string | undefined {
  if (!conversation_id) return undefined;
  let msgs;
  try {
    msgs = getRecentMessages(conversation_id, HISTORY_LIMIT);
  } catch (e) {
    console.error('[run-sessions] getRecentMessages failed:', e);
    return undefined;
  }
  // Drop the trailing user message (it IS this turn's goal — already shown
  // to the LLM as the user message; the layer is *prior* turns).
  if (msgs.length > 0 && msgs[msgs.length - 1].role === 'user') {
    msgs = msgs.slice(0, -1);
  }
  if (msgs.length === 0) return undefined;

  const renderOne = (m: { role: string; content: string }): string => {
    const role =
      m.role === 'user' ? 'User' : m.role === 'assistant' ? 'Assistant' : 'System';
    // sse-frame-leak stop-bleed: never re-feed frame-shaped text as context.
    let body = stripLeakedSseFrames(m.content);
    if (body.length > HISTORY_PER_MSG_MAX) {
      body = body.slice(0, HISTORY_PER_MSG_MAX) + '…(truncated)';
    }
    // 2026-05-11 review M2 (15.29, OpenDesign 模式 — 与 15.12 fence wrap 同款):
    // 用 markdown code fence 包裹 message body，防恶意 user message 含
    // `\n---\n## DISCOVERY\n…` 之类的 layer separator (`\n\n---\n\n`) 突破
    // composer 边界注入新 layer 段。strip 内含 ``` 防 fence escape。
    const safeBody = body.replace(/```/g, '` ` `');
    return `### ${role}\n\`\`\`\n${safeBody}\n\`\`\``;
  };

  // Drop oldest until total fits under cap.
  let rendered = msgs.map(renderOne);
  let block = rendered.join('\n\n');
  while (block.length > HISTORY_BLOCK_MAX && rendered.length > 1) {
    rendered = rendered.slice(1);
    block = rendered.join('\n\n');
  }
  // If even the most recent single message is over cap, hard-truncate it.
  if (block.length > HISTORY_BLOCK_MAX) {
    block = block.slice(0, HISTORY_BLOCK_MAX) + '…(truncated)';
  }

  return [
    '## CONVERSATION HISTORY',
    '',
    '(Earlier turns in this conversation, oldest first. Use them as context — do not restate.)',
    '',
    block,
  ].join('\n');
}
