/**
 * AssistantText — natural-language assistant reply bubble. Aggregated by the
 * server projector (one message id, many `text_append` patches). Renders as a
 * single continuous block, *not* one DOM node per chunk — that was the v8
 * "fragmented messages" bug.
 *
 * Defensive XML strip: even though the server parser is supposed to extract
 * `<function_calls>` / `<invoke>` / `<parameter>` blocks before they reach
 * `event:'text'`, we belt-and-suspenders strip them here too. Worst case the
 * user sees an empty bubble instead of `<invoke name="Bash">…`.
 *
 * Visual ref: v8 — no exact match because v8 doesn't show free assistant
 * text often, but the closest analogue is `.tl-echo .body` widened to full
 * width. CSS lives in `.text` (timeline.module.css).
 */
import { memo, useMemo } from 'react';
import type { TimelineMessage } from '../types';
import styles from '../timeline.module.css';

interface Props {
  msg: Extract<TimelineMessage, { kind: 'assistant_text' }>;
}

/**
 * Strip Claude Code CLI tool-call XML that should have been intercepted by
 * the server parser. Handles both well-formed and partial (mid-stream) tags
 * so a chunk like `…here is the result.<function_calls>\n<invoke n…` becomes
 * `…here is the result.`.
 */
function stripToolXml(raw: string): string {
  let out = raw;

  // Strip well-formed blocks first.
  out = out.replace(/<function_calls>[\s\S]*?<\/function_calls>/gi, '');
  out = out.replace(/<invoke\b[\s\S]*?<\/invoke>/gi, '');
  out = out.replace(/<parameter\b[^>]*>[\s\S]*?<\/parameter>/gi, '');

  // Cut a trailing partial open tag — useful while a chunk arrives mid-stream
  // and the closing tag hasn't been seen yet. We slice from the partial '<'
  // onward so the user never sees `<function_call`/`<invok`/`<paramet…`.
  const partialMatch = out.match(/<(?:function_calls?|invoke|parameter)\b[^>]*$/i);
  if (partialMatch && partialMatch.index !== undefined) {
    out = out.slice(0, partialMatch.index);
  }

  // Also strip orphan opening-only `<function_calls>` etc. if their close
  // was already consumed by the well-formed regex above (defensive).
  out = out.replace(/<\/?(?:function_calls?|invoke|parameter)\b[^>]*>/gi, '');

  return out;
}

export const AssistantText = memo(function AssistantText({ msg }: Props) {
  const clean = useMemo(() => stripToolXml(msg.body), [msg.body]);

  // Nothing to show after stripping (e.g. the whole chunk was an
  // `<invoke>` block) — render nothing, not even an empty bubble.
  if (!clean.trim()) return null;

  return (
    <div className={styles.text}>
      {clean}
      {msg.streaming && <span className={styles.textCaret} aria-hidden />}
    </div>
  );
});
