/**
 * MsgFoot — end-of-turn summary row. Dashed top border separates it from
 * the assistant body. While `status='running'` the status dot pulses blue;
 * on `msg_foot_update` patch with status='done' it flips to a static green
 * dot. Visual ref: v8 .msg-foot (line 1325-1338).
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
  const isRunning = msg.status === 'running';
  return (
    <div className={styles.foot}>
      <span
        className={
          isRunning
            ? `${styles.footStatus} ${styles.footStatusRun}`
            : styles.footStatus
        }
        aria-hidden
      />
      <span className={styles.footLab}>{isRunning ? 'Running' : 'Done'}</span>
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
