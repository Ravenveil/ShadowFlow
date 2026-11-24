/**
 * BashChip — TRAE / OpenDesign style inline command chip:
 *
 *   $ Bash   {label or cmd}            [done]   [output ▾]
 *   ┌─────────────────────────────────────────────────────┐
 *   │ npm install                                         │
 *   │ npm run dev                                         │
 *   └─────────────────────────────────────────────────────┘   ← only when expanded
 *
 * Visual contract: zero-bubble flat row. The header is a single line,
 * `[output]` toggles a black-bg mono code block below. Status badge is
 * always `[done]` because we're rendering post-stream LLM markdown (no
 * live tool execution status from the FE perspective).
 *
 * Used by AssistantText after extractRows() identifies a ` ```bash` block.
 */
import { memo, useState } from 'react';
import styles from '../../timeline.module.css';

interface Props {
  /** Optional explicit label from ` ```bash title="..."`. */
  label?: string;
  /** First line of the body — shown next to `$` in collapsed state. */
  cmd: string;
  /** Full body (including the cmd line) — shown when expanded. */
  body: string;
  /**
   * Initial expanded state. Default false (chip collapsed). Long blocks
   * stay folded so the timeline keeps a chip-row feel.
   */
  defaultOpen?: boolean;
}

export const BashChip = memo(function BashChip({
  label,
  cmd,
  body,
  defaultOpen = false,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const hasMultilineBody = body.includes('\n');
  return (
    <div className={styles.bashChip}>
      <div className={styles.chipHeader}>
        <span className={styles.chipLead}>$</span>
        <span className={styles.chipKind}>Bash</span>
        <span className={styles.chipTitle}>{label ?? cmd}</span>
        <span className={styles.chipBadge} data-status="done">
          done
        </span>
        {hasMultilineBody && (
          <button
            type="button"
            className={styles.chipToggle}
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
          >
            {open ? 'hide' : 'output'}
            <span
              className={
                open
                  ? `${styles.chipChev} ${styles.chipChevOpen}`
                  : styles.chipChev
              }
            >
              ›
            </span>
          </button>
        )}
      </div>
      {open && hasMultilineBody && (
        <pre className={styles.chipExpanded}>{body}</pre>
      )}
    </div>
  );
});
