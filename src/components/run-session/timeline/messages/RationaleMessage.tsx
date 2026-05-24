/**
 * RationaleMessage — "主线结论" flat row. RATIONALE pre-label + bullet list
 * with a 3px accent gutter on the left (no bubble).
 *
 * Round 2.5 (Task C): auditor flagged DoD-5 PARTIAL because the previous
 * `.reason` style was a 10px-radius accent-tinted card — looked like a
 * chat bubble, violating the zero-bubble rule. Switched to the flat
 * `.reasonFlat` class (border-left accent + transparent bg) to match the
 * `.echo` / `.tool` flat aesthetic. Visual hierarchy still comes from
 * the RATIONALE pre-label color, not container chrome.
 */
import { memo } from 'react';
import type { TimelineMessage } from '../types';
import styles from '../timeline.module.css';

interface Props {
  msg: Extract<TimelineMessage, { kind: 'rationale' }>;
}

export const RationaleMessage = memo(function RationaleMessage({ msg }: Props) {
  return (
    <div className={styles.reasonFlat}>
      <span className={styles.reasonPre}>RATIONALE</span>
      <ul className={styles.reasonList}>
        {msg.bullets.map((b, i) => (
          <li key={i}>{b}</li>
        ))}
      </ul>
    </div>
  );
});
