import { useState } from 'react';
import { AvatarStack } from '../avatar';
import type { Session } from '../data/types';
import { IconPlus, IconSearch } from './icons';

const KIND_LABEL: Record<Session['kind'], string> = {
  dm: '单聊',
  group: '群聊',
  project: '项目',
};

/** 第二栏：会话列表（对应设计稿 List）。 */
export function SessionList({
  sessions,
  activeId,
  onSelect,
  onNew,
  onCollapse,
  currentAgent,
}: {
  sessions: Session[];
  activeId: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onCollapse: () => void;
  currentAgent: string;
}) {
  const [q, setQ] = useState('');
  const kw = q.trim();
  const list = kw ? sessions.filter((s) => s.title.includes(kw)) : sessions;

  return (
    <aside className="slist">
      <div className="slist-head">
        <button className="slist-back" onClick={onCollapse} title="收起列表">
          ←
        </button>
        <span className="slist-head-title">{currentAgent}</span>
        <button className="sf-icon-btn" onClick={onCollapse} title="收起">
          ✕
        </button>
      </div>

      <div className="slist-tools">
        <button className="slist-new" onClick={onNew}>
          <IconPlus size={14} />
          新建
        </button>
        <label className="slist-search">
          <IconSearch size={13} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索对话、项目或 Agent"
          />
          <kbd>⌘K</kbd>
        </label>
      </div>

      <div className="slist-body">
        <div className="slist-group">
          {list.map((s) => (
            <button
              key={s.id}
              className="slist-card"
              data-active={s.id === activeId ? 'true' : undefined}
              onClick={() => onSelect(s.id)}
            >
              <span className="slist-card-top">
                {s.members.length > 1 ? (
                  <AvatarStack labels={s.members} max={2} size={22} showRest={false} />
                ) : (
                  <span className="slist-card-dot" />
                )}
                <span className="slist-card-title">{s.title}</span>
                {s.status === 'active' ? <i className="slist-card-live" /> : null}
              </span>
              <span className="slist-card-meta">
                <span>
                  {s.members.length > 1 ? `${s.members.length} 位成员` : KIND_LABEL[s.kind]}
                </span>
                <span className="slist-card-time">{s.updatedAt}</span>
                {s.unread ? <i className="slist-card-unread">{s.unread}</i> : null}
              </span>
            </button>
          ))}
          {list.length === 0 ? <div className="slist-empty">没有匹配的会话</div> : null}
        </div>

        <div className="slist-group">
          <div className="slist-group-title">项目与 AGENT</div>
          {['实验设计与消融', '图表与配图', '投稿材料'].map((p) => (
            <button key={p} className="slist-plain">
              <span className="slist-plain-mark">▸</span>
              {p}
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}
