/**
 * UserTurnMessage — opens a new turn. Renders the user prompt with a `❯`
 * caret (terminal/Codex style). See v8 design at .tl-user (line 1353).
 */
import { memo } from 'react';
import type { TimelineMessage } from '../types';
import styles from '../timeline.module.css';

interface Props {
  msg: Extract<TimelineMessage, { kind: 'user_turn' }>;
}

export const UserTurnMessage = memo(function UserTurnMessage({ msg }: Props) {
  return (
    <div className={styles.user}>
      <span className={styles.userCaret}>❯</span>
      <div className={styles.userText}>{msg.text}</div>
    </div>
  );
});
