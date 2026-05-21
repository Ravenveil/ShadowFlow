/**
 * StepPanel — collapsible "N steps" panel listing the pipeline's progress.
 * Per contract: **only renders steps with status='done'|'running'**. Pending
 * steps emitted by the projector are filtered out so the user doesn't see
 * pre-allocated placeholder rows.
 *
 * Substeps follow the same rule. Visual ref: v8 .tl-panel/.tl-step/.tl-substep
 * (lines 1440-1476).
 */
import { memo, useState } from 'react';
import type { TimelineMessage, StepRow } from '../types';
import styles from '../timeline.module.css';

interface Props {
  msg: Extract<TimelineMessage, { kind: 'step_panel' }>;
  defaultOpen?: boolean;
}

function formatElapsed(ms?: number): string {
  if (typeof ms !== 'number') return '…';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function StepIcon({ status, index }: { status: StepRow['status']; index: number }) {
  if (status === 'done') {
    return (
      <span className={`${styles.stepIcon} ${styles.stepIconDone}`} aria-hidden>
        ✓
      </span>
    );
  }
  if (status === 'running') {
    return (
      <span className={`${styles.stepIcon} ${styles.stepIconRun}`} aria-hidden>
        <span className={styles.stepSpinner} />
      </span>
    );
  }
  return (
    <span className={styles.stepIcon} aria-hidden>
      {index + 1}
    </span>
  );
}

function SubRow({ sub }: { sub: StepRow }) {
  const dotClass =
    sub.status === 'done'
      ? `${styles.subDot} ${styles.subDotDone}`
      : sub.status === 'running'
      ? `${styles.subDot} ${styles.subDotRun}`
      : styles.subDot;
  const nameClass =
    sub.status === 'done'
      ? `${styles.subName} ${styles.subNameDone}`
      : sub.status === 'running'
      ? `${styles.subName} ${styles.subNameRun}`
      : styles.subName;
  const timeText =
    sub.status === 'running' ? '…' : formatElapsed(sub.elapsed_ms);
  return (
    <div className={styles.sub}>
      <span className={dotClass} aria-hidden />
      <span className={nameClass}>{sub.name}</span>
      <span className={styles.subTime}>{timeText}</span>
    </div>
  );
}

export const StepPanel = memo(function StepPanel({
  msg,
  defaultOpen = true,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  // Contract: only render done + running rows. Pending is reported by
  // projector but suppressed in the UI.
  const visibleSteps = msg.steps.filter((s) => s.status !== 'pending');
  const totalElapsed = msg.steps.reduce((acc, s) => acc + (s.elapsed_ms ?? 0), 0);
  const doneCount = msg.steps.filter((s) => s.status === 'done').length;

  return (
    <div className={styles.panel}>
      <button
        type="button"
        className={styles.panelHead}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span
          className={
            open
              ? `${styles.panelChev} ${styles.panelChevOpen}`
              : styles.panelChev
          }
        >
          ▾
        </span>
        <span className={styles.panelName}>{msg.total_steps} 个步骤</span>
        <span className={styles.panelCt}>
          <b>{doneCount}</b>/{msg.total_steps} · {formatElapsed(totalElapsed)}
        </span>
      </button>
      {open && (
        <div className={styles.steps}>
          {visibleSteps.map((s) => {
            const realIdx = msg.steps.indexOf(s);
            const isRun = s.status === 'running';
            const nameClass = isRun
              ? `${styles.stepName} ${styles.stepNameRun}`
              : styles.stepName;
            const timeClass = isRun
              ? `${styles.stepTime} ${styles.stepTimeRun}`
              : styles.stepTime;
            const visibleSubs =
              s.substeps?.filter((x) => x.status !== 'pending') ?? [];
            return (
              <div key={`${realIdx}-${s.name}`}>
                <div className={styles.step}>
                  <StepIcon status={s.status} index={realIdx} />
                  <span className={nameClass}>{s.name}</span>
                  <span className={timeClass}>
                    {isRun ? '…' : formatElapsed(s.elapsed_ms)}
                  </span>
                </div>
                {visibleSubs.length > 0 && (
                  <div className={styles.substeps}>
                    {visibleSubs.map((sub, j) => (
                      <SubRow key={`${j}-${sub.name}`} sub={sub} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});
