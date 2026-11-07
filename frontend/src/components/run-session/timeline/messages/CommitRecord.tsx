/**
 * CommitRecord — Polynoia-parity git commit card.
 *
 * One row per commit the agents made during the run: short sha badge,
 * message, author + date, +/- stats; expandable file list. Real data from
 * server/src/lib/git-introspect.ts (never fabricated).
 */
import { memo, useState } from 'react';
import { ChevronDown, ChevronRight, GitCommitHorizontal } from 'lucide-react';
import type { TimelineMessage } from '../types';
import styles from '../timeline.module.css';

interface Props {
  msg: Extract<TimelineMessage, { kind: 'commit_record' }>;
}

function fmtDate(iso?: string): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(
    d.getMinutes(),
  ).padStart(2, '0')}`;
}

export const CommitRecord = memo(function CommitRecord({ msg }: Props) {
  const [open, setOpen] = useState(false);
  const dateText = fmtDate(msg.date);
  return (
    <div className={styles.commitCard}>
      <div className={styles.commitRow}>
        <GitCommitHorizontal size={14} className={styles.commitIcon} aria-hidden />
        <span className={styles.commitSha}>{msg.short_sha}</span>
        <span className={styles.commitMessage}>{msg.message}</span>
      </div>
      <div className={styles.commitMeta}>
        <span className={styles.commitRepo}>{msg.repo}</span>
        {msg.author ? <span className={styles.commitAuthor}>{msg.author}</span> : null}
        {dateText ? <span className={styles.commitDate}>{dateText}</span> : null}
        {msg.files_changed > 0 ? (
          <span className={styles.commitFiles}>
            {msg.files_changed} files
          </span>
        ) : null}
        <span className={styles.commitStats}>
          <span className={styles.diffAdd}>+{msg.insertions}</span>{' '}
          <span className={styles.diffDel}>−{msg.deletions}</span>
        </span>
        {msg.files && msg.files.length > 0 ? (
          <button
            type="button"
            className={styles.commitToggle}
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
          >
            {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        ) : null}
      </div>
      {open && msg.files && msg.files.length > 0 ? (
        <div className={styles.commitFileList}>
          {msg.files.map((f) => (
            <div key={f.path} className={styles.commitFile}>
              <span className={styles.commitFileStatus} data-status={f.status}>
                {f.status}
              </span>
              <span className={styles.commitFilePath}>{f.path}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
});
