/**
 * NeoMsgFeedback — 单聊消息底部 👍/👎 反馈行（2026-08-22 L1 缺口补齐）。
 *
 * 独立小组件（不动既有消息主组件）：经 NeoTimeline 的可选 renderMsgActions
 * 挂载点插到 assistant_text 消息下方（接线在 NeoRunInline）。
 *
 * 行为：
 *   - mount 时 GET 计数 + 我的票做水合；失败静默（不渲染错误，不 mock）。
 *   - 点击 = POST toggle；以服务端返回为准更新本地态。
 *   - 计数为 0 且未投票时行保持低调（仅图标）；有票后显示计数。
 */
import { memo, useCallback, useEffect, useState } from 'react';
import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { getMessageFeedback, postMessageFeedback, type MessageFeedback } from '../api/messageFeedback';
import { useI18n } from '../common/i18n';
import './neo-msg-actions.css';

export const NeoMsgFeedback = memo(function NeoMsgFeedback({
  messageId,
  userId = 'anonymous',
}: {
  messageId: string;
  userId?: string;
}) {
  const { t } = useI18n();
  const [fb, setFb] = useState<MessageFeedback | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    getMessageFeedback(messageId, userId)
      .then((v) => {
        if (alive) setFb(v);
      })
      .catch(() => {
        /* 后端未起/端点未达 → 保持未水合（按钮仍可点，POST 会自建记录） */
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
    <div className="neo-msg-feedback" data-testid="neo-msg-feedback">
      <button
        type="button"
        className="neo-msg-feedback-btn"
        data-active={my === 1 || undefined}
        disabled={busy}
        onClick={() => vote(1)}
        aria-label={t('neo.feedback.up', { defaultValue: '有用' })}
        title={t('neo.feedback.up', { defaultValue: '有用' })}
        data-testid="neo-msg-feedback-up"
      >
        <ThumbsUp size={12} strokeWidth={1.9} aria-hidden />
        {(fb?.up ?? 0) > 0 && <span className="neo-msg-feedback-count">{fb!.up}</span>}
      </button>
      <button
        type="button"
        className="neo-msg-feedback-btn"
        data-active={my === -1 || undefined}
        disabled={busy}
        onClick={() => vote(-1)}
        aria-label={t('neo.feedback.down', { defaultValue: '没帮助' })}
        title={t('neo.feedback.down', { defaultValue: '没帮助' })}
        data-testid="neo-msg-feedback-down"
      >
        <ThumbsDown size={12} strokeWidth={1.9} aria-hidden />
        {(fb?.down ?? 0) > 0 && <span className="neo-msg-feedback-count">{fb!.down}</span>}
      </button>
    </div>
  );
});

export default NeoMsgFeedback;
