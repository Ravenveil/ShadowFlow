/**
 * SessionList — 第二栏：会话列表。文案见 `content/app.ts` 的 LIST。
 */
import { useState } from 'react';
import { AgentAvatar, AvatarStack, AVATAR_SIZE } from '../avatar';
import { LIST } from '../content/app';
import type { Session } from '../data/types';
import { IconPlus, IconSearch } from './icons';

/** 「几条成员 / 会话类型」的副标题文案：多人看人数，单人看类型。 */
function metaOf(s: Session): string {
  return s.members.length > 1 ? LIST.memberCount(s.members.length) : LIST.kindLabel[s.kind];
}

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
        <button className="slist-back" onClick={onCollapse} title={LIST.collapse}>
          ←
        </button>
        <AgentAvatar label={currentAgent} size={AVATAR_SIZE.base} status={false} />
        <span className="slist-head-title">{currentAgent}</span>
        <button className="sf-icon-btn" onClick={onCollapse} title={LIST.close}>
          ✕
        </button>
      </div>

      <div className="slist-tools">
        <button className="slist-new" onClick={onNew}>
          <IconPlus size={14} />
          {LIST.create}
        </button>
        <label className="slist-search">
          <IconSearch size={13} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={LIST.searchPlaceholder} />
          <kbd>{LIST.searchKey}</kbd>
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
                  <AvatarStack labels={s.members} max={2} size={AVATAR_SIZE.list} showRest={false} />
                ) : (
                  <span className="slist-card-dot" />
                )}
                <span className="slist-card-title">{s.title}</span>
                {s.status === 'active' ? <i className="slist-card-live" /> : null}
              </span>
              <span className="slist-card-meta">
                <span>{metaOf(s)}</span>
                <span className="slist-card-time">{s.updatedAt}</span>
                {s.unread ? <i className="slist-card-unread">{s.unread}</i> : null}
              </span>
            </button>
          ))}
          {list.length === 0 ? <div className="slist-empty">{LIST.empty}</div> : null}
        </div>

        <div className="slist-group">
          <div className="slist-group-title">{LIST.groupTitle}</div>
          {LIST.shortcuts.map((p) => (
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
