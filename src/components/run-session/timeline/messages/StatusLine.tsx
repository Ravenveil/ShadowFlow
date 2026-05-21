/**
 * StatusLine — Codex/Claude Code-style always-on bottom strip. NOT rendered
 * inside the Timeline `.map(messages)`; instead the parent extracts the
 * latest `status_line` message (`messages.find(m => m.kind === 'status_line')`)
 * and renders this slot directly under the Timeline + above the composer.
 *
 * Visual ref: v8 .statusline (line 1302-1314).
 */
import { memo } from 'react';
import { Cloud } from 'lucide-react';
import type { TimelineMessage } from '../types';
import styles from '../timeline.module.css';

interface Props {
  msg: Extract<TimelineMessage, { kind: 'status_line' }>;
}

export const StatusLine = memo(function StatusLine({ msg }: Props) {
  return (
    <div className={styles.statusLine}>
      <Cloud className={styles.statusGlyph} aria-hidden />
      <span className={styles.statusVerb}>{msg.verb}</span>
      <span>for</span>
      <span className={styles.statusNum}>
        <b>{msg.elapsed_s}</b>s
      </span>
      <span className={styles.statusSep}>·</span>
      <span className={styles.statusNum}>
        <b>{msg.tools_running}</b> tools running
      </span>
    </div>
  );
});
