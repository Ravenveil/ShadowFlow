/**
 * AssistantText — natural-language assistant reply. Round 2.5 splits the
 * incoming markdown body into typed sub-rows (BashChip / CodeBlockRow /
 * BashInline / TextRow) instead of rendering it as one opaque block.
 *
 * Why: the server's BMAD intent path doesn't emit dedicated `tool_call` /
 * `diff_panel` TimelineMessages for inline tool references — it pipes raw
 * markdown. Auditor (round2-implementer-audit-2026-05-24.md) flagged the
 * gap: TRAE / OpenDesign left timelines are full of inline chips. We
 * extract them client-side via `extractRows` so the UI matches without a
 * server change.
 *
 * Defensive XML strip: even though the server parser is supposed to
 * extract `<function_calls>` / `<invoke>` / `<parameter>` blocks before
 * they reach `event:'text'`, we belt-and-suspenders strip them here too.
 * (Pre-Round 2.5 behavior preserved.)
 *
 * Streaming caret: shown on the LAST text/inline row only when
 * `msg.streaming` is true. Chip rows never get the caret (they're
 * structurally complete units).
 */
import { memo, useMemo } from 'react';
import type { TimelineMessage } from '../types';
import styles from '../timeline.module.css';
import { extractRows } from './rows/extractRows';
import { BashChip } from './rows/BashChip';
import { BashInline } from './rows/BashInline';
import { CodeBlockRow } from './rows/CodeBlockRow';
import { TextRow } from './rows/TextRow';
import { SectionHeader } from './SectionHeader';

interface Props {
  msg: Extract<TimelineMessage, { kind: 'assistant_text' }>;
}

/**
 * Strip Claude Code CLI tool-call XML that should have been intercepted
 * by the server parser. Handles both well-formed and partial (mid-stream)
 * tags so a chunk like `…here is the result.<function_calls>\n<invoke n…`
 * becomes `…here is the result.`.
 */
function stripToolXml(raw: string): string {
  let out = raw;

  // Strip well-formed blocks first.
  out = out.replace(/<function_calls>[\s\S]*?<\/function_calls>/gi, '');
  out = out.replace(/<invoke\b[\s\S]*?<\/invoke>/gi, '');
  out = out.replace(/<parameter\b[^>]*>[\s\S]*?<\/parameter>/gi, '');

  // Cut a trailing partial open tag — useful while a chunk arrives mid-
  // stream and the closing tag hasn't been seen yet. We slice from the
  // partial '<' onward so the user never sees `<function_call`/`<invok`/
  // `<paramet…`.
  const partialMatch = out.match(
    /<(?:function_calls?|invoke|parameter)\b[^>]*$/i,
  );
  if (partialMatch && partialMatch.index !== undefined) {
    out = out.slice(0, partialMatch.index);
  }

  // Also strip orphan opening-only `<function_calls>` etc. if their close
  // was already consumed by the well-formed regex above (defensive).
  out = out.replace(
    /<\/?(?:function_calls?|invoke|parameter)\b[^>]*>/gi,
    '',
  );

  return out;
}

export const AssistantText = memo(function AssistantText({ msg }: Props) {
  const rows = useMemo(() => {
    const cleaned = stripToolXml(msg.body);
    return extractRows(cleaned);
  }, [msg.body]);

  // Nothing to show after stripping/parsing (e.g. the whole chunk was an
  // `<invoke>` block) — render nothing, not even an empty bubble.
  if (rows.length === 0) return null;

  // Index of the last "text-ish" row — that's where the streaming caret
  // attaches. Skip chip rows because they're complete units.
  let lastTextIdx = -1;
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i]?.kind === 'text') {
      lastTextIdx = i;
      break;
    }
  }

  return (
    <div className={styles.textStack}>
      {rows.map((row, i) => {
        const key = `r-${i}-${row.kind}`;
        switch (row.kind) {
          case 'bash-chip':
            return (
              <BashChip
                key={key}
                label={row.label}
                cmd={row.cmd}
                body={row.body}
              />
            );
          case 'bash-inline':
            return <BashInline key={key} cmd={row.cmd} />;
          case 'code-chip':
            return <CodeBlockRow key={key} lang={row.lang} body={row.body} />;
          case 'section-header':
            return <SectionHeader key={key} label={row.title} />;
          case 'text':
            return (
              <TextRow
                key={key}
                body={row.body}
                streaming={Boolean(msg.streaming) && i === lastTextIdx}
              />
            );
          default: {
            const _exhaustive: never = row;
            void _exhaustive;
            return null;
          }
        }
      })}
    </div>
  );
});
