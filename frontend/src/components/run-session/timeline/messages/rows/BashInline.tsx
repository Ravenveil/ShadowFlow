/**
 * BashInline — single-line `$ cmd` chip (no expanded body). The compact
 * cousin of BashChip for "ad-hoc" shell instructions inside prose.
 *
 * Used when the LLM writes a one-liner like:
 *   `$ ls -la`
 * without wrapping it in a ` ```bash ` fence.
 */
import { memo } from 'react';
import styles from '../../timeline.module.css';

interface Props {
  cmd: string;
}

export const BashInline = memo(function BashInline({ cmd }: Props) {
  return (
    <div className={styles.bashChip}>
      <div className={styles.chipHeader}>
        <span className={styles.chipLead}>$</span>
        <span className={styles.chipTitle}>{cmd}</span>
      </div>
    </div>
  );
});
