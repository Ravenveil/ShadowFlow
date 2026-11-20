import { useEffect, useRef, useState } from 'react';
import { AvatarStack } from '../avatar';
import { MessageList } from '../chat/MessageList';
import { Composer } from '../chat/Composer';
import type { Message, Session } from '../data/types';
import { IconMore, IconPanel, IconSparkle, IconUsers } from './icons';

const SUBTITLE: Record<Session['kind'], string> = {
  dm: '接需求、拆任务、派活、汇总产出',
  group: '群聊 · 主控调度，角色可各自发言',
  project: '项目会话 · 主控牵头推进',
};

export function ChatArea({
  session,
  messages,
  onSend,
  panelOpen,
  onTogglePanel,
}: {
  session: Session;
  messages: Message[];
  onSend: (text: string) => void;
  panelOpen: boolean;
  onTogglePanel: () => void;
}) {
  const [model, setModel] = useState('Claude Sonnet 4.6');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  return (
    <section className="chat">
      <header className="chat-head">
        <div className="chat-head-main">
          <h1 className="chat-head-title">{session.title}</h1>
          <p className="chat-head-sub">{SUBTITLE[session.kind]}</p>
        </div>
        <div className="chat-head-actions">
          {session.members.length > 1 ? (
            <button className="chat-head-members" title={session.members.join('、')}>
              <AvatarStack labels={session.members} max={4} size={20} />
              <span>{session.members.length} 位</span>
              <IconUsers size={14} />
            </button>
          ) : null}
          <button className="sf-icon-btn" title="更多">
            <IconMore size={16} />
          </button>
          <button
            className="sf-icon-btn"
            title={panelOpen ? '收起面板' : '展开面板'}
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
            <MessageList messages={messages} />
          ) : (
            <div className="chat-empty">
              <span className="chat-empty-ico">
                <IconSparkle size={18} />
              </span>
              <h3>与 {session.title} 开始对话</h3>
              <p>
                {session.kind === 'group'
                  ? '在群里发消息，主控会接住需求并拆给对应角色；也可以 @ 某位角色直接提问。'
                  : '发消息，TA 就开始干活。试试 @ 提及角色，或用 / 调起命令。'}
              </p>
              <div className="chat-empty-chips">
                {(session.kind === 'group'
                  ? ['把组会稿整理成投稿稿', '核对第 3 节引用', '生成章节骨架']
                  : ['列个提纲', '看看当前进度', '复盘上周产出']
                ).map((s) => (
                  <button key={s} onClick={() => onSend(s)}>
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
          onSend={onSend}
          model={model}
          onModelChange={setModel}
          placeholder={
            session.kind === 'group'
              ? '在群里发消息，主控会接住并派给角色 · @ 可直接点某位角色'
              : '发消息，TA 就开始干活 · 试试 @ 提及角色 或 / 命令'
          }
        />
      </div>
    </section>
  );
}
