/**
 * ThinkingMessage — collapsible chain-of-thought card. Head shows label +
 * token count, body is the streamed reasoning text. While status='streaming'
 * a spinner replaces the cloud glyph; on `thinking_finalize` patch it flips
 * to 'done' and the spinner becomes the static cloud icon.
 *
 * Visual ref: v8 .tl-thinking (line 1411-1437).
 */
import { memo, useState } from 'react';
import { Cloud } from 'lucide-react';
import type { TimelineMessage } from '../types';
import styles from '../timeline.module.css';

interface Props {
  msg: Extract<TimelineMessage, { kind: 'thinking' }>;
  /** Optional initial-open override (e.g. inline node = true, pre-answer = false). */
  defaultOpen?: boolean;
}

export const ThinkingMessage = memo(function ThinkingMessage({
  msg,
  defaultOpen = false,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const isStreaming = msg.status === 'streaming';
  const hasBody = Boolean(msg.body && msg.body.length > 0);

  return (
    <div className={styles.thinking}>
      <button
        type="button"
        className={styles.thinkingHead}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        {isStreaming ? (
          <span className={styles.thinkingLoader} aria-hidden />
        ) : (
          <Cloud className={styles.thinkingGlyph} aria-hidden />
        )}
        <span className={styles.thinkingLab}>{msg.label}</span>
        {typeof msg.tokens === 'number' && (
          <>
            <span className={styles.thinkingSep}>·</span>
            <span className={styles.thinkingNum}>
              <b>{msg.tokens}</b> tokens
            </span>
          </>
        )}
        {msg.preview && (
          <>
            <span className={styles.thinkingSep}>·</span>
            <span className={styles.thinkingNum}>{msg.preview}</span>
          </>
        )}
        <span
          className={
            open
              ? `${styles.thinkingChev} ${styles.thinkingChevOpen}`
              : styles.thinkingChev
          }
        >
          ›
        </span>
      </button>
      {open && hasBody && (
        <div className={styles.thinkingBody}>
          {msg.body!.split('\n\n').map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>
      )}
    </div>
  );
});
