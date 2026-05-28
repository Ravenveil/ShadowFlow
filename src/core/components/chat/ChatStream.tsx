/**
 * ChatStream + MessageBubble — shared chat-rendering primitives.
 *
 * Extracted from `src/pages/AgentDMPage.tsx` (P3 step) so that ChatPage (group
 * chat) and AgentDMPage (1:1 DM) can share the same visual contract during the
 * upcoming PD refactor pass.
 *
 * Visual signature (must match the AgentDMPage 2026-04 baseline):
 *   - user      — right-aligned, `var(--t-accent)` bg, `var(--t-accent-ink)` text,
 *                 borderRadius 12 12 4 12, status glyphs at bottom (✓ / ✓✓ / ✓✓·).
 *   - agent     — left-aligned, `var(--t-panel-2)` bg, 1px `var(--t-border)`,
 *                 borderRadius 12 12 12 4, optional sender header (avatar + name)
 *                 above bubble for group context.
 *   - system    — centered subtle `var(--t-fg-4)` text with hairline divider lines.
 *   - toolCall  — mono dashed inset block (`> tool.name("args")`) prepended inside
 *                 an agent bubble.
 *
 * Streaming bubbles append a blinking purple ▍ caret. All colors flow through the
 * `--t-*` token system so theme switches stay automatic.
 *
 * NOTE: This file is consumed by ChatPage and AgentDMPage in the next refactor
 * step (PD phase). It does not modify any existing page yet — it only defines
 * the contract.
 */
import type { CSSProperties, ReactNode } from 'react';
import { HfAvatar } from '../../../components/hifi';
import { useI18n } from '../../../common/i18n';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ChatRole = 'user' | 'agent' | 'system';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  /** "2m ago" — already-formatted, displayed below bubble. */
  timestamp?: string;
  /** User-side delivery state — only rendered for `role === 'user'`. */
  status?: 'sent' | 'delivered' | 'read';
  /** Agent-side tool call inset — only rendered for `role === 'agent'`. */
  toolCall?: { name: string; args?: string };
  /** When true, append a blinking caret to the bubble tail. */
  streaming?: boolean;
  /** Group-chat sender display name (DM omits). */
  senderName?: string;
  /** Group-chat sender avatar glyph (single character preferred). */
  senderGlyph?: string;
  /** Group-chat sender avatar tile color (token, e.g. `var(--t-accent)`). */
  senderColor?: string;
  /**
   * 引用上文消息（飞书风 user msg `.reply` 引用块）。
   * 当前仅 FB feed (`ChatFeedFB`) 渲染，user role 才显示。
   * TODO: 后端 chat schema 暂无对应字段，前端先用此结构占位；
   *       接 ACP/Python 后将由 `chat_messages.metadata.reply_to` 映射。
   */
  replyTo?: {
    id: string;
    sender: string;
    excerpt: string;
  };
  /**
   * Stream H 2026-05-28 · 非常规 kind 用于 feed 流内嵌系统/审批卡。
   * 等 SSE schema 定下来后由 useChatStream 投递。
   *   - 'syscard'         → SyscardFB（policy reject/approve, gate fail/pass）
   *   - 'inline-approval' → InlineApprovalFB（feed 内嵌审批门）
   * payload 是宽松 JSON，让组件按需取字段；保持 ChatMessage 主体兼容。
   */
  kind?: 'syscard' | 'inline-approval';
  payload?: Record<string, unknown>;
}

export interface MessageBubbleProps {
  message: ChatMessage;
  /** When true, show `[avatar] sender_name` row above an agent bubble. */
  showSenderHeader?: boolean;
}

