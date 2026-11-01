/**
 * FileDiffPanel — Polynoia-parity real file diff.
 *
 * Distinct from the YAML-blueprint DiffPanel: this renders a unified diff of
 * an actual workspace file the agents changed (server git-introspect).
 * Long diffs collapse to the first 30 lines with an expand toggle.
 */
import { memo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { DiffLine, TimelineMessage } from '../types';
import styles from '../timeline.module.css';

interface Props {
  msg: Extract<TimelineMessage, { kind: 'file_diff' }>;
}

const COLLAPSE_THRESHOLD = 30;

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

export const FileDiffPanel = memo(function FileDiffPanel({ msg }: Props) {
  const [expanded, setExpanded] = useState(false);
  const collapsible = msg.lines.length > COLLAPSE_THRESHOLD;
  const shown = collapsible && !expanded
    ? msg.lines.slice(0, COLLAPSE_THRESHOLD)
    : msg.lines;
  return (
    <div className={styles.fileDiff}>
      <div className={styles.diffHead}>
        <span className={styles.diffFile}>{msg.path}</span>
        {msg.language ? <span className={styles.fileDiffLang}>{msg.language}</span> : null}
        <span className={styles.diffStats}>
          <span className={styles.diffAdd}>+{msg.added}</span>{' '}
          <span className={styles.diffDel}>−{msg.removed}</span>
        </span>
      </div>
      <div className={styles.diffBody}>
        {shown.map((line, i) => (
          <div key={`${i}-${line.no}`} className={lineClass(line.mark)}>
            <span className={styles.diffGut}>{line.no}</span>
            <span className={markClass(line.mark)}>{line.mark}</span>
            <span className={styles.diffCode}>{line.code}</span>
          </div>
        ))}
      </div>
      {collapsible ? (
        <button
          type="button"
          className={styles.fileDiffToggle}
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {expanded
            ? '收起'
            : `展开全部 ${msg.lines.length} 行`}
        </button>
      ) : null}
    </div>
  );
});
