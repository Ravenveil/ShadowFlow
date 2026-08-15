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
import { Pin, User } from 'lucide-react';
import { paletteFor, initialOf } from './agentAvatar';
import { MessageHoverToolbarFB } from './MessageHoverToolbarFB';
import { TypingDotsFB } from './TypingDotsFB';
import { MsgReactionsFB, type MsgReactionItem, type ReactionIconKey } from './MsgReactionsFB';
import { SyscardFB, type SyscardKind } from './SyscardFB';
import { InlineApprovalFB, type InlineApprovalStatus, type InlineApprovalChoice, type InlineApprovalMetric } from './InlineApprovalFB';
import { IssueListFB } from './IssueListFB';
import { CodeBlockToolbar } from '../CodeBlockToolbar';
import { useRef, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

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

// 头像配色统一从 agentAvatar 取（单一事实来源，跨页面同 agent 同色）

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

/**
 * UI5.0(2026-08-14)· Agent 消息富文本：fenced code block(```lang … ```)切出来
 * 交给 CodeBlockToolbar（圆角 12px + 复制/折行/行号/折叠工具条），其余文本
 * 仍走 renderWithMentions（保留 @mention chip 与 streaming caret 行为）。
 * 纯渲染层切分，不动数据流。
 */
function renderRichContent(text: string): ReactNode {
  if (!text) return null;
  const re = /```(\w*)\n([\s\S]*?)```/g;
  const parts: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let idx = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      parts.push(<span key={`rt-t-${idx}`}>{renderWithMentions(text.slice(last, m.index))}</span>);
    }
    parts.push(
      <CodeBlockToolbar
        key={`rt-c-${idx}`}
        code={m[2].replace(/\n$/, '')}
        lang={m[1] || undefined}
        className={styles.msgCodeBlock}
      />,
    );
    last = m.index + m[0].length;
    idx += 1;
  }
  if (last < text.length) {
    parts.push(<span key={`rt-t-${idx}`}>{renderWithMentions(text.slice(last))}</span>);
  }
  return parts;
}

