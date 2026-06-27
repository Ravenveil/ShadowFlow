/**
 * UnifiedChatFeed — 把 StudioMessageRow 的「统一回合气泡」铺到所有聊天面。
 *
 * OWNER: chat-unify。用户明确要求「把对话框统一」——此前只有 workbench
 * (StudioChat) 用上了 StudioMessageRow 的回合分组（一个回合一个头像 + AvatarSpacer
 * 对齐），而真正「乱」的存量群聊 (ChatPage) / 个人单聊 (PersonalChatView) 仍各跑各的
 * 气泡。本组件是三个聊天面共用的渲染层：
 *
 *   - 输入任意 StudioMessage[]（由各页用 chatMessagesToStudio /
 *     timelineMessagesToStudio 适配自己的原生消息类型）。
 *   - 用共享 groupMessages 判定每条是否同回合续行 → StudioMessageRow 统一渲染。
 *   - 智能自动滚动（贴底跟随、上滚暂停），与 run-session Timeline 同款手感。
 *   - 入场动画只给「挂载后新增」的消息（历史不抖），与 StudioChat / ChatFeedFB
 *     / Timeline 的 initialIds gating 一致。
 *
 * 纯展示：不取数据、不发消息。父页保留各自的 composer / header / 抽屉。
 */
import { Fragment, memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { StudioMessageRow, groupMessages, type StudioMessage } from './StudioMessageRow';
import { paletteForAgent, initialOf } from '../chat-fb/agentAvatar';

const STICK_THRESHOLD_PX = 100;

/** ISO ts → 本地「YYYY年M月D日」日键；解析失败返回空串。 */
function dayKey(ts?: string): string {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

function DateDivider({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '10px 4px 6px', userSelect: 'none' }}>
      <div style={{ flex: 1, height: 1, background: 'var(--t-border)' }} />
      <span style={{ fontSize: 10.5, color: 'var(--t-fg-5)', fontWeight: 600, whiteSpace: 'nowrap' }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: 'var(--t-border)' }} />
    </div>
  );
}

export interface UnifiedChatFeedProps {
  messages: StudioMessage[];
  /** 末尾「正在输入」气泡的发言名；传入即渲染一个流式占位行。 */
  typingName?: string;
  /** 「正在输入」头像的生成式种子（优先 agent_id）；缺省回退 typingName。
   *  与回复气泡用同一种子，避免 typing→回复 头像纹样跳变。 */
  typingSeed?: string;
  /** 顶部留白 / 列表内边距覆盖。 */
  padding?: string;
  /** 空态（messages.length === 0 且无 typing）渲染内容；不传则什么都不渲染。 */
  empty?: React.ReactNode;
  /** 重试回调：用户气泡 status==='error' 时触发。参数为消息文本。 */
  onRetry?: (text: string) => void;
}

/**
 * 统一聊天消息列表。内部自带受限高度滚动容器（flex:1; min-height:0; overflow-y:auto），
 * 父级给一个 flex column + minHeight:0 的容器即可让自动滚动生效。
 */
