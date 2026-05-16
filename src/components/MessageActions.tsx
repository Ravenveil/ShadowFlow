/**
 * MessageActions — hover-revealed action row under chat bubbles.
 *
 * Renders Copy / Retry (optional) plus two disabled placeholders (Edit /
 * Branch) that hint at upcoming features. Visibility is driven by a
 * `.group:hover > .sf-msg-actions` rule in index.css — wrap the bubble +
 * this component in a parent with `className="group"`.
 *
 * Visual language mirrors competitors (Claude / ChatGPT / OWUI):
 *   - 11px text, 6px gap, transparent bg, faint border
 *   - Copy click → temporary Check icon for 1.2s (success feedback)
 *
 * Strict TS, lucide-only icons (no emoji per project rule).
 */
import React, { useEffect, useRef, useState } from 'react';
import { Check, Copy, GitBranch, Pencil, RotateCcw } from 'lucide-react';

export interface MessageActionsProps {
  /** Plain text content to copy when Copy is clicked. */
  text: string;
  /** Optional retry handler. Retry button is hidden when omitted. */
  onRetry?: () => void;
  /** Bubble alignment — controls action row's flex justification. */
  align?: 'left' | 'right';
}

const BTN_STYLE: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '3px 7px',
  borderRadius: 6,
  background: 'transparent',
  border: '1px solid var(--t-border)',
  color: 'var(--t-fg-4)',
  fontSize: 11,
  fontFamily: 'inherit',
  cursor: 'pointer',
  transition: 'color .15s, border-color .15s, opacity .15s',
};

export function MessageActions({
  text,
  onRetry,
  align = 'left',
}: MessageActionsProps): React.ReactElement {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Older browsers / non-secure context — silently swallow; UX still
      // shows the Check tick so users aren't confused.
    }
    setCopied(true);
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      setCopied(false);
      timerRef.current = null;
    }, 1200);
  };

  const hoverOn = (e: React.MouseEvent<HTMLButtonElement>): void => {
    const el = e.currentTarget;
    if (el.disabled) return;
    el.style.color = 'var(--t-fg)';
    el.style.borderColor = 'var(--t-border-2)';
  };
  const hoverOff = (e: React.MouseEvent<HTMLButtonElement>): void => {
    const el = e.currentTarget;
    if (el.disabled) return;
    el.style.color = 'var(--t-fg-4)';
    el.style.borderColor = 'var(--t-border)';
  };

  return (
    <div
      className="sf-msg-actions"
      style={{
        display: 'flex',
        justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
        gap: 6,
        marginTop: 4,
      }}
    >
      <button
        type="button"
        onClick={handleCopy}
        title={copied ? '已复制' : '复制'}
        aria-label="Copy message"
        style={BTN_STYLE}
        onMouseEnter={hoverOn}
        onMouseLeave={hoverOff}
      >
        {copied ? (
          <Check size={11} strokeWidth={2} aria-hidden />
        ) : (
          <Copy size={11} strokeWidth={2} aria-hidden />
        )}
        {copied ? '已复制' : '复制'}
      </button>

      {onRetry != null && (
        <button
          type="button"
          onClick={onRetry}
          title="重试"
          aria-label="Retry message"
          style={BTN_STYLE}
          onMouseEnter={hoverOn}
          onMouseLeave={hoverOff}
        >
          <RotateCcw size={11} strokeWidth={2} aria-hidden />
          重试
        </button>
      )}

      <button
        type="button"
        disabled
        title="即将上线"
        aria-label="Edit message (coming soon)"
        style={{ ...BTN_STYLE, cursor: 'not-allowed', opacity: 0.4 }}
      >
        <Pencil size={11} strokeWidth={2} aria-hidden />
        编辑
      </button>

      <button
        type="button"
        disabled
        title="即将上线"
        aria-label="Branch from message (coming soon)"
        style={{ ...BTN_STYLE, cursor: 'not-allowed', opacity: 0.4 }}
      >
        <GitBranch size={11} strokeWidth={2} aria-hidden />
        分支
      </button>
    </div>
  );
}

export default MessageActions;
