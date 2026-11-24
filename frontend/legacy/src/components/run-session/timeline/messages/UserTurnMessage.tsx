/**
 * UserTurnMessage — opens a new turn. Renders the user prompt with a `❯`
 * caret (terminal/Codex style). See v8 design at .tl-user (line 1353).
 *
 * Round 2 (2026-05-24, spec section 3.3) — hover reveals a RotateCcw button
 * on the right side, wired to RunSessionPage's existing handleResend (POST
 * /messages → new session navigate). The button uses opacity:0 by default
 * (CSS) so it doesn't visually compete with the prompt text.
 *
 * 2026-11-07 拖拽传图 — user_turn 带 attachments 时在文本下方渲染随行附件：
 * 图片走 /projects 静态直链缩略图（点击新窗看原图），其余文件出 📎 chip。
 * 只发附件不打字时不出空文本行。
 */
import { memo } from 'react';
import { Paperclip, RotateCcw } from 'lucide-react';
import type { TimelineMessage, UserAttachment } from '../types';
import { fmtAttachmentSize } from '../../../../lib/attachments';
import { getApiBase } from '../../../../api/_base';
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

/** /projects 静态直链 → 绝对 URL（前端可能与后端不同源）。 */
function attSrc(url: string): string {
  return url.startsWith('http') ? url : `${getApiBase()}${url}`;
}

function AttachmentRow({ atts }: { atts: UserAttachment[] }) {
  return (
    <div className={styles.userAtts} data-testid="user-turn-attachments">
      {atts.map((a) =>
        a.is_image ? (
          <a
            key={a.url}
            href={attSrc(a.url)}
            target="_blank"
            rel="noreferrer"
            className={styles.userAttThumb}
            title={`${a.name}${a.size ? ` · ${fmtAttachmentSize(a.size)}` : ''}`}
          >
            <img src={attSrc(a.url)} alt={a.name} loading="lazy" />
          </a>
        ) : (
          <span
            key={a.url}
            className={styles.userAttFile}
            title={a.path}
            data-testid="user-turn-attachment-file"
          >
            <Paperclip size={11} strokeWidth={2} aria-hidden />
            <span>{a.name}</span>
            {typeof a.size === 'number' && (
              <span>{fmtAttachmentSize(a.size)}</span>
            )}
          </span>
        ),
      )}
    </div>
  );
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
      {msg.text ? <div className={styles.userText}>{msg.text}</div> : null}
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
      {msg.attachments && msg.attachments.length > 0 && (
        <AttachmentRow atts={msg.attachments} />
      )}
    </div>
  );
});