export interface ChatStreamProps {
  messages: ChatMessage[];
  /** Pass-through to MessageBubble; ChatStream additionally collapses headers
   *  for consecutive same-sender agent messages. */
  showSenderHeader?: boolean;
  /** Rendered when `messages` is empty. */
  emptyState?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const KEYFRAMES_INJECTED_FLAG = '__sfChatStreamKeyframes';

/** Inject the @keyframes once per document — avoids needing a CSS file edit. */
function ensureBlinkKeyframes() {
  if (typeof document === 'undefined') return;
  const w = window as unknown as Record<string, boolean>;
  if (w[KEYFRAMES_INJECTED_FLAG]) return;
  const style = document.createElement('style');
  style.setAttribute('data-sf-chatstream', 'true');
  style.textContent = `
@keyframes sfChatStreamBlink {
  0%, 49% { opacity: 1; }
  50%, 100% { opacity: 0; }
}
.sf-chat-caret {
  display: inline-block;
  margin-left: 2px;
  color: var(--t-accent);
  animation: sfChatStreamBlink 1s steps(2, end) infinite;
  font-weight: 600;
}
`;
  document.head.appendChild(style);
  w[KEYFRAMES_INJECTED_FLAG] = true;
}

function statusGlyph(s?: 'sent' | 'delivered' | 'read'): string {
  if (!s) return '';
  if (s === 'sent') return '✓';
  if (s === 'delivered') return '✓✓';
  return '✓✓·'; // read
}

// ---------------------------------------------------------------------------
// MessageBubble
// ---------------------------------------------------------------------------

export function MessageBubble({ message, showSenderHeader = false }: MessageBubbleProps) {
  const { language } = useI18n();
  const T = (zh: string, en: string) => (language === 'zh' ? zh : en);
  ensureBlinkKeyframes();

  // ---------- system row (centered, hairline divider style) ----------
  if (message.role === 'system') {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          margin: '4px 0',
        }}
      >
        <span
          style={{
            flex: 1,
            height: 1,
            background: 'var(--t-border)',
            opacity: 0.6,
          }}
        />
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10.5,
            color: 'var(--t-fg-4)',
            letterSpacing: '.04em',
            whiteSpace: 'nowrap',
          }}
        >
          {message.content}
        </span>
        <span
          style={{
            flex: 1,
            height: 1,
            background: 'var(--t-border)',
            opacity: 0.6,
          }}
        />
      </div>
    );
  }

  const isUser = message.role === 'user';

  const rowStyle: CSSProperties = {
    display: 'flex',
    flexDirection: isUser ? 'row-reverse' : 'row',
    alignItems: 'flex-end',
    gap: 10,
  };

  const bubbleStyle: CSSProperties = {
    maxWidth: '65%',
    padding: '10px 14px',
    borderRadius: isUser ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
    background: isUser ? 'var(--t-accent)' : 'var(--t-panel-2)',
    color: isUser ? 'var(--t-accent-ink)' : 'var(--t-fg)',
    fontSize: 13.5,
    lineHeight: 1.5,
    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
    border: isUser ? 'none' : '1px solid var(--t-border)',
    minWidth: 0,
    wordBreak: 'break-word',
  };

  const metaStyle: CSSProperties = {
    fontFamily: 'var(--font-mono)',
    fontSize: 9.5,
    color: 'var(--t-fg-5)',
    marginTop: 4,
    textAlign: isUser ? 'right' : 'left',
    letterSpacing: '.02em',
  };

  const senderName = message.senderName ?? T('Agent', 'Agent');
  const senderGlyph = message.senderGlyph ?? senderName.charAt(0).toUpperCase();
  const senderColor = message.senderColor ?? 'var(--t-accent)';

  const statusTitle =
    message.status === 'read'
      ? T('已读', 'Read')
      : message.status === 'delivered'
        ? T('已送达', 'Delivered')
        : T('已发送', 'Sent');

  return (
    <div style={rowStyle}>
      {/* avatar slot — only rendered alongside agent bubbles when header is on */}
      {!isUser && showSenderHeader ? (
        <HfAvatar glyph={senderGlyph} color={senderColor} size={28} />
      ) : !isUser ? (
        // keep horizontal alignment consistent with other agent rows
        <div style={{ width: 28, flexShrink: 0 }} />
      ) : null}

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: isUser ? 'flex-end' : 'flex-start',
          minWidth: 0,
          maxWidth: '70%',
        }}
      >
        {!isUser && showSenderHeader ? (
          <span
            className="hf-meta"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              marginBottom: 3,
              color: 'var(--t-fg-3)',
              letterSpacing: '.04em',
            }}
          >
            {senderName}
          </span>
        ) : null}

        <div style={bubbleStyle}>
          {message.toolCall ? (
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: 'var(--t-fg-3)',
                background: 'var(--t-bg)',
                border: '1px dashed var(--t-border)',
                borderRadius: 6,
                padding: '6px 10px',
                marginBottom: 6,
                whiteSpace: 'pre-wrap',
                overflowWrap: 'anywhere',
              }}
            >
              <span style={{ color: 'var(--t-accent)' }}>&gt; </span>
              {message.toolCall.name}
              {message.toolCall.args ? `("${message.toolCall.args}")` : '()'}
            </div>
          ) : null}
          <span>{message.content}</span>
          {message.streaming ? (
            <span
              className="sf-chat-caret"
              aria-hidden="true"
              title={T('正在输出', 'Streaming')}
            >
              ▍
            </span>
          ) : null}
        </div>

        {(message.timestamp || (isUser && message.status)) && (
          <span style={metaStyle} title={isUser && message.status ? statusTitle : undefined}>
            {message.timestamp ?? ''}
            {isUser && message.status
              ? `${message.timestamp ? ' · ' : ''}${statusGlyph(message.status)} ${statusTitle}`
              : ''}
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ChatStream
// ---------------------------------------------------------------------------

export function ChatStream({
  messages,
  showSenderHeader = false,
  emptyState,
  className,
  style,
}: ChatStreamProps) {
  if (messages.length === 0 && emptyState !== undefined) {
    return <>{emptyState}</>;
  }

  const containerStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    padding: '16px 24px',
    overflow: 'auto',
    ...style,
  };

  return (
    <div className={className} style={containerStyle}>
      {messages.map((m, i) => {
        const prev = i > 0 ? messages[i - 1] : undefined;
        // Collapse repeated headers when the previous message was from the
        // same agent sender — keeps DM-style readability in long runs.
        const collapseHeader =
          showSenderHeader &&
          m.role === 'agent' &&
          prev !== undefined &&
          prev.role === 'agent' &&
          prev.senderName === m.senderName;
        return (
          <MessageBubble
            key={m.id}
            message={m}
            showSenderHeader={showSenderHeader && !collapseHeader}
          />
        );
      })}
    </div>
  );
}
