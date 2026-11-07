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

/**
 * P1-1 audit recommendation — until server emits structured segments, fake
 * diff-stat / file / number highlighting client-side via regex. Matches:
 *   +12 lines / -3 lines      → .echoAdd / .echoDel
 *   files like foo.ts:42      → .echoFile
 *   bare integers 632t / 12.4s → .echoNum
 * Non-matching slices fall through as plain text.
 */
type Seg = { kind: 'text' | 'add' | 'del' | 'file' | 'num'; text: string };

const HIGHLIGHT_RE =
  /([+-]\d+(?:\s*(?:lines?|行))?)|([\w./-]+\.(?:ts|tsx|js|jsx|json|yaml|yml|md|py|css|html|sh|toml)(?::\d+)?)|(\b\d+(?:\.\d+)?(?:s|ms|t|k|kb|mb)\b)/gi;

function segmentBody(raw: string): Seg[] {
  const segs: Seg[] = [];
  let lastIdx = 0;
  for (const m of raw.matchAll(HIGHLIGHT_RE)) {
    const start = m.index ?? 0;
    if (start > lastIdx) {
      segs.push({ kind: 'text', text: raw.slice(lastIdx, start) });
    }
    if (m[1] !== undefined) {
      segs.push({
        kind: m[1].trim().startsWith('+') ? 'add' : 'del',
        text: m[1],
      });
    } else if (m[2] !== undefined) {
      segs.push({ kind: 'file', text: m[2] });
    } else if (m[3] !== undefined) {
      segs.push({ kind: 'num', text: m[3] });
    }
    lastIdx = start + m[0].length;
  }
  if (lastIdx < raw.length) segs.push({ kind: 'text', text: raw.slice(lastIdx) });
  return segs;
}

const segClass: Record<Seg['kind'], string> = {
  text: '',
  add: styles.echoAdd,
  del: styles.echoDel,
  file: styles.echoFile,
  num: styles.echoNum,
};

export const ToolEchoLine = memo(function ToolEchoLine({ msg }: Props) {
  const segs = useMemo(() => segmentBody(stripToolXml(msg.body)), [msg.body]);
  if (segs.length === 0) return null;
  if (segs.every((s) => !s.text.trim())) return null;
  return (
    <div className={styles.echo}>
      <span className={styles.echoGlyph} aria-hidden>
        ⎿
      </span>
      <span className={styles.echoBody}>
        {segs.map((s, i) =>
          s.kind === 'text' ? (
            <span key={i}>{s.text}</span>
          ) : (
            <span key={i} className={segClass[s.kind]}>
              {s.text}
            </span>
          ),
        )}
      </span>
    </div>
  );
});
