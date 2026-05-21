/**
 * ToolEchoLine — `⎿` indented continuation line below a tool_call chip.
 * Visual ref: v8 .tl-echo (line 1394-1397).
 */
import { memo } from 'react';
import type { TimelineMessage } from '../types';
import styles from '../timeline.module.css';

interface Props {
  msg: Extract<TimelineMessage, { kind: 'tool_echo' }>;
}

export const ToolEchoLine = memo(function ToolEchoLine({ msg }: Props) {
  return (
    <div className={styles.echo}>
      <span className={styles.echoGlyph} aria-hidden>
        ⎿
      </span>
      <span className={styles.echoBody}>{msg.body}</span>
    </div>
  );
});
