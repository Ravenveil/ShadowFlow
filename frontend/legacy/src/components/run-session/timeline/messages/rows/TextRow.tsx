/**
 * TextRow — free-form prose paragraph. The "noise" between chips.
 *
 * Round 2.5 enhancement: highlight inline file paths and diff markers
 * (`+78 -0`) without splitting them into separate chips (they're too
 * tiny to deserve their own row). Pure inline-span highlight.
 *
 * Style: same `.text` class as the original AssistantText so the body
 * inherits font / line-height / inline-code styling.
 */
import { memo, type ReactNode } from 'react';
import styles from '../../timeline.module.css';

interface Props {
  body: string;
  /** When true, render a blinking caret at the end of the last text row. */
  streaming?: boolean;
}

/**
 * Regex for tokens we visually highlight inside plain text:
 *   - Windows paths `C:\Users\...` / `D:\VScode\...`
 *   - POSIX paths starting with `/tmp/` `/home/` `/usr/`
 *   - Diff markers `+N -N` (must be adjacent, e.g. `+78 -0`)
 *
 * We use a single combined regex so the split preserves document order
 * and we don't have to scan multiple times.
 */
const HIGHLIGHT_RE =
  /([A-Za-z]:\\[^\s"'`<>|*?]+|~?\/(?:tmp|home|usr|var|etc|opt)\/[^\s"'`<>|*?]+|\+\d+ ?-\d+)/g;

function renderWithHighlights(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let lastEnd = 0;
  HIGHLIGHT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = HIGHLIGHT_RE.exec(text)) !== null) {
    if (m.index > lastEnd) {
      parts.push(text.slice(lastEnd, m.index));
    }
    const token = m[0];
    const isDiff = /^\+\d+ ?-\d+$/.test(token);
    parts.push(
      <span
        key={`hl-${key++}`}
        className={isDiff ? styles.textDiffMark : styles.textPath}
      >
        {token}
      </span>,
    );
    lastEnd = m.index + token.length;
  }
  if (lastEnd < text.length) parts.push(text.slice(lastEnd));
  return parts.length ? parts : [text];
}

export const TextRow = memo(function TextRow({ body, streaming }: Props) {
  return (
    <div className={styles.text}>
      {renderWithHighlights(body)}
      {streaming && <span className={styles.textCaret} aria-hidden />}
    </div>
  );
});
