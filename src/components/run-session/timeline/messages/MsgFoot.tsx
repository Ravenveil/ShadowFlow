/**
 * MsgFoot — per-turn summary row. Dashed top border separates it from the
 * assistant body. Renders in BOTH states per v8 design:
 *   running → pulsing accent dot + "Running · 3m 42s · 4 tools · 632t · ¥0.012"
 *   done    → static ok dot + "Done · …"
 *
 * 2026-05-28 alignment fix: prior implementation hid the foot during running
 * (claiming "OpenDesign uses the bottom status_line for live activity"). v8
 * actually does the OPPOSITE — the statusline CSS is a v7 leftover with NO
 * body usage, and the msg-foot carries Running through to Done. See
 * _evidence/design-pkg-2026-05-28/run-session-v8.html line 1668-1679.
 *
 * Visual ref: v8 .msg-foot (line 1327-1339).
 */
import { memo } from 'react';
import type { TimelineMessage } from '../types';
import styles from '../timeline.module.css';

interface Props {
  msg: Extract<TimelineMessage, { kind: 'msg_foot' }>;
}

function formatElapsed(ms?: number): string {
  if (typeof ms !== 'number') return '0s';
  if (ms < 1000) return `${ms}ms`;
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export const MsgFoot = memo(function MsgFoot({ msg }: Props) {
  const running = msg.status === 'running';
  return (
    <div className={styles.foot}>
      <span
        className={
          running
            ? `${styles.footStatus} ${styles.footStatusRun}`
            : styles.footStatus
        }
        aria-hidden
      />
      <span className={styles.footLab}>{running ? 'Running' : 'Done'}</span>
      {typeof msg.elapsed_ms === 'number' && (
        <>
          <span className={styles.footSep}>·</span>
          <span className={styles.footNum}>
            <b>{formatElapsed(msg.elapsed_ms)}</b>
          </span>
        </>
      )}
      {typeof msg.tools === 'number' && (
        <>
          <span className={styles.footSep}>·</span>
          <span className={styles.footNum}>
            <b>{msg.tools}</b> tools
          </span>
        </>
      )}
      {typeof msg.tokens === 'number' && (
        <>
          <span className={styles.footSep}>·</span>
          <span className={styles.footNum}>
            <b>{msg.tokens}</b>t
          </span>
        </>
      )}
      {typeof msg.cost_cny === 'number' && (
        <>
          <span className={styles.footSep}>·</span>
          <span className={styles.footNum}>
            ¥<b>{msg.cost_cny.toFixed(3)}</b>
          </span>
        </>
      )}
    </div>
  );
});
