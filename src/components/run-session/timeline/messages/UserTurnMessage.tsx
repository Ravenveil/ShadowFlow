/**
 * UserTurnMessage — opens a new turn. Renders the user prompt with a `❯`
 * caret (terminal/Codex style). See v8 design at .tl-user (line 1353).
 *
 * Round 2 (2026-05-24, spec section 3.3) — hover reveals a RotateCcw button
 * on the right side, wired to RunSessionPage's existing handleResend (POST
 * /messages → new session navigate). The button uses opacity:0 by default
 * (CSS) so it doesn't visually compete with the prompt text.
 */
import { memo } from 'react';
import { RotateCcw } from 'lucide-react';
import type { TimelineMessage } from '../types';
import styles from '../timeline.module.css';

interface Props {
  msg: Extract<TimelineMessage, { kind: 'user_turn' }>;
  /** Round 2 — invoked with the original user text. RunSessionPage wires this
   *  to `handleResend`. When omitted (e.g. read-only history view), the
   *  retry button is hidden entirely. */
  onRetry?: (text: string) => void;
  /** True while a resend POST is in flight. Disables the button + shows
   *  a spinner instead of the icon for visual feedback. */
  resending?: boolean;
}

export const UserTurnMessage = memo(function UserTurnMessage({
  msg,
  onRetry,
  resending = false,
}: Props) {
  const handleClick = () => {
    if (!onRetry || resending) return;
    onRetry(msg.text);
  };

  return (
    <div className={styles.user}>
      <span className={styles.userCaret}>❯</span>
      <div className={styles.userText}>{msg.text}</div>
      {onRetry && (
        <button
          type="button"
          className={styles.userRetry}
          onClick={handleClick}
          disabled={resending}
          aria-label={resending ? '正在重发…' : '重新发送'}
          title={resending ? '正在重发…' : '重新发送'}
          data-testid="rs-user-turn-retry"
        >
          <RotateCcw
            size={13}
            aria-hidden
            className={resending ? styles.userRetrySpin : undefined}
          />
        </button>
      )}
    </div>
  );
});