export const UnifiedChatFeed = memo(function UnifiedChatFeed({
  messages,
  typingName,
  typingSeed,
  padding = '12px 18px 18px',
  empty,
  onRetry,
}: UnifiedChatFeedProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [stick, setStick] = useState(true);

  // 入场动画 gating：首渲染已存在的 id = 历史，不动画；之后新增的才 sf-msg-in。
  const initialIds = useRef<Set<string> | null>(null);
  if (initialIds.current === null) initialIds.current = new Set(messages.map((m) => m.id));
  const isNew = (id: string) => !initialIds.current!.has(id);

  // 用户上滚 > 100px 暂停跟随；回到底部恢复。
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
      setStick(dist <= STICK_THRESHOLD_PX);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  useLayoutEffect(() => {
    if (!stick) return;
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages, stick, typingName]);

  const grouped = groupMessages(messages);
  const showEmpty = messages.length === 0 && !typingName;

  // 「正在输入」= 一个临时流式 assistant 行，复用 StudioMessageRow 的三点占位。
  // 头像色/首字按发言名取（paletteFor=avatar_color 注册表），与正式 agent 气泡同色同字，
  // 避免「typing 用默认蓝、回复用 avatar_color」造成图标中途跳色。
  const typingMsg: StudioMessage | null = typingName
    ? {
        id: '__typing__', role: 'assistant', text: '', senderName: typingName, streaming: true,
        senderGlyph: initialOf(typingName),
        senderColor: paletteForAgent(typingSeed, typingName).accent,
        senderSeed: typingSeed || typingName,
      }
    : null;
  const typingGrouped =
    !!typingMsg &&
    messages.length > 0 &&
    messages[messages.length - 1].role === 'assistant' &&
    (messages[messages.length - 1].senderName ?? '') === (typingName ?? '');

  const scrollToBottom = () => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  };

  return (
    <div style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', flexDirection: 'column' }}>
    <div ref={scrollRef} className="sf-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding }}>
      {showEmpty
        ? empty ?? null
        : (
          <>
            {messages.map((m, i) => {
              // 为 assistant error 气泡查找最近的前驱用户消息文本，供重试按钮使用。
              // user error 气泡自带 m.text，无需此逻辑。
              let retryText: string | undefined;
              if (m.role === 'assistant' && (m.error || m.status === 'error')) {
                for (let j = i - 1; j >= 0; j--) {
                  if (messages[j].role === 'user' && messages[j].text) {
                    retryText = messages[j].text;
                    break;
                  }
                }
              }
              // 日期分隔符：本条与前一条跨天（或首条且有时间戳）时插入。
              const dk = dayKey(m.timestamp);
              const prevDk = i > 0 ? dayKey(messages[i - 1].timestamp) : '';
              const showDivider = !!dk && dk !== prevDk;
              return (
                <Fragment key={m.id}>
                  {showDivider && <DateDivider label={dk} />}
                  <StudioMessageRow
                    message={m}
                    grouped={showDivider ? false : grouped[i]}
                    animateIn={isNew(m.id) && !m.streaming}
                    onRetry={onRetry}
                    retryText={retryText}
                  />
                </Fragment>
              );
            })}
            {typingMsg && <StudioMessageRow message={typingMsg} grouped={typingGrouped} />}
          </>
        )}
    </div>
    {/* 回底部按钮：用户上滚（!stick）且有消息时浮现，点击平滑滚到最新。 */}
    {!stick && messages.length > 0 && (
      <button
        type="button"
        onClick={scrollToBottom}
        aria-label="滚动到最新消息"
        data-testid="scroll-to-bottom"
        style={{
          position: 'absolute', right: 18, bottom: 14, zIndex: 5,
          width: 32, height: 32, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--t-panel)', color: 'var(--t-fg-2)',
          border: '1px solid var(--t-border)', cursor: 'pointer',
          boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
          animation: 'sf-msg-in var(--dur-2, 180ms) var(--ease-out, ease)',
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 5v14M19 12l-7 7-7-7" />
        </svg>
      </button>
    )}
    </div>
  );
});

export default UnifiedChatFeed;

// ── 适配层：把各页原生消息映射成 StudioMessage ────────────────────────────────

/** useChatStream 的 ChatMessage 形状（只取本适配用得到的字段，避免跨模块强耦合）。 */
interface ChatMessageLike {
  id: string;
  role: 'user' | 'agent' | 'system';
  content: string;
  senderName?: string;
  senderGlyph?: string;
  senderColor?: string;
  timestamp?: string;
  streaming?: boolean;
  toolCall?: { name: string; args?: string };
  kind?: 'syscard' | 'inline-approval';
  status?: 'sent' | 'delivered' | 'read' | 'error';
}

