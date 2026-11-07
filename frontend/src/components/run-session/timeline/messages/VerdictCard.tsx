/**
 * VerdictCard — Polynoia-parity verifier / critique verdict.
 *
 * Aggregate score with a proportion bar, per-dimension metrics rows
 * (expandable rationale detail) and notes. Emitted from the run's critique
 * pass (5-dim LLM critique) — scores are real model output, never fabricated.
 */
import { memo, useState } from 'react';
import { ChevronDown, ChevronRight, ShieldCheck } from 'lucide-react';
import type { TimelineMessage } from '../types';
import styles from '../timeline.module.css';

interface Props {
  msg: Extract<TimelineMessage, { kind: 'verdict_card' }>;
}

export const VerdictCard = memo(function VerdictCard({ msg }: Props) {
  const [open, setOpen] = useState(false);
  const max = msg.max_score ?? 10;
  const pct =
    typeof msg.score === 'number' && max > 0
      ? Math.max(0, Math.min(100, Math.round((msg.score / max) * 100)))
      : null;
  const good = typeof msg.score === 'number' ? msg.score / max >= 0.7 : msg.passed === true;
  return (
    <div className={styles.verdictCard} data-good={good || undefined}>
      <div className={styles.verdictHead}>
        <ShieldCheck size={14} className={styles.verdictIcon} aria-hidden />
        <span className={styles.verdictTitle}>{msg.title}</span>
        {typeof msg.score === 'number' ? (
          <span className={styles.verdictScore}>
            {msg.score}
            <span className={styles.verdictMax}>/{max}</span>
          </span>
        ) : null}
        {pct !== null ? (
          <span className={styles.verdictBar} aria-hidden>
            <i style={{ width: `${pct}%` }} />
          </span>
        ) : null}
      </div>
      {msg.summary ? <div className={styles.verdictSummary}>{msg.summary}</div> : null}
      {msg.metrics && msg.metrics.length > 0 ? (
        <div className={styles.verdictMetrics}>
          <button
            type="button"
            className={styles.verdictToggle}
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
          >
            {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            {msg.metrics.length} 项指标
          </button>
          {open ? (
            <div className={styles.verdictMetricList}>
              {msg.metrics.map((m, i) => (
                <div key={i} className={styles.verdictMetric}>
                  <span className={styles.verdictMetricLabel}>{m.label}</span>
                  <span className={styles.verdictMetricValue}>{m.value}</span>
                  {m.detail ? (
                    <span className={styles.verdictMetricDetail}>{m.detail}</span>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {msg.notes && msg.notes.length > 0 ? (
        <div className={styles.verdictNotes}>
          {msg.notes.map((n, i) => (
            <span key={i} className={styles.verdictNote}>
              {n}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
});
