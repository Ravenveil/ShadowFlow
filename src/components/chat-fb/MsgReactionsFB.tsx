/**
 * MsgReactionsFB · agent 消息末尾的"二级元素组"（reactions / thread / read-by）
 *
 * 对照 _evidence/design-pkg-2026-05-28/chat-fb.html
 *   - CSS : 行 385-409 `.reactions` / `.thread-chip` / `.read-by`
 *   - HTML: 行 1146-1180（"读读"消息）/ 1206-1216（"阿批"消息）
 *
 * 设计偏好：HTML 源稿用 emoji 字符（👍🔥📑），按 UI 规范禁用 emoji 字符，
 *          这里全部换 lucide-react 单色线性图标 + 计数。
 *
 * 用法：
 *   <MsgReactionsFB
 *     reactions={[
 *       { id: 'up',   icon: 'thumbs-up', count: 3, picked: true },
 *       { id: 'bm',   icon: 'bookmark',  count: 1 },
 *     ]}
 *     threadCount={4}
 *     threadLastSender="阿批"
 *     threadLastAt="1 分钟前"
 *     onOpenThread={() => openThread('msg-1')}
 *     readBy={[{ id:'a', name:'张明', color:'#10B981' }, ...]}
 *     readByCount="5/5"
 *   />
 */

import {
  Bookmark,
  Flame,
  Heart,
  MessageSquare,
  Plus,
  Siren,
  Smile,
  ThumbsUp,
  type LucideIcon,
} from 'lucide-react';
import styles from './chatFB.module.css';

export type ReactionIconKey =
  | 'thumbs-up'
  | 'heart'
  | 'flame'
  | 'siren'
  | 'bookmark'
  | 'smile';

const ICON_MAP: Record<ReactionIconKey, LucideIcon> = {
  'thumbs-up': ThumbsUp,
  heart: Heart,
  flame: Flame,
  siren: Siren,
  bookmark: Bookmark,
  smile: Smile,
};

export interface MsgReactionItem {
  id: string;
  icon: ReactionIconKey;
  count: number;
  /** 当前用户已点（高亮）。 */
  picked?: boolean;
}

export interface MsgReadByUser {
  id: string;
  name: string;
  /** 头像底色（hex）。 */
  color?: string;
  /** 头像字（默认 name 首字符）。 */
  glyph?: string;
}

export interface MsgReactionsFBProps {
  reactions?: MsgReactionItem[];
  /** Thread 回复条数 — > 0 时显示 thread-chip。 */
  threadCount?: number;
  /** Thread 最后回复者名（"最后 阿批 · 1 分钟前"中的"阿批"）。 */
  threadLastSender?: string;
  /** Thread 最后回复时间文案。 */
  threadLastAt?: string;
  onOpenThread?: () => void;
  /** 已点新 reaction 回调（点 "+" 按钮时触发）。 */
  onAddReaction?: () => void;
  /** 已点已有 reaction 回调。 */
  onToggleReaction?: (id: string) => void;
  /** Read-by 用户列表（头像 stack）。最多渲染 5 个，其余以 +N 显示。 */
  readBy?: MsgReadByUser[];
  /** Read-by 主文案（默认 "{readBy.length}/{readBy.length} 已读"）。 */
  readByText?: string;
}

function initialOf(name: string | undefined): string {
  const t = (name ?? '').trim();
  if (!t) return '?';
  const first = Array.from(t)[0] ?? '?';
  return /[A-Za-z]/.test(first) ? first.toUpperCase() : first;
}

export function MsgReactionsFB({
  reactions,
  threadCount,
  threadLastSender,
  threadLastAt,
  onOpenThread,
  onAddReaction,
  onToggleReaction,
  readBy,
  readByText,
}: MsgReactionsFBProps) {
  const hasReactions = reactions && reactions.length > 0;
  const hasThread = threadCount != null && threadCount > 0;
  const hasReadBy = readBy && readBy.length > 0;
  if (!hasReactions && !hasThread && !hasReadBy && !onAddReaction) return null;

  const READ_BY_MAX = 5;
  const readByVisible = (readBy ?? []).slice(0, READ_BY_MAX);
  const readByOverflow = (readBy?.length ?? 0) - readByVisible.length;
  const readByLabel =
    readByText ??
    (readBy ? `${readBy.length}/${readBy.length} 已读 · hover 查看名单` : '');

  return (
    <>
      {(hasReactions || onAddReaction) && (
        <div className={styles.reactions}>
          {reactions?.map(r => {
            const Icon = ICON_MAP[r.icon] ?? ThumbsUp;
            return (
              <button
                type="button"
                key={r.id}
                className={`${styles.react} ${r.picked ? styles.reactMine : ''}`}
                onClick={() => onToggleReaction?.(r.id)}
                aria-pressed={!!r.picked}
              >
                <Icon size={11} strokeWidth={1.8} aria-hidden />
                <span className={styles.reactN}>{r.count}</span>
              </button>
            );
          })}
          {onAddReaction && (
            <button
              type="button"
              className={`${styles.react} ${styles.reactAdd}`}
              onClick={onAddReaction}
              aria-label="添加表情反应"
            >
              <Plus size={11} strokeWidth={1.8} aria-hidden />
            </button>
          )}
        </div>
      )}

      {hasThread && (
        <button
          type="button"
          className={styles.threadChip}
          onClick={onOpenThread}
        >
          <MessageSquare size={11} strokeWidth={1.7} aria-hidden />
          <span className={styles.threadChipC}>{threadCount} 条回复</span>
          {(threadLastSender || threadLastAt) && (
            <span className={styles.threadChipLast}>
              最后 {threadLastSender ?? ''} {threadLastAt ? `· ${threadLastAt}` : ''}
            </span>
          )}
          <span className={styles.threadChipArr}>›</span>
        </button>
      )}

      {hasReadBy && (
        <div className={styles.readByRow}>
          <span className={styles.readByStack}>
            {readByVisible.map((u, i) => (
              <span
                key={u.id}
                className={styles.readByAv}
                style={{
                  background: u.color
                    ? `color-mix(in oklab, ${u.color} 18%, var(--skin-panel))`
                    : 'var(--bg-elev-2)',
                  borderColor: u.color
                    ? `color-mix(in oklab, ${u.color} 40%, transparent)`
                    : 'var(--border)',
                  color: u.color ?? 'var(--fg-3)',
                  zIndex: READ_BY_MAX - i,
                }}
                title={u.name}
              >
                {u.glyph || initialOf(u.name)}
              </span>
            ))}
            {readByOverflow > 0 && (
              <span
                className={styles.readByAv}
                style={{ zIndex: 0, color: 'var(--fg-4)' }}
                title={`其余 ${readByOverflow} 人`}
              >
                +{readByOverflow}
              </span>
            )}
          </span>
          <span className={styles.readBy}>{readByLabel}</span>
        </div>
      )}
    </>
  );
}

export default MsgReactionsFB;
