/**
 * GroupMsgActions — 群消息 reactions + pin + 复制为 Markdown + 回复（搬 legacy NeoGroupMsgActions）。
 *
 * 后端三条路由（Node 单后端已迁齐）：
 *   POST /api/groups/{gid}/messages/{mid}/reactions { emoji, user_id } — toggle
 *   POST /api/groups/{gid}/messages/{mid}/pin { pinned? }              — toggle/set
 *
 * 状态由调用方持有（从群详情水合 reactions/pinned），本组件受控渲染，
 * 操作后把服务端结果经 onReactionsChange / onPinnedChange 回写。
 * 快捷反应 chips（已有计数 chip + hover 工具栏）+ 置顶 + 复制 Markdown + 回复。
 * 文案全在 content/app.ts 的 CHAT；复制走带 execCommand 回退的 copyText。
 */
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { reactToMessage, pinMessage } from '@/shared/data/http/generic';
import { CHAT } from '@/shared/content/app';
import { IconCopy, IconPin, IconReply } from '@/shared/ui/icons';
import { copyText } from '@/shared/ui/clipboard';

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
  markdown,
  onReply,
}: {
  groupId: string;
  messageId: string;
  /** emoji → user_id[]（服务端形状，计数 = 数组长度）。 */
  reactions: Record<string, string[]>;
  pinned: boolean;
  userId?: string;
  onReactionsChange: (messageId: string, reactions: Record<string, string[]>) => void;
  onPinnedChange: (messageId: string, pinned: boolean) => void;
  /** 该消息的 Markdown 文本；给了才显示「复制为 Markdown」。 */
  markdown?: string;
  /** 点「回复」的回调（由上层把引用态灌进 Composer）；给了才显示回复按钮。 */
  onReply?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (copyTimer.current) window.clearTimeout(copyTimer.current);
    },
    [],
  );

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

  const copyMarkdown = useCallback(() => {
    if (!markdown || busy) return;
    void copyText(markdown).then((ok) => {
      if (!ok) return;
      setCopied(true);
      if (copyTimer.current) window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopied(false), 1500);
    });
  }, [markdown, busy]);

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

      {/* 快捷反应 + pin + 复制 Markdown + 回复（hover 浮现，已 pin 时常驻钉标） */}
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
        {markdown ? (
          <button
            type="button"
            className="msg-actions-btn msg-actions-btn--wide"
            data-active={copied || undefined}
            disabled={busy}
            onClick={copyMarkdown}
          >
            <IconCopy size={12} />
            <span>{copied ? CHAT.msg.copiedMarkdown : CHAT.msg.copyShort}</span>
          </button>
        ) : null}
        {onReply ? (
          <button
            type="button"
            className="msg-actions-btn msg-actions-btn--wide"
            disabled={busy}
            onClick={onReply}
          >
            <IconReply size={12} />
            <span>{CHAT.msg.reply}</span>
          </button>
        ) : null}
      </span>
    </div>
  );
});
