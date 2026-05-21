/**
 * RationaleMessage — "主线结论" recessed card. RATIONALE pre-label + accent
 * tinted background + bullet list. Visual ref: v8 .tl-reason (line 1372-1384).
 */
import { memo } from 'react';
import type { TimelineMessage } from '../types';
import styles from '../timeline.module.css';

interface Props {
  msg: Extract<TimelineMessage, { kind: 'rationale' }>;
}

export const RationaleMessage = memo(function RationaleMessage({ msg }: Props) {
  return (
    <div className={styles.reason}>
      <span className={styles.reasonPre}>RATIONALE</span>
      <ul className={styles.reasonList}>
        {msg.bullets.map((b, i) => (
          <li key={i}>{b}</li>
        ))}
      </ul>
    </div>
  );
});
