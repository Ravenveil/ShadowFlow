/**
 * NeoGroupMsgActions — 群聊消息行 reactions + pin 小组件（2026-08-22 L1 缺口补齐）。
 *
 * 后端（Python groups.py，Stream M 已有端点，此前前端未接线）：
 *   POST /api/groups/{gid}/messages/{mid}/reactions { emoji, user_id } — toggle
 *   POST /api/groups/{gid}/messages/{mid}/pin { pinned? }              — toggle/set
 *
 * 状态归属 NeoGroupChat（从 GET /api/groups/{id} 水合 reactions/pinned map），
 * 本组件受控渲染 + 操作后把服务端结果经 onReactionsChange/onPinnedChange 回写。
 */
import { memo, useCallback, useState } from 'react';
import { Pin } from 'lucide-react';
import { pinMessage, reactToMessage } from '../api/groupApi';
import { useI18n } from '../common/i18n';
import './neo-msg-actions.css';

/** 快捷反应（点击即 toggle）。 */
const QUICK_EMOJIS = ['👍', '❤️', '🎉'] as const;

export const NeoGroupMsgActions = memo(function NeoGroupMsgActions({
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
  const { t } = useI18n();
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
    <div className="neo-gma" data-testid="neo-gma">
      {/* 已有反应 chips（点击再投/撤销自己那票） */}
      {entries.map(([emoji, users]) => (
        <button
          key={emoji}
          type="button"
          className="neo-gma-chip"
          data-mine={users.includes(userId) || undefined}
          disabled={busy}
          onClick={() => toggleReaction(emoji)}
          title={users.join('、')}
          data-testid={`neo-gma-chip-${emoji}`}
        >
          <span aria-hidden>{emoji}</span>
          <span className="neo-gma-chip-count">{users.length}</span>
        </button>
      ))}

      {/* 快捷反应 + pin（hover 浮现，已 pin 时常驻钉标） */}
      <span className="neo-gma-toolbar">
        {QUICK_EMOJIS.map((emoji) =>
          // 已有 chip 的反应不在工具栏重复
          reacted(emoji) || reactions[emoji]?.length ? null : (
            <button
              key={emoji}
              type="button"
              className="neo-gma-btn"
              disabled={busy}
              onClick={() => toggleReaction(emoji)}
              aria-label={t('neo.group.react', { defaultValue: '反应 {{emoji}}', emoji })}
              data-testid={`neo-gma-react-${emoji}`}
            >
              <span aria-hidden>{emoji}</span>
            </button>
          ),
        )}
        <button
          type="button"
          className="neo-gma-btn"
          data-active={pinned || undefined}
          disabled={busy}
          onClick={togglePin}
          aria-label={
            pinned
              ? t('neo.group.unpin', { defaultValue: '取消置顶' })
              : t('neo.group.pin', { defaultValue: '置顶' })
          }
          title={
            pinned
              ? t('neo.group.unpin', { defaultValue: '取消置顶' })
              : t('neo.group.pin', { defaultValue: '置顶' })
          }
          data-testid="neo-gma-pin"
        >
          <Pin size={12} strokeWidth={1.9} aria-hidden />
        </button>
      </span>
    </div>
  );
});

export default NeoGroupMsgActions;
