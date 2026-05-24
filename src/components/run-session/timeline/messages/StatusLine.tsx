/**
 * StatusLine — Codex/Claude Code-style always-on bottom strip. NOT rendered
 * inside the Timeline `.map(messages)`; instead the parent extracts the
 * latest `status_line` message (by reverse-scanning `messages` — the projector
 * emits a new id per verb-change) and renders this slot directly under the
 * Timeline + above the composer.
 *
 * 2026-05-24 Round 2 fix (P0): self-running 1Hz ticker.
 *   The projector only calls bumpStatusLine on event boundaries (classify /
 *   assemble / step / text). If the LLM stalls in a thinking block for 30s,
 *   `elapsed_s` from the server is frozen until the next event. Front-end
 *   re-derives elapsed each second from `msg.ts` (emit wall-clock) +
 *   `msg.elapsed_s` (server-anchored baseline). When the server pushes a
 *   newer status_line (new msg.id), the effect resets to the new anchor.
 *
 * Visual ref: v8 .statusline (line 1717-1730).
 */
import { memo, useEffect, useState } from 'react';
import { Cloud } from 'lucide-react';
import type { TimelineMessage } from '../types';
import styles from '../timeline.module.css';

interface Props {
  msg: Extract<TimelineMessage, { kind: 'status_line' }>;
}

export const StatusLine = memo(function StatusLine({ msg }: Props) {
  const [tickElapsed, setTickElapsed] = useState(msg.elapsed_s);

  // Reset + start ticker every time the underlying status_line message
  // identity OR verb changes. msg.id is the primary anchor — the projector
  // assigns a fresh id per emit; verb is a defensive second anchor in case
  // server reuses id across two verbs (shouldn't happen but cheap to guard).
  useEffect(() => {
    setTickElapsed(msg.elapsed_s);
    const startWall = Date.now();
    const anchorSec = msg.elapsed_s;
    const t = setInterval(() => {
      const driftSec = Math.floor((Date.now() - startWall) / 1000);
      setTickElapsed(anchorSec + driftSec);
    }, 1000);
    return () => clearInterval(t);
  }, [msg.id, msg.verb, msg.elapsed_s]);

  return (
    <div className={styles.statusLine}>
      <Cloud className={styles.statusGlyph} aria-hidden />
      <span className={styles.statusVerb}>{msg.verb}</span>
      <span>for</span>
      <span className={styles.statusNum}>
        <b>{tickElapsed}</b>s
      </span>
      <span className={styles.statusSep}>·</span>
      <span className={styles.statusNum}>
        <b>{msg.tools_running}</b> tools running
      </span>
    </div>
  );
});
