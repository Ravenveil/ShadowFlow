/**
 * SessionList — 第二栏：会话列表（对齐 merged 的 thread-panel）。
 *
 * 结构：抽屉头 → 董事长置顶卡 → 新建菜单 → 搜索 → 最近对话 → 项目与 Agent 树。
 * 文案见 `content/app.ts` 的 LIST，组件不写死任何中文。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { AgentAvatar, AvatarStack, AVATAR_SIZE } from '../avatar';
import { LIST } from '../content/app';
import type { ProjectNode, RosterMember, Session } from '../data/types';
import {
  IconChat,
  IconChevron,
  IconChevronDown,
  IconClose,
  IconFolder,
  IconPlus,
  IconSearch,
} from './icons';

/** 主控（董事长）对应的 agent id，与后端 resolveDm 的候选一致。 */
const CEO_AGENT_ID = 'agent-shadow-secretary';

/** 「几条成员 / 会话类型」的副标题文案：多人看人数，单人看类型。 */
function metaOf(s: Session): string {
  return s.members.length > 1 ? LIST.memberCount(s.members.length) : LIST.kindLabel[s.kind];
}

/** 相对时间：今天→时分、昨天/周几→相对、更早→月/日。 */
function fmtTime(iso: string): string {
  const t = Date.parse(iso);
  if (!t) return '';
  const d = new Date(t);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const diffDays = Math.floor((now.getTime() - t) / 86400000);
  if (diffDays === 1) return LIST.yesterday;
  if (diffDays < 7) return LIST.weekdays[d.getDay()];
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

export function SessionList({
  sessions,
  roster,
  activeId,
  onSelect,
  onNew,
  onCollapse,
  onOpenCeo,
  openAgentDm,
  ceoDmId,
  listProjects,
}: {
  sessions: Session[];
  roster: RosterMember[];
  activeId: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onCollapse: () => void;
  onOpenCeo: () => void;
  /** 解析并打开 agent 单聊（返回会话 id）；比裸 resolveDm 多做聚焦与刷新。 */
  openAgentDm: (agentId: string) => Promise<string>;
  /** 董事长单聊解析出来的会话 id；空表示还没打开过。 */
  ceoDmId?: string;
  listProjects: () => Promise<ProjectNode[]>;
}) {
  const [q, setQ] = useState('');
  const [newOpen, setNewOpen] = useState(false);
  const [projects, setProjects] = useState<ProjectNode[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const menuRef = useRef<HTMLDivElement>(null);

  const kw = q.trim().toLowerCase();
  const list = useMemo(
    () => (kw ? sessions.filter((s) => s.title.toLowerCase().includes(kw)) : sessions),
    [sessions, kw],
  );

  // 项目树：真后端拉一次；拉不到就保持空（分组里显示占位文案）
  useEffect(() => {
    let alive = true;
    listProjects()
      .then((p) => alive && setProjects(p))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [listProjects]);

  // 点外部收起新建菜单
  useEffect(() => {
    if (!newOpen) return;
    function onDoc(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setNewOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [newOpen]);

  const filteredProjects = useMemo(
    () => (kw ? projects.filter((p) => p.name.toLowerCase().includes(kw)) : projects),
    [projects, kw],
  );
  const filteredAgents = useMemo(
    () => (kw ? roster.filter((a) => a.name.toLowerCase().includes(kw)) : roster),
    [roster, kw],
  );

  return (
    <aside className="slist">
      {/* 抽屉头 */}
      <div className="slist-head">
        <div className="slist-head-main">
          <span className="slist-head-ico">
            <IconChat size={14} />
          </span>
          <div>
            <strong>{LIST.drawerTitle}</strong>
            <small>{LIST.drawerSubtitle}</small>
          </div>
        </div>
        <button className="sf-icon-btn" onClick={onCollapse} title={LIST.close}>
          <IconClose size={15} />
        </button>
      </div>

      {/* 董事长置顶卡 */}
      <button
        className="slist-ceo"
        data-active={activeId === (ceoDmId || CEO_AGENT_ID) ? 'true' : undefined}
        onClick={onOpenCeo}
      >
        <AgentAvatar label={LIST.ceoAvatarLabel} size="lg" />
        <div>
          <strong>{LIST.ceoTitle}</strong>
          <small>{LIST.ceoSubtitle}</small>
        </div>
        <i className="slist-ceo-dot" />
      </button>

      {/* 新建菜单 */}
      <div className="slist-new-wrap" ref={menuRef}>
        <button className="slist-new" onClick={() => setNewOpen((v) => !v)} aria-expanded={newOpen}>
          <IconPlus size={13} />
          <span>{LIST.create}</span>
          <IconChevronDown size={12} className="slist-new-caret" />
        </button>
        {newOpen && (
          <div className="slist-new-menu" role="menu">
            <button
              type="button"
              className="slist-new-item"
              role="menuitem"
              onClick={() => {
                setNewOpen(false);
                onNew();
              }}
            >
              <IconChat size={14} />
              <span>{LIST.newConversation}</span>
            </button>
          </div>
        )}
      </div>

      {/* 搜索 */}
      <label className="slist-search">
        <IconSearch size={13} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={LIST.searchPlaceholder} />
        <kbd>{LIST.searchKey}</kbd>
      </label>

      {/* 最近对话 */}
      <div className="slist-body">
        <div className="slist-group-title">{LIST.recentTitle}</div>
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
                <span className="slist-card-time">{fmtTime(s.updatedAt)}</span>
                {s.unread ? <i className="slist-card-unread">{s.unread}</i> : null}
              </span>
            </button>
          ))}
          {list.length === 0 ? <div className="slist-empty">{kw ? LIST.noMatches : LIST.noConversations}</div> : null}
        </div>

        {/* 项目与 Agent 树 */}
        <div className="slist-group-title">{LIST.projectsTitle}</div>
        <div className="slist-group slist-tree">
          {projects.length === 0 && roster.length === 0 ? (
            <div className="slist-empty">{LIST.noProjects}</div>
          ) : (
            <>
              {filteredProjects.map((p) => {
                const open = !!expanded[p.id];
                return (
                  <div key={p.id} className="slist-tree-item">
                    <button
                      className="slist-tree-row"
                      onClick={() => setExpanded((all) => ({ ...all, [p.id]: !open }))}
                      aria-expanded={open}
                    >
                      <IconChevron size={12} className={open ? 'is-open' : ''} />
                      <IconFolder size={13} />
                      <span>{p.name}</span>
                      {p.sessions.length > 0 ? <em className="slist-tree-count">{p.sessions.length}</em> : null}
                    </button>
                    {open &&
                      (p.sessions.length === 0 ? (
                        <div className="slist-tree-empty">{LIST.noConversations}</div>
                      ) : (
                        p.sessions.map((s) => (
                          <div className="slist-tree-sess" key={s.id}>
                            <span />
                            <p>
                              {s.title || s.id}
                              {s.status ? ` · ${s.status}` : ''}
                            </p>
                          </div>
                        ))
                      ))}
                  </div>
                );
              })}
              {filteredAgents.map((a) => (
                <button
                  className="slist-tree-row slist-agent-row"
                  key={a.id}
                  onClick={() => void openAgentDm(a.id)}
                  title={LIST.openAgentDmTitle}
                >
                  <AgentAvatar label={a.name} size="sm" />
                  <span>
                    <strong>{a.name}</strong>
                    <small>{a.role || a.note || 'Agent'}</small>
                  </span>
                  <i className={a.state === 'busy' ? 'is-working' : ''} />
                </button>
              ))}
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
