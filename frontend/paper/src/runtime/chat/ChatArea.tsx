/**
 * ChatArea — 第三栏：会话头部 + 消息流 + 输入区。文案见 `content/app.ts` 的 CHAT。
 *
 * 消息流有两条画法，按「读得到什么」自动选：
 *   时间线读得到（过程帧齐全）→ TimelineList：思考、工具、步骤、正文连着排；
 *   读不到（没跑过 run / 老后端）→ MessageList：一问一答的气泡流。
 * 选择依据是数据存在与否，不是开关：多一条通道时界面自己变细，少一条也不会空掉。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { AgentAvatar, AvatarStack, AVATAR_SIZE } from '@/shared/ui/avatar';
import { MessageList } from '@/runtime/chat/MessageList';
import { TimelineList } from '@/runtime/chat/TimelineList';
import { MessageRail } from '@/runtime/chat/MessageRail';
import { RunSuggestions } from '@/runtime/chat/RunSuggestions';
import { TeamSavedCard } from '@/runtime/chat/TeamSavedCard';
import { Composer } from '@/runtime/chat/composer/Composer';
import { CHAT } from '@/shared/content/app';
import { TeamRosterCard } from '@/runtime/chat/TeamRosterCard';
import { useTimeline } from '@/shared/data/useTimeline';
import type {
  ComposerData,
  Message,
  Outbound,
  PanelStep,
  RosterMember,
  Session,
} from '@/shared/data/types';
import { IconMore, IconPanel, IconSparkle, IconUsers } from '@/shared/ui/icons';

export function ChatArea({
  session,
  messages,
  roster,
  composer,
  model,
  onModelChange,
  sending,
  onSend,
  onStop,
  transcribe,
  onInspect,
  panelOpen,
  onTogglePanel,
  listOpen,
  onToggleList,
  onOpenAgentDm,
  onOpenSession,
  focusedMember,
  onFocusMember,
  steps,
}: {
  session: Session;
  messages: Message[];
  roster: RosterMember[];
  composer: ComposerData;
  model: string;
  onModelChange: (id: string) => void;
  sending: boolean;
  onSend: (out: Outbound) => Promise<void>;
  onStop: () => void;
  transcribe: (audio: Blob) => Promise<string>;
  onInspect: () => void;
  panelOpen: boolean;
  onTogglePanel: () => void;
  /** 会话列表是否展开；收起后头部留一个展开按钮（否则就没路回去了）。 */
  listOpen?: boolean;
  onToggleList?: () => void;
  /** 点成员头像发起单聊（微信式成员卡）。 */
  onOpenAgentDm?: (agentId: string) => Promise<string>;
  /** 切换到某个会话（团队保存卡「去群聊」CTA 用）。 */
  onOpenSession?: (sessionId: string) => void;
  /** 正在右栏看谁的产物（成员条高亮）。 */
  focusedMember?: string | null;
  /** 点成员卡里的某一行：右栏翻到他的产物。 */
  onFocusMember?: (name: string) => void;
  /** 执行步骤（团队卡判定「已完成」时和消息一起看）。 */
  steps?: PanelStep[];
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isGroup = session.kind === 'group';
  const [membersOpen, setMembersOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  /** 群消息 reactions/pinned 水合态（消息 id → 服务端状态），悬浮操作回写。 */
  const [msgStates, setMsgStates] = useState<
    Record<string, { reactions?: Record<string, string[]>; pinned?: boolean }>
  >({});
  /** 建议卡点击回填 composer 的文本（Composer 内部去重消费）。 */
  const [inject, setInject] = useState<string | null>(null);

  // 过程帧读得到就用时间线画；读不到（这一步返回 unsupported）回落气泡流。
  const timeline = useTimeline(session.id, { awaiting: sending });
  const onTimeline = timeline.status === 'ready' && timeline.messages.length > 0;
  const streamLength = onTimeline ? timeline.messages.length : messages.length;

  // 有人被调用 = 名册 busy（后端 running）∪ 时间线里出现过派工/ hops 帧。
  // 派工帧比 running 状态先到：主控刚拆完 hop、成员还没开跑时卡片就该在场。
  const hopCalled = useMemo(
    () =>
      timeline.messages.some(
        (m) =>
          m.kind === 'hop_card' ||
          (m.kind === 'status_line' && Boolean(m.label || m.text)),
      ),
    [timeline.messages],
  );

  /** 发出去的那句话先上屏：真后端要等一轮 fanout 才回读得到，别让人对着空框等。 */
  const send = async (out: Outbound) => {
    timeline.echo(out.text);
    await onSend(out);
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [streamLength]);

  return (
    <section className="chat">
      <header className="chat-head">
        <div className="chat-head-main">
          {listOpen === false ? (
            <button
              className="sf-icon-btn"
              title={CHAT.showList}
              aria-label={CHAT.showList}
              onClick={onToggleList}
            >
              <IconPanel size={15} />
            </button>
          ) : null}
          {/* 用户反馈（2026-11-25）：单聊顶栏只有名字没头像 → 标题前放对端头像（身份表 micah 脸）。 */}
          <AgentAvatar
            label={session.members[0] ?? session.title}
            size={AVATAR_SIZE.md}
            status={false}
          />
          <h1 className="chat-head-title">{session.title}</h1>
        </div>
        <div className="chat-head-actions">
          {session.members.length > 1 ? (
            <button
              className="chat-head-members"
              title={session.members.join('、')}
              onClick={() => setMembersOpen((v) => !v)}
            >
              <AvatarStack labels={session.members} max={4} size={AVATAR_SIZE.md} />
              <span>{CHAT.members(session.members.length)}</span>
              <IconUsers size={14} />
            </button>
          ) : null}
          <button
            className="sf-icon-btn"
            title={CHAT.more}
            onClick={() => setMoreOpen((v) => !v)}
          >
            <IconMore size={16} />
          </button>
          {moreOpen ? (
            <div className="chat-more-menu" role="menu">
              <button type="button" role="menuitem" onClick={() => { setMoreOpen(false); onInspect(); }}>
                {CHAT.moreInspect}
              </button>
              <button type="button" role="menuitem" onClick={() => {
                setMoreOpen(false);
                void navigator.clipboard?.writeText(session.title).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                });
              }}>
                {copied ? CHAT.copied : CHAT.moreCopy}
              </button>
            </div>
          ) : null}
          {membersOpen ? (
            <div className="chat-members-pop" role="dialog" aria-label={CHAT.memberTitle}>
              <div className="chat-members-pop-head">
                <strong>{CHAT.memberTitle}</strong>
                <span>{CHAT.memberHint}</span>
              </div>
              <div className="chat-members-pop-list">
                {(roster.length ? roster : []).map((m) => (
                  <button
                    type="button"
                    key={m.id}
                    className="chat-member-row"
                    onClick={() => {
                      if (onOpenAgentDm) void onOpenAgentDm(m.id);
                      setMembersOpen(false);
                    }}
                  >
                    <span className="chat-member-face">{m.name.slice(0, 1)}</span>
                    <span className="chat-member-info">
                      <strong>{m.name}</strong>
                      <small>{m.role || m.note || ''}</small>
                    </span>
                    <span className="chat-member-dm">{CHAT.memberOpenDm}</span>
                  </button>
                ))}
                {!roster.length ? <div className="chat-member-empty">{CHAT.noRoster}</div> : null}
              </div>
            </div>
          ) : null}
          <button
            className="sf-icon-btn"
            title={panelOpen ? CHAT.panelHide : CHAT.panelShow}
            data-active={panelOpen ? 'true' : undefined}
            onClick={onTogglePanel}
          >
            <IconPanel size={16} />
          </button>
        </div>
      </header>


      <div className="chat-scroll" ref={scrollRef}>
        <div className="chat-inner">
          {/* 团队卡只在「有人被调用」时出现：全员待命且零派工 → 不渲染，
              纯摆名册不占时间线（用第二栏或成员弹窗看人）。 */}
          {isGroup && roster.length > 1 && (hopCalled || roster.some((m) => m.state === 'busy') || (steps ?? []).some((s) => s.agent)) ? (
            <TeamRosterCard
              members={roster}
              messages={messages}
              steps={steps}
              focused={focusedMember}
              onPick={(name) => onFocusMember?.(name)}
            />
          ) : null}
          {onTimeline ? (
            <TimelineList
              messages={timeline.messages}
              truncated={timeline.truncated}
              groupId={isGroup ? session.id : undefined}
              messageStates={msgStates}
              onMessageStates={setMsgStates}
            />
          ) : messages.length ? (
            <MessageList messages={messages} packs={composer.knowledge} onOpenArtifact={onInspect} />
          ) : (
            <div className="chat-empty">
              <span className="chat-empty-ico">
                <IconSparkle size={18} />
              </span>
              <h3>{CHAT.emptyTitle(session.title)}</h3>
              <p>{isGroup ? CHAT.emptyBody.group : CHAT.emptyBody.dm}</p>
              <div className="chat-empty-chips">
                {(isGroup ? CHAT.emptyChips.group : CHAT.emptyChips.other).map((s) => (
                  <button key={s} onClick={() => void send({ text: s })}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {/* 完成态收尾卡：run 落定 → 后续建议；团队保存帧 → 引导去群聊。 */}
          {timeline.lastSettledRunId ? (
            <RunSuggestions runId={timeline.lastSettledRunId} onPick={setInject} />
          ) : null}
          {timeline.teamSaved ? (
            <TeamSavedCard
              team={timeline.teamSaved}
              groupId={isGroup ? session.id : null}
              onOpenGroup={(gid) => onOpenSession?.(gid)}
            />
          ) : null}
        </div>
      </div>

      {/* 消息导航条（WorkBuddy 移动端同款）：右缘细条，格=消息，游标=视口位置。 */}
      {onTimeline ? <MessageRail messages={timeline.messages} scrollRef={scrollRef} /> : null}

      <div className="chat-foot">
        <Composer
          roster={roster}
          composer={composer}
          model={model}
          onModelChange={onModelChange}
          sending={sending}
          onSend={send}
          onStop={onStop}
          transcribe={transcribe}
          onInspect={onInspect}
          injectText={inject}
          placeholder={isGroup ? CHAT.placeholder.group : CHAT.placeholder.dm}
        />
      </div>
    </section>
  );
}
