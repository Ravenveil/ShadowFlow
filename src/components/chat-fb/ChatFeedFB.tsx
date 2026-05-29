/**
 * ChatFeedFB · 中央 feed 区消息列表（FB-HiFi 风）
 * 对照 _evidence/design-pkg-2026-05-28/chat-fb.html
 *   - CSS : 行 315-496（feed / msg / usermsg / gate / typing / day-div / sysnote / syscard）
 *   - HTML: 行 1140-1273
 *
 * 渲染 useChatStream 的 ChatMessage[]：
 *   role=user   → 右侧浅气泡（usermsg）
 *   role=agent  → 左侧带左边线 + 头像 + 工具 chip 的卡片（msg）
 *   role=system → 居中浅灰行（sysnote）
 *
 * 注意：这一版先把核心 3 种 role 的视觉做对，hover 工具条 / reactions /
 * thread chip / read-by 等次级元素留给后续 story。
 */

import type { ChatMessage } from '../../core/components/chat/ChatStream';
import styles from './chatFB.module.css';
import { Pin } from 'lucide-react';
import { MessageHoverToolbarFB } from './MessageHoverToolbarFB';
import { TypingDotsFB } from './TypingDotsFB';
import { MsgReactionsFB, type MsgReactionItem, type ReactionIconKey } from './MsgReactionsFB';
import { SyscardFB, type SyscardKind } from './SyscardFB';
import { InlineApprovalFB, type InlineApprovalStatus, type InlineApprovalChoice, type InlineApprovalMetric } from './InlineApprovalFB';
import { IssueListFB } from './IssueListFB';
import type { ReactNode } from 'react';

// ─── Stream M 2026-05-29 · 后端 reactions(emoji→user[]) → MsgReactionItem[] ──────
// auth 未落地，当前用户固定 'anonymous'（与后端 ReactionRequest 默认一致）。
const CURRENT_USER = 'anonymous';
const REACTION_ICON_KEYS: ReactionIconKey[] = ['thumbs-up', 'heart', 'flame', 'siren', 'bookmark', 'smile'];
function toReactionItems(reactions?: Record<string, string[]>): MsgReactionItem[] {
  if (!reactions) return [];
  return Object.entries(reactions)
    .filter(([, users]) => Array.isArray(users) && users.length > 0)
    .map(([emoji, users]) => ({
      id: emoji,
      icon: (REACTION_ICON_KEYS.includes(emoji as ReactionIconKey) ? emoji : 'smile') as ReactionIconKey,
      count: users.length,
      picked: users.includes(CURRENT_USER),
    }));
}

/** Stream H 2026-05-28 · 9 个 hover toolbar 动作 + system 卡的统一 action 类型。 */
export type ChatFeedAction =
  | 'react' | 'reply' | 'thread' | 'quote'
  | 'rewrite' | 'translate' | 'pin' | 'forward' | 'more';

export interface ChatFeedFBProps {
  messages: ChatMessage[];
  /** 群名，用作日期分割线下方 sysnote 文案 */
  groupName?: string;
  /** Stream H · 统一消息动作 callback；不传走 console.log 占位 */
  onMessageAction?: (action: ChatFeedAction, messageId: string) => void;
  /** Stream H · 是否在 feed 末尾渲染 TypingDots（chatStream.loading） */
  typing?: boolean;
  /** Stream H · TypingDots 显示的 agent 名 */
  typingAgentName?: string;
}

