/**
 * ToolEchoLine — `⎿` indented continuation line below a tool_call chip.
 * Visual ref: v8 .tl-echo (line 1394-1397).
 *
 * Defensive XML strip: tool_echo is a frequent landing place for stray
 * Claude Code CLI `<function_calls>` / `<invoke>` fragments when the server
 * parser misses them. We strip well-formed and partial-open variants so the
 * user never sees raw XML.
 */
import { memo, useMemo } from 'react';
import type { TimelineMessage } from '../types';
import styles from '../timeline.module.css';

interface Props {
  msg: Extract<TimelineMessage, { kind: 'tool_echo' }>;
}

function stripToolXml(raw: string): string {
  let out = raw;
  out = out.replace(/<function_calls>[\s\S]*?<\/function_calls>/gi, '');
  out = out.replace(/<invoke\b[\s\S]*?<\/invoke>/gi, '');
  out = out.replace(/<parameter\b[^>]*>[\s\S]*?<\/parameter>/gi, '');
  const partial = out.match(/<(?:function_calls?|invoke|parameter)\b[^>]*$/i);
  if (partial && partial.index !== undefined) out = out.slice(0, partial.index);
  out = out.replace(/<\/?(?:function_calls?|invoke|parameter)\b[^>]*>/gi, '');
  return out;
}

export const ToolEchoLine = memo(function ToolEchoLine({ msg }: Props) {
  const clean = useMemo(() => stripToolXml(msg.body), [msg.body]);
  if (!clean.trim()) return null;
  return (
    <div className={styles.echo}>
      <span className={styles.echoGlyph} aria-hidden>
        ⎿
      </span>
      <span className={styles.echoBody}>{clean}</span>
    </div>
  );
});
