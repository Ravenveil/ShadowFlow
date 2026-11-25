/**
 * MsgFeedback — 消息 👍/👎 反馈行（搬 legacy NeoMsgFeedback）。
 *
 * mount 时 GET 计数 + 我的票做水合；失败静默（后端未起/端点未达不渲染错误，
 * 按钮仍可点，POST 会自建记录）。点击 = POST toggle，以服务端返回为准更新本地态。
 * 计数为 0 且未投票时行保持低调（仅图标）；有票后显示计数。
 * 文案全在 content/views.ts 的 TIMELINE；组件内零中文零色值。
 */
import { memo, useCallback, useEffect, useState } from 'react';
import { getMessageFeedback, postMessageFeedback, type MessageFeedback } from '@/shared/data/http/generic';
import { TIMELINE } from '@/shared/content/app';
import { IconThumbsUp, IconThumbsDown } from '@/shared/ui/icons';

export const MsgFeedback = memo(function MsgFeedback({
  messageId,
  userId = 'anonymous',
}: {
  messageId: string;
  userId?: string;
}) {
  const [fb, setFb] = useState<MessageFeedback | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    getMessageFeedback(messageId, userId)
      .then((v) => {
        if (alive) setFb(v);
      })
      .catch(() => {
        /* 未水合保持 null（按钮仍可点，POST 会自建记录） */
      });
    return () => {
      alive = false;
    };
  }, [messageId, userId]);

  const vote = useCallback(
    (rating: 1 | -1) => {
      if (busy) return;
      setBusy(true);
      postMessageFeedback(messageId, rating, userId)
        .then(setFb)
        .catch(() => {})
        .finally(() => setBusy(false));
    },
    [busy, messageId, userId],
  );

  const my = fb?.my_rating ?? null;
  return (
    <div className="msg-feedback">
      <button
        type="button"
        className="msg-feedback-btn"
        data-active={my === 1 || undefined}
        disabled={busy}
        onClick={() => vote(1)}
        aria-label={TIMELINE.feedbackUp}
        title={TIMELINE.feedbackUp}
      >
        <IconThumbsUp size={12} />
        {(fb?.up ?? 0) > 0 && <span className="msg-feedback-count">{fb!.up}</span>}
      </button>
      <button
        type="button"
        className="msg-feedback-btn"
        data-active={my === -1 || undefined}
        disabled={busy}
        onClick={() => vote(-1)}
        aria-label={TIMELINE.feedbackDown}
        title={TIMELINE.feedbackDown}
      >
        <IconThumbsDown size={12} />
        {(fb?.down ?? 0) > 0 && <span className="msg-feedback-count">{fb!.down}</span>}
      </button>
    </div>
  );
});