// ─── 头像配色（按 senderName / id 稳定 hash 映射）─────────────────────────────
const PALETTE: Array<{ accent: string; ink: string }> = [
  { accent: '#A855F7', ink: '#7C3AED' }, // 紫
  { accent: '#F59E0B', ink: '#B45309' }, // 橙
  { accent: '#22D3EE', ink: '#0891B2' }, // 青
  { accent: '#EF4444', ink: '#B91C1C' }, // 红
  { accent: '#10B981', ink: '#059669' }, // 绿
  { accent: '#3B82F6', ink: '#1D4ED8' }, // 蓝
  { accent: '#A855F7', ink: '#6B21A8' }, // 暗紫
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function paletteOf(key: string) {
  return PALETTE[hash(key || '?') % PALETTE.length];
}

function initialOf(name: string | undefined): string {
  const t = (name ?? '').trim();
  if (!t) return '?';
  const first = Array.from(t)[0] ?? '?';
  return /[A-Za-z]/.test(first) ? first.toUpperCase() : first;
}

/**
 * Stream H 2026-05-28 · 把 message 文本里的 @mention 解析成绿底高亮 chip。
 * 对照 chat-fb.html 行 1237 `<span style="...accent-tint...">@阿批</span>`。
 * 只处理 `@中文/字母数字-_` 字符串；不处理空格分词后的子串。
 */
function renderWithMentions(text: string): ReactNode {
  if (!text) return null;
  // 中文 / 英文 / 数字 / _- 都可在 @ 后跟，最多 16 字符（防止吃整行）
  const re = /@([一-龥A-Za-z0-9_-]{1,16})/g;
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let idx = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(
      <span key={`mention-${idx++}`} className={styles.mention}>
        @{m[1]}
      </span>
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out.length > 0 ? out : text;
}

function fmtTime(ts: string | undefined): string {
  if (!ts) return '';
  // 已经是 hh:mm / "1 min ago" 这类格式就直接展示
  if (/^\d{1,2}:\d{2}$/.test(ts) || ts.length < 16) return ts;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ─── Agent 消息（左侧）─────────────────────────────────────────────────────────
function AgentMsg({
  m,
  onAction,
}: {
  m: ChatMessage;
  onAction: (action: ChatFeedAction, id: string) => void;
}) {
  const key = m.senderName ?? m.id;
  const p = paletteOf(key);
  const letter = m.senderGlyph || initialOf(m.senderName);

  return (
    <div className={`${styles.msg} ${styles.msgHoverHost}`} id={`msg-${m.id}`}>
      <MessageHoverToolbarFB
        messageId={m.id}
        onReact={id => onAction('react', id)}
        onReply={id => onAction('reply', id)}
        onThread={id => onAction('thread', id)}
        onQuote={id => onAction('quote', id)}
        onRewrite={id => onAction('rewrite', id)}
        onTranslate={id => onAction('translate', id)}
        onPin={id => onAction('pin', id)}
        onForward={id => onAction('forward', id)}
        onMore={id => onAction('more', id)}
      />
      <span className={styles.agentAv}>
        <span
          className={styles.avLg}
          style={{
            background: `color-mix(in oklab, ${p.accent} 14%, var(--skin-panel))`,
            borderColor: `color-mix(in oklab, ${p.accent} 35%, transparent)`,
            color: p.ink,
          }}
        >
          {letter}
        </span>
      </span>
      <div
        className={styles.bodyWrap}
        style={{ borderLeftColor: p.accent }}
      >
        <div className={styles.msgHd}>
          <span className={styles.msgNm}>{m.senderName ?? 'Agent'}</span>
          <span
            className={styles.agPill}
            style={{
              color: p.ink,
              background: `color-mix(in oklab, ${p.accent} 12%, transparent)`,
              borderColor: `color-mix(in oklab, ${p.accent} 28%, transparent)`,
            }}
          >
            AGENT
          </span>
          {m.timestamp && <span className={styles.msgT}>{fmtTime(m.timestamp)}</span>}
          {m.pinned && (
            <span className={styles.msgT} title="已置顶" style={{ display: 'inline-flex', alignItems: 'center', gap: 2, color: 'var(--t-accent)' }}>
              <Pin size={10} strokeWidth={2} aria-hidden />置顶
            </span>
          )}
        </div>
        <div className={styles.msgText}>
          {renderWithMentions(m.content)}
          {m.streaming && <span className={styles.streamCaret} aria-hidden>▍</span>}
        </div>

        {/* Stream H · agent msg issue 列表（critic/reviewer 产出）— 对照 chat-fb.html 1200-1204 */}
        {m.issues && m.issues.length > 0 && <IssueListFB issues={m.issues} />}

        {m.toolCall && (
          <div className={styles.toolChip}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} width={11} height={11}>
              <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 17.93 8.8l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
            <span className={styles.toolChipN}>{m.toolCall.name}</span>
            {m.toolCall.args && <span className={styles.toolChipM}>{m.toolCall.args}</span>}
            <span className={styles.toolChipOk}>✓</span>
          </div>
        )}

        {/* Stream H 2026-05-28 · MsgReactionsFB 接入（reactions / thread-chip / read-by）
            TODO: 等后端 chat_messages.reactions / thread_count / read_by 字段上线后
                  把下面的 mock 值换成 m.payload 里的真实数据。当前只有 onAddReaction
                  让用户能"点 +"触发空 toolbar，其他字段为空时组件返回 null 不渲染。 */}
        <MsgReactionsFB
          reactions={toReactionItems(m.reactions)}
          onAddReaction={() => onAction('react', m.id)}
          onToggleReaction={() => onAction('react', m.id)}
          onOpenThread={() => onAction('thread', m.id)}
        />
      </div>
    </div>
  );
}

// ─── User 消息（右侧）─────────────────────────────────────────────────────────
function UserMsg({
  m,
  onAction,
}: {
  m: ChatMessage;
  onAction: (action: ChatFeedAction, id: string) => void;
}) {
  const p = paletteOf(m.senderName ?? 'me');
  const letter = m.senderGlyph || initialOf(m.senderName) || '我';
  // TODO: 等后端 reply-to 数据模型上线后，replyTo 字段会由 chat_messages.metadata
  //       映射；当前仅前端结构，点击滚动暂用 anchor#msg-{id}。
  const handleReplyClick = m.replyTo
    ? () => {
        const el = document.getElementById(`msg-${m.replyTo!.id}`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    : undefined;
  return (
    <div className={`${styles.usermsg} ${styles.msgHoverHost}`} id={`msg-${m.id}`}>
      <MessageHoverToolbarFB
        messageId={m.id}
        onReact={id => onAction('react', id)}
        onReply={id => onAction('reply', id)}
        onThread={id => onAction('thread', id)}
        onQuote={id => onAction('quote', id)}
        onRewrite={id => onAction('rewrite', id)}
        onTranslate={id => onAction('translate', id)}
        onPin={id => onAction('pin', id)}
        onForward={id => onAction('forward', id)}
        onMore={id => onAction('more', id)}
      />
      <div className={styles.usermsgCol}>
        <div className={styles.usermsgHd}>
          {m.pinned && (
            <span className={styles.msgT} title="已置顶" style={{ display: 'inline-flex', alignItems: 'center', gap: 2, color: 'var(--t-accent)' }}>
              <Pin size={10} strokeWidth={2} aria-hidden />置顶
            </span>
          )}
          {m.timestamp && <span className={styles.msgT}>{fmtTime(m.timestamp)}</span>}
          <span className={styles.msgNm}>{m.senderName ?? '我'}</span>
        </div>
        {m.replyTo && (
          // .reply 引用块 — chat-fb.html 行 1233-1241 / CSS 行 448-452
          <button
            type="button"
            className={styles.usermsgReply}
            onClick={handleReplyClick}
            aria-label={`引用 ${m.replyTo.sender} 的消息`}
          >
            <span className={styles.usermsgReplyWho}>{m.replyTo.sender}</span>
            <span className={styles.usermsgReplyExcerpt}>{m.replyTo.excerpt}</span>
          </button>
        )}
        <div className={styles.usermsgBubble}>{renderWithMentions(m.content)}</div>
        {m.reactions && Object.keys(m.reactions).length > 0 && (
          <MsgReactionsFB
            reactions={toReactionItems(m.reactions)}
            onToggleReaction={() => onAction('react', m.id)}
          />
        )}
        {m.status && (
          <div className={styles.usermsgDelivered}>
            已送达{m.status === 'read' ? ' · 已读' : ''}
          </div>
        )}
      </div>
      <span
        className={styles.avLg}
        style={{
          background: `color-mix(in oklab, ${p.accent} 16%, var(--skin-panel))`,
          borderColor: `color-mix(in oklab, ${p.accent} 38%, transparent)`,
          color: p.ink,
        }}
      >
        {letter}
      </span>
    </div>
  );
}

// ─── System 消息（居中浅灰行）────────────────────────────────────────────────
function SystemMsg({ m }: { m: ChatMessage }) {
  return (
    <div className={styles.sysnote}>
      <span>{m.content}</span>
    </div>
  );
}

// ─── 主组件 ───────────────────────────────────────────────────────────────────
export function ChatFeedFB({
  messages,
  groupName,
  onMessageAction,
  typing,
  typingAgentName,
}: ChatFeedFBProps) {
  const today = new Date();
  const dayLabel = `今天 · ${today.getMonth() + 1} 月 ${today.getDate()} 日`;

  // 缺省 callback —— 没接 handler 时落到 console，方便定位"哪个动作未接"
  const handleAction = (action: ChatFeedAction, id: string): void => {
    if (onMessageAction) onMessageAction(action, id);
    // eslint-disable-next-line no-console
    else console.log(`[ChatFeedFB] action ${action} on ${id} (no parent handler)`);
  };

  return (
    <div className={styles.feed}>
      {/* 日期分割线 — chat-fb.html 行 1142 */}
      <div className={styles.dayDiv}>
        <div className={styles.dayLn} />
        <div className={styles.dayLb}>{dayLabel}</div>
        <div className={styles.dayLn} />
      </div>

      {groupName && messages.length > 0 && (
        <div className={styles.sysnote}>
          <span>会话已恢复 · {groupName}</span>
        </div>
      )}

      {messages.map(m => {
        // Stream H · 系统决策卡（待 SSE schema 定下来后由 useChatStream 投递）
        if (m.kind === 'syscard') {
          const p = (m.payload ?? {}) as {
            kind?: SyscardKind;
            title?: string;
            meta?: Record<string, string>;
          };
          return (
            <SyscardFB
              key={m.id}
              kind={p.kind ?? 'system-event'}
              title={p.title}
              reason={m.content}
              timestamp={m.timestamp}
              meta={p.meta}
            />
          );
        }
        // Stream H · 行内 Approval Gate
        if (m.kind === 'inline-approval') {
          const p = (m.payload ?? {}) as {
            gateId?: string;
            agentName?: string;
            agentGlyph?: string;
            agentColor?: string;
            agentRole?: string;
            title?: string;
            metrics?: InlineApprovalMetric[];
            choices?: InlineApprovalChoice[];
            status?: InlineApprovalStatus;
            waitText?: string;
          };
          return (
            <InlineApprovalFB
              key={m.id}
              gateId={p.gateId ?? m.id}
              agentName={p.agentName ?? m.senderName}
              agentGlyph={p.agentGlyph ?? m.senderGlyph}
              agentColor={p.agentColor}
              agentRole={p.agentRole}
              title={p.title}
              description={m.content}
              metrics={p.metrics}
              choices={
                p.choices ?? [
                  { key: 'approve', label: '批准', kind: 'approve' },
                  { key: 'reject', label: '驳回', kind: 'reject' },
                ]
              }
              status={p.status ?? 'pending'}
              waitText={p.waitText}
              onChoose={key => handleAction(key === 'approve' ? 'pin' : 'more', m.id)}
            />
          );
        }
        if (m.role === 'system') return <SystemMsg key={m.id} m={m} />;
        if (m.role === 'user') return <UserMsg key={m.id} m={m} onAction={handleAction} />;
        return <AgentMsg key={m.id} m={m} onAction={handleAction} />;
      })}

      {/* Stream H · 末尾 TypingDots（chatStream.loading 时） */}
      {typing && <TypingDotsFB agentName={typingAgentName} />}
    </div>
  );
}

export default ChatFeedFB;
