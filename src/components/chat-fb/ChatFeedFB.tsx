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

export interface ChatFeedFBProps {
  messages: ChatMessage[];
  /** 群名，用作日期分割线下方 sysnote 文案 */
  groupName?: string;
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

function fmtTime(ts: string | undefined): string {
  if (!ts) return '';
  // 已经是 hh:mm / "1 min ago" 这类格式就直接展示
  if (/^\d{1,2}:\d{2}$/.test(ts) || ts.length < 16) return ts;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ─── Agent 消息（左侧）─────────────────────────────────────────────────────────
function AgentMsg({ m }: { m: ChatMessage }) {
  const key = m.senderName ?? m.id;
  const p = paletteOf(key);
  const letter = m.senderGlyph || initialOf(m.senderName);

  return (
    <div className={styles.msg}>
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
        </div>
        <div className={styles.msgText}>
          {m.content}
          {m.streaming && <span className={styles.streamCaret} aria-hidden>▍</span>}
        </div>

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
      </div>
    </div>
  );
}

// ─── User 消息（右侧）─────────────────────────────────────────────────────────
function UserMsg({ m }: { m: ChatMessage }) {
  const p = paletteOf(m.senderName ?? 'me');
  const letter = m.senderGlyph || initialOf(m.senderName) || '我';
  return (
    <div className={styles.usermsg}>
      <div className={styles.usermsgCol}>
        <div className={styles.usermsgHd}>
          {m.timestamp && <span className={styles.msgT}>{fmtTime(m.timestamp)}</span>}
          <span className={styles.msgNm}>{m.senderName ?? '我'}</span>
        </div>
        <div className={styles.usermsgBubble}>{m.content}</div>
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
export function ChatFeedFB({ messages, groupName }: ChatFeedFBProps) {
  const today = new Date();
  const dayLabel = `今天 · ${today.getMonth() + 1} 月 ${today.getDate()} 日`;

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
        if (m.role === 'system') return <SystemMsg key={m.id} m={m} />;
        if (m.role === 'user') return <UserMsg key={m.id} m={m} />;
        return <AgentMsg key={m.id} m={m} />;
      })}
    </div>
  );
}

export default ChatFeedFB;
