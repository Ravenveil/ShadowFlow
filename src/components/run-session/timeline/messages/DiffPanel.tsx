/**
 * DiffPanel — file edit visualisation. Header shows filename + add/del stats,
 * body streams diff lines (+ green / − red / context white). Visual ref:
 * v8 .diff-block (line 1479-1499). Lines arrive incrementally via
 * `diff_append_line` patches; each new line fades in.
 */
import { memo } from 'react';
import type { TimelineMessage, DiffLine } from '../types';
import styles from '../timeline.module.css';

interface Props {
  msg: Extract<TimelineMessage, { kind: 'diff_panel' }>;
}

function lineClass(mark: DiffLine['mark']): string {
  if (mark === '+') return `${styles.diffLine} ${styles.diffLineAdd}`;
  if (mark === '-') return `${styles.diffLine} ${styles.diffLineDel}`;
  return styles.diffLine;
}

function markClass(mark: DiffLine['mark']): string {
  if (mark === '+') return `${styles.diffMark} ${styles.diffMarkAdd}`;
  if (mark === '-') return `${styles.diffMark} ${styles.diffMarkDel}`;
  return styles.diffMark;
}

export const DiffPanel = memo(function DiffPanel({ msg }: Props) {
  return (
    <div className={styles.diff}>
      <div className={styles.diffHead}>
        <span className={styles.diffFile}>{msg.filename}</span>
        <span className={styles.diffStats}>
          <span className={styles.diffAdd}>+{msg.added}</span>{' '}
          <span className={styles.diffDel}>−{msg.removed}</span>
        </span>
      </div>
      <div className={styles.diffBody}>
        {msg.lines.map((line, i) => (
          <div key={`${i}-${line.no}`} className={lineClass(line.mark)}>
            <span className={styles.diffGut}>{line.no}</span>
            <span className={markClass(line.mark)}>{line.mark}</span>
            <span className={styles.diffCode}>
              {line.code}
              {line.cursor && <span className={styles.diffCaret} aria-hidden />}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
});
