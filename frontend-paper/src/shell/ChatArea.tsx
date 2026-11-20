/**
 * ChatArea — 第三栏：会话头部 + 消息流 + 输入区。文案见 `content/app.ts` 的 CHAT。
 */
import { useEffect, useRef } from 'react';
import { AvatarStack, AVATAR_SIZE } from '../avatar';
import { MessageList } from '../chat/MessageList';
import { Composer } from '../chat/composer/Composer';
import { CHAT } from '../content/app';
import type { ComposerData, Message, Outbound, RosterMember, Session } from '../data/types';
import { IconMore, IconPanel, IconSparkle, IconUsers } from './icons';

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
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isGroup = session.kind === 'group';

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  return (
    <section className="chat">
      <header className="chat-head">
        <div className="chat-head-main">
          <h1 className="chat-head-title">{session.title}</h1>
          <p className="chat-head-sub">{CHAT.subtitle[session.kind]}</p>
        </div>
        <div className="chat-head-actions">
          {session.members.length > 1 ? (
            <button className="chat-head-members" title={session.members.join('、')}>
              <AvatarStack labels={session.members} max={4} size={AVATAR_SIZE.md} />
              <span>{CHAT.members(session.members.length)}</span>
              <IconUsers size={14} />
            </button>
          ) : null}
          <button className="sf-icon-btn" title={CHAT.more}>
            <IconMore size={16} />
          </button>
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
          {messages.length ? (
            <MessageList messages={messages} packs={composer.knowledge} />
          ) : (
            <div className="chat-empty">
              <span className="chat-empty-ico">
                <IconSparkle size={18} />
              </span>
              <h3>{CHAT.emptyTitle(session.title)}</h3>
              <p>{isGroup ? CHAT.emptyBody.group : CHAT.emptyBody.dm}</p>
              <div className="chat-empty-chips">
                {(isGroup ? CHAT.emptyChips.group : CHAT.emptyChips.other).map((s) => (
                  <button key={s} onClick={() => void onSend({ text: s })}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="chat-foot">
        <Composer
          roster={roster}
          composer={composer}
          model={model}
          onModelChange={onModelChange}
          sending={sending}
          onSend={onSend}
          onStop={onStop}
          transcribe={transcribe}
          onInspect={onInspect}
          placeholder={isGroup ? CHAT.placeholder.group : CHAT.placeholder.dm}
        />
      </div>
    </section>
  );
}
