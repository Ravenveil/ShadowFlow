/**
 * CodeBlockRow — generic fenced code block (non-bash). Used for python /
 * typescript / json / etc. Render: small lang badge + mono code body in
 * a recessed dark block.
 *
 * Visual contract: not a bubble — uses the same flat-row treatment as
 * BashChip but always renders the body inline (no fold). Keeps the
 * Round 2.5 "chip header + content" rhythm.
 */
import { memo } from 'react';
import styles from '../../timeline.module.css';

interface Props {
  /** Language identifier (`python` / `typescript` / `json` / `text`). */
  lang: string;
  /** Code body, no trailing newline. */
  body: string;
}

export const CodeBlockRow = memo(function CodeBlockRow({ lang, body }: Props) {
  return (
    <div className={styles.codeBlock}>
      <div className={styles.chipHeader}>
        <span className={styles.chipLead}>‹›</span>
        <span className={styles.chipKind}>{lang}</span>
        <span className={styles.chipBadge} data-status="info">
          code
        </span>
      </div>
      <pre className={styles.chipExpanded}>{body}</pre>
    </div>
  );
});