/** UI5.0 · 工具卡展开区 URL → 可点链接（accent 色，新窗口打开）。 */
function linkifyUrls(text: string): ReactNode {
  const re = /(https?:\/\/[^\s)"']+)/g;
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let idx = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(
      <a
        key={`lk-${idx++}`}
        href={m[1]}
        target="_blank"
        rel="noopener noreferrer"
        className={styles.toolCardLink}
      >
        {m[1]}
      </a>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out.length > 0 ? out : text;
}

/**
 * UI5.0 · 工具调用可视化卡：头部（图标 + 工具名 + 查询词 + ✓ + 展开 chevron），
 * 有 args 时可展开看完整细节（URL 可点）。无 args 时头部不可点（静态卡）。
 * 展开态是纯展示 state，不触碰数据流。
 */
function ToolCardFB({ toolCall }: { toolCall: { name: string; args?: string } }) {
  const [open, setOpen] = useState(false);
  const expandable = !!toolCall.args;
  return (
    <div className={`${styles.toolCard} ${open ? styles.toolCardOpen : ''}`}>
      <button
        type="button"
        className={`${styles.toolCardHd} ${expandable ? '' : styles.toolCardHdStatic}`}
        onClick={expandable ? () => setOpen(p => !p) : undefined}
        aria-expanded={expandable ? open : undefined}
      >
        <span className={styles.toolCardIcon} aria-hidden>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} width={12} height={12}>
            <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 17.93 8.8l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
        </span>
        <span className={styles.toolCardName}>{toolCall.name}</span>
        {toolCall.args && <span className={styles.toolCardQuery}>{toolCall.args}</span>}
        <span className={styles.toolCardOk}>✓</span>
        {expandable && (
          <span className={styles.toolCardChevron} aria-hidden>
            <ChevronDown size={13} strokeWidth={2} />
          </span>
        )}
      </button>
      {open && toolCall.args && (
        <div className={styles.toolCardBody}>{linkifyUrls(toolCall.args)}</div>
      )}
    </div>
  );
}

function fmtTime(ts: string | undefined): string {
  if (!ts) return '';
  // 已经是 hh:mm / "1 min ago" 这类格式就直接展示
  if (/^\d{1,2}:\d{2}$/.test(ts) || ts.length < 16) return ts;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * 从消息 timestamp 提取"日期键"（用于比较相邻消息是否同天）。
 * 仅解析 ISO 字符串（长度 ≥ 16），已格式化的短字符串返回 null（不插分割线）。
 */
function getDayKey(ts: string | undefined): string | null {
  if (!ts) return null;
  if (/^\d{1,2}:\d{2}$/.test(ts) || ts.length < 16) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return d.toDateString(); // 稳定的日期标识符，如 "Thu Jun 26 2026"
}

/**
 * 把日期键格式化为 "今天 · 6月26日" / "昨天 · 6月25日" / "2026年6月24日"。
 */
function fmtDayLabel(ts: string): string {
  const d = new Date(ts);
  const today = new Date();
  const yest = new Date(today);
  yest.setDate(today.getDate() - 1);
  const m = d.getMonth() + 1;
  const day = d.getDate();
  if (d.toDateString() === today.toDateString()) return `今天 · ${m}月${day}日`;
  if (d.toDateString() === yest.toDateString()) return `昨天 · ${m}月${day}日`;
  return `${d.getFullYear()}年${m}月${day}日`;
}

// ─── Agent 消息（左侧）─────────────────────────────────────────────────────────
function AgentMsg({
  m,
  onAction,
  animateIn,
}: {
  m: ChatMessage;
  onAction: (action: ChatFeedAction, id: string) => void;
  animateIn?: boolean;
}) {
  // 按 agent 显示名取色——和 DM 列表 / 群设置同 agent 同色
  const p = paletteFor(m.senderName ?? m.id);
  const letter = m.senderGlyph || initialOf(m.senderName);

  return (
    <div className={`${styles.msg} ${styles.msgHoverHost}${animateIn ? ' sf-msg-in' : ''}`} id={`msg-${m.id}`}>
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
            background: p.bg,
            borderColor: p.border,
            color: p.fg,
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
              color: p.fg,
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
          {renderRichContent(m.content)}
          {m.streaming && <span className={styles.streamCaret} aria-hidden>▍</span>}
        </div>

        {/* Stream H · agent msg issue 列表（critic/reviewer 产出）— 对照 chat-fb.html 1200-1204 */}
        {m.issues && m.issues.length > 0 && <IssueListFB issues={m.issues} />}

        {/* UI5.0 · 工具调用卡（可展开，旧 toolChip 样式保留未删） */}
        {m.toolCall && <ToolCardFB toolCall={m.toolCall} />}

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
  animateIn,
}: {
  m: ChatMessage;
  onAction: (action: ChatFeedAction, id: string) => void;
  animateIn?: boolean;
}) {
  const p = paletteFor(m.senderName ?? 'me');
  // 用户消息头像：未显式设置 glyph 时用游客/人形图标，不再用「U」首字母占位
  const avatar = m.senderGlyph ? m.senderGlyph : <User size={15} strokeWidth={2} aria-hidden />;
  // TODO: 等后端 reply-to 数据模型上线后，replyTo 字段会由 chat_messages.metadata
  //       映射；当前仅前端结构，点击滚动暂用 anchor#msg-{id}。
  const handleReplyClick = m.replyTo
    ? () => {
        const el = document.getElementById(`msg-${m.replyTo!.id}`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    : undefined;
  return (
    <div className={`${styles.usermsg} ${styles.msgHoverHost}${animateIn ? ' sf-msg-in' : ''}`} id={`msg-${m.id}`}>
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
          background: p.bg,
          borderColor: p.border,
          color: p.fg,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {avatar}
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
  // 只给「挂载后新增」的消息加入场动画，避免历史一次性全抖（对齐 Timeline 做法）。
  const initialIds = useRef<Set<string> | null>(null);
  if (initialIds.current === null) initialIds.current = new Set(messages.map(mm => mm.id));
  const isNew = (id: string) => !initialIds.current!.has(id);

  // 缺省 callback —— 没接 handler 时落到 console，方便定位"哪个动作未接"
  const handleAction = (action: ChatFeedAction, id: string): void => {
    if (onMessageAction) onMessageAction(action, id);
    // eslint-disable-next-line no-console
    else console.log(`[ChatFeedFB] action ${action} on ${id} (no parent handler)`);
  };

  // ── 动态日期分割线 ──────────────────────────────────────────────────────────
  // 遍历消息列表，在相邻两条消息日期不同时插入 dayDiv 分割线。
  // 仅对有 ISO 时间戳（长度≥16）的消息生效；无法解析的短字符串不插分割线。
  const messageItems: ReactNode[] = [];
  let lastDayKey = '';
  for (const m of messages) {
    const dayKey = getDayKey(m.timestamp);
    if (dayKey && dayKey !== lastDayKey) {
      lastDayKey = dayKey;
      messageItems.push(
        <div key={`day-sep-${dayKey}`} className={styles.dayDiv}>
          <div className={styles.dayLn} />
          <div className={styles.dayLb}>{fmtDayLabel(m.timestamp!)}</div>
          <div className={styles.dayLn} />
        </div>,
      );
    }

    // Stream H · 系统决策卡（待 SSE schema 定下来后由 useChatStream 投递）
    if (m.kind === 'syscard') {
      const p = (m.payload ?? {}) as {
        kind?: SyscardKind;
        title?: string;
        meta?: Record<string, string>;
      };
      messageItems.push(
        <SyscardFB
          key={m.id}
          kind={p.kind ?? 'system-event'}
          title={p.title}
          reason={m.content}
          timestamp={m.timestamp}
          meta={p.meta}
        />,
      );
      continue;
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
      messageItems.push(
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
        />,
      );
      continue;
    }
    if (m.role === 'system') {
      messageItems.push(<SystemMsg key={m.id} m={m} />);
    } else if (m.role === 'user') {
      messageItems.push(<UserMsg key={m.id} m={m} onAction={handleAction} animateIn={isNew(m.id)} />);
    } else {
      messageItems.push(<AgentMsg key={m.id} m={m} onAction={handleAction} animateIn={isNew(m.id)} />);
    }
  }

  return (
    <div className={styles.feed}>
      {groupName && messages.length > 0 && (
        <div className={styles.sysnote}>
          <span>会话已恢复 · {groupName}</span>
        </div>
      )}

      {messageItems}

      {/* Stream H · 末尾 TypingDots（chatStream.loading 时） */}
      {typing && <TypingDotsFB agentName={typingAgentName} />}
    </div>
  );
}

export default ChatFeedFB;
