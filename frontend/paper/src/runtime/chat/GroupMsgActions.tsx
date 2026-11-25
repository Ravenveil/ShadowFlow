/**
 * GroupMsgActions — 群消息 reactions + pin 小组件（搬 legacy NeoGroupMsgActions）。
 *
 * 后端三条路由（Node 单后端已迁齐）：
 *   POST /api/groups/{gid}/messages/{mid}/reactions { emoji, user_id } — toggle
 *   POST /api/groups/{gid}/messages/{mid}/pin { pinned? }              — toggle/set
 *
 * 状态由调用方持有（从群详情水合 reactions/pinned），本组件受控渲染，
 * 操作后把服务端结果经 onReactionsChange / onPinnedChange 回写。
 * 快捷反应 chips（已有计数 chip + hover 工具栏）+ 置顶按钮。
 * 文案全在 content/views.ts 的 CHAT / MSG；组件内零中文零色值。
 */
import { memo, useCallback, useState } from 'react';
import { reactToMessage, pinMessage } from '@/shared/data/http/generic';
import { CHAT } from '@/shared/content/app';
import { IconPin } from '@/shared/ui/icons';

/** 快捷反应（点击即 toggle；已有 chip 的不在工具栏重复）。 */
const QUICK_EMOJIS = ['👍', '❤️', '🎉'] as const;

export const GroupMsgActions = memo(function GroupMsgActions({
  groupId,
  messageId,
  reactions,
  pinned,
  userId = 'anonymous',
  onReactionsChange,
  onPinnedChange,
}: {
  groupId: string;
  messageId: string;
  /** emoji → user_id[]（服务端形状，计数 = 数组长度）。 */
  reactions: Record<string, string[]>;
  pinned: boolean;
  userId?: string;
  onReactionsChange: (messageId: string, reactions: Record<string, string[]>) => void;
  onPinnedChange: (messageId: string, pinned: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);

  const toggleReaction = useCallback(
    (emoji: string) => {
      if (busy) return;
      setBusy(true);
      reactToMessage(groupId, messageId, emoji, userId)
        .then((next) => onReactionsChange(messageId, next))
        .catch(() => {})
        .finally(() => setBusy(false));
    },
    [busy, groupId, messageId, userId, onReactionsChange],
  );

  const togglePin = useCallback(() => {
    if (busy) return;
    setBusy(true);
    pinMessage(groupId, messageId)
      .then((next) => onPinnedChange(messageId, next))
      .catch(() => {})
      .finally(() => setBusy(false));
  }, [busy, groupId, messageId, onPinnedChange]);

  const reacted = (emoji: string) => (reactions[emoji] ?? []).includes(userId);
  const entries = Object.entries(reactions).filter(([, users]) => users.length > 0);

  return (
    <div className="msg-actions">
      {/* 已有反应 chips（点击再投/撤销自己那票） */}
      {entries.map(([emoji, users]) => (
        <button
          key={emoji}
          type="button"
          className="msg-actions-chip"
          data-mine={users.includes(userId) || undefined}
          disabled={busy}
          onClick={() => toggleReaction(emoji)}
          title={users.join('、')}
        >
          <span aria-hidden>{emoji}</span>
          <span className="msg-actions-count">{users.length}</span>
        </button>
      ))}

      {/* 快捷反应 + pin（hover 浮现，已 pin 时常驻钉标） */}
      <span className="msg-actions-toolbar">
        {QUICK_EMOJIS.map((emoji) =>
          reacted(emoji) || reactions[emoji]?.length ? null : (
            <button
              key={emoji}
              type="button"
              className="msg-actions-btn"
              disabled={busy}
              onClick={() => toggleReaction(emoji)}
              aria-label={CHAT.msg.react(emoji)}
              title={CHAT.msg.react(emoji)}
            >
              <span aria-hidden>{emoji}</span>
            </button>
          ),
        )}
        <button
          type="button"
          className="msg-actions-btn"
          data-active={pinned || undefined}
          disabled={busy}
          onClick={togglePin}
          aria-label={pinned ? CHAT.msg.unpin : CHAT.msg.pin}
          title={pinned ? CHAT.msg.unpin : CHAT.msg.pin}
        >
          <IconPin size={12} />
        </button>
      </span>
    </div>
  );
});
