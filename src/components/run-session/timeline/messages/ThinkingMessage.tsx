/**
 * ThinkingMessage — collapsible chain-of-thought card. Head shows label +
 * token count, body is the streamed reasoning text. While status='streaming'
 * a spinner replaces the cloud glyph; on `thinking_finalize` patch it flips
 * to 'done' and the spinner becomes the static cloud icon.
 *
 * P1-2 (2026-05-24 Lane B): expanded-state persisted to localStorage so a
 * page refresh doesn't collapse every thinking card the user opened. Token
 * count gets toLocaleString separators (632 → 632, 6320 → 6,320). Defaults
 * to folded for fresh messages.
 *
 * Visual ref: v8 .tl-thinking (line 1411-1437, sample 1581-1596).
 */
import { memo, useEffect, useState } from 'react';
import { Cloud } from 'lucide-react';
import type { TimelineMessage } from '../types';
import styles from '../timeline.module.css';

interface Props {
  msg: Extract<TimelineMessage, { kind: 'thinking' }>;
  /** Optional initial-open override (e.g. inline node = true, pre-answer = false). */
  defaultOpen?: boolean;
}

const STORAGE_PREFIX = 'sf:think:tl:';

function readPersistedOpen(id: string, fallback: boolean): boolean {
  try {
    const v = window.localStorage.getItem(STORAGE_PREFIX + id);
    if (v == null) return fallback;
    return v === '1';
  } catch {
    return fallback;
  }
}

function writePersistedOpen(id: string, open: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_PREFIX + id, open ? '1' : '0');
  } catch {
    // Quota / private mode — silent fallback to in-memory only.
  }
}

export const ThinkingMessage = memo(function ThinkingMessage({
  msg,
  defaultOpen = false,
}: Props) {
  // Lazy init so we read from localStorage exactly once per mount.
  const [open, setOpen] = useState(() => readPersistedOpen(msg.id, defaultOpen));
  useEffect(() => {
    writePersistedOpen(msg.id, open);
  }, [msg.id, open]);

  const isStreaming = msg.status === 'streaming';
  const hasBody = Boolean(msg.body && msg.body.length > 0);
  const formattedTokens =
    typeof msg.tokens === 'number' ? msg.tokens.toLocaleString() : null;

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
        {formattedTokens !== null && (
          <>
            <span className={styles.thinkingSep}>·</span>
            <span className={styles.thinkingNum}>
              <b>{formattedTokens}</b> tokens
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