/**
 * ChatMessage[]（群聊 / 内嵌 DM，useChatStream）→ StudioMessage[]。
 * - role 映射：agent→assistant、user→user、system→system。
 * - 头像底色：按 sender_name 取全 app 统一墨兰迪色（paletteForAgent），同 agent 同色。
 * - toolCall → 单条已完成 tool 行（done）。
 * - syscard / inline-approval 这类内嵌系统卡仍交回原 feed 处理（此处当 system 行降级），
 *   调用方若要保留富卡可在映射前过滤。
 */
export function chatMessagesToStudio(list: readonly ChatMessageLike[]): StudioMessage[] {
  return list.map((m) => {
    const role: StudioMessage['role'] =
      m.role === 'agent' ? 'assistant' : m.role === 'user' ? 'user' : 'system';
    const name = m.senderName ?? (role === 'user' ? '我' : 'Agent');
    const pal = paletteForAgent(undefined, name);
    return {
      id: m.id,
      role,
      text: m.content ?? '',
      senderName: name,
      senderGlyph: m.senderGlyph || (role === 'assistant' ? initialOf(name) : undefined),
      senderColor: m.senderColor || (role === 'assistant' ? pal.accent : undefined),
      timestamp: m.timestamp,
      streaming: m.streaming,
      status: m.status,
      tools: m.toolCall
        ? [{ id: `${m.id}-tool`, tool: m.toolCall.name, title: m.toolCall.args, status: 'done' as const }]
        : undefined,
    };
  });
}

/** run-session Timeline 的 TimelineMessage 形状（取本适配用得到的字段）。 */
interface TimelineMessageLike {
  id: string;
  kind: string;
  text?: string;
  body?: string;
  streaming?: boolean;
  sender_name?: string;
  agent_id?: string;
  source?: string;
  /** ISO 时间戳；透传给 StudioMessage 供悬停相对时间 + 日期分隔符。 */
  timestamp?: string;
  /** 用户消息发送状态；'error' 时映射出 status==='error' 触发重试按钮。 */
  status?: 'sent' | 'delivered' | 'read' | 'error';
}

/**
 * TimelineMessage[]（个人单聊 PersonalChatView 当前用 Timeline 渲染）→ StudioMessage[]。
 * 只映射聊天面会出现的 3 类：user_turn / assistant_text / raw（网关失败反馈）。
 * 其余富过程卡（thinking/tool_call/step_panel…）此适配先不接——个人单聊当前也不产出
 * 这些（DM 走网关纯文本）。调用方传进来前已 filter 掉空 content。
 */
export function timelineMessagesToStudio(list: readonly TimelineMessageLike[]): StudioMessage[] {
  const out: StudioMessage[] = [];
  for (const m of list) {
    if (m.kind === 'user_turn') {
      out.push({ id: m.id, role: 'user', text: m.text ?? '', senderName: '我', status: m.status, timestamp: m.timestamp });
    } else if (m.kind === 'assistant_text') {
      const name = m.sender_name ?? 'Agent';
      const pal = paletteForAgent(m.agent_id, name);
      out.push({
        id: m.id,
        role: 'assistant',
        text: m.body ?? '',
        senderName: name,
        senderGlyph: initialOf(name),
        senderColor: pal.accent,
        // 生成式头像种子：优先 agent_id（确定性、不撞名），缺省回退发言名。
        senderSeed: m.agent_id || name,
        streaming: m.streaming,
        timestamp: m.timestamp,
      });
    } else if (m.kind === 'raw') {
      // 网关失败反馈（缺 key/403/悬空成员）→ error 气泡，决不静默吞掉。
      out.push({
        id: m.id,
        role: 'assistant',
        text: m.body ?? '',
        senderName: m.sender_name ?? '系统',
        error: true,
      });
    }
    // 其它 kind（thinking / tool_call / msg_foot…）在聊天面不出现，跳过。
  }
  return out;
}
