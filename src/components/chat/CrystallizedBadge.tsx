/**
 * CrystallizedBadge — Story 14.1 AC2
 *
 * Displayed for dismissAfterMs (default 5000) when POST /memory/writeback
 * returns memories_recalled > 0. Hover pauses the timer.
 * Click dismisses immediately.
 */

import { useEffect, useRef, useState } from 'react';

interface CrystallizedBadgeProps {
  onDismiss?: () => void;
  dismissAfterMs?: number;
}

export function CrystallizedBadge({
  onDismiss,
  dismissAfterMs = 5000,
}: CrystallizedBadgeProps) {
  const [visible, setVisible] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remainingRef = useRef(dismissAfterMs);
  const startedAtRef = useRef<number>(Date.now());

  function startTimer(ms: number) {
    timerRef.current = setTimeout(() => {
      setVisible(false);
      onDismiss?.();
    }, ms);
    startedAtRef.current = Date.now();
  }

  function clearTimer() {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  useEffect(() => {
    startTimer(dismissAfterMs);
    return clearTimer;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleMouseEnter() {
    const elapsed = Date.now() - startedAtRef.current;
    remainingRef.current = Math.max(0, remainingRef.current - elapsed);
    clearTimer();
  }

  function handleMouseLeave() {
    startTimer(remainingRef.current);
  }

  function handleDismiss() {
    clearTimer();
    setVisible(false);
    onDismiss?.();
  }

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleDismiss}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '5px 11px',
        borderRadius: 10,
        background: '#0A1F17',
        color: 'var(--t-ok)',
        border: '1px solid rgba(16,185,129,0.2)',
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        fontWeight: 600,
        cursor: 'pointer',
        userSelect: 'none',
      }}
      title="点击关闭"
    >
      <span aria-hidden="true">✦</span>
      记忆已结晶
    </div>
  );
}

export default CrystallizedBadge;
