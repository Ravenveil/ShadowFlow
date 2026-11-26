/**
 * SessionList — 第二栏：会话列表（对齐 merged 的 thread-panel）。
 *
 * 结构：抽屉头 → 董事长置顶卡 → 新建菜单 → 搜索 → 最近对话 → 项目与 Agent 树。
 * 文案见 `content/app.ts` 的 LIST，组件不写死任何中文。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { AgentAvatar, AvatarStack, AVATAR_SIZE } from '@/shared/ui/avatar';
import { LIST } from '@/shared/content/app';
import type { ProjectNode, RosterMember, Session } from '@/shared/data/types';
import {
  IconChat,
  IconChevron,
  IconChevronDown,
  IconClose,
  IconFolder,
  IconMore,
  IconPlus,
  IconSearch,
  IconUsers,
} from '@/shared/ui/icons';
import { GroupChatModal } from '@/app/shell/GroupChatModal';
import { CreateProjectModal } from '@/app/shell/CreateProjectModal';

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
  onCreate,
  createGroupChat,
  useTeamTemplate,
  onCollapse,
  onOpenCeo,
  openAgentDm,
  ceoDmId,
  listProjects,
  onResizeStart,
  createProject,
  renameProject,
  deleteProject,
  createProjectConversation,
  onCreatedConversation,
  onOpenProjectFolder,
  onOpenSession,
}: {
  /** 右缘拖动热区按下回调（会话列表栏可拖宽，对齐 legacy）。 */
  onResizeStart?: (e: React.PointerEvent<HTMLDivElement>) => void;
  createProject?: (name: string, workspacePath?: string) => Promise<ProjectNode>;
  renameProject?: (id: string, name: string) => Promise<void>;
  deleteProject?: (id: string) => Promise<void>;
  createProjectConversation?: (projectId: string, title: string) => Promise<string>;
  onCreatedConversation?: (gid: string) => void;
  /** 请求为分组重绑工作目录：弹原生目录框由 Shell 负责，这里只发分组 id。 */
  onOpenProjectFolder?: (projectId: string) => void;
  /** 点分组里的一条会话：回到对话页打开它。 */
  onOpenSession?: (id: string) => void;
  sessions: Session[];
  roster: RosterMember[];
  activeId: string;
  onSelect: (id: string) => void;
  /** 顶层新建对话：真建一个空群（不是随便挑一条已有的 DM）。 */
  /** 顶层新建对话；title 传空串 = 用默认标题直接建（用户定版：不弹输入框）。 */
  onCreate?: (title: string) => void;
  /** 建完群回调（模态在列表里自持，这里只管「进群 + 刷新」）。 */
  createGroupChat?: (input: { name?: string; agentIds: string[]; teamId?: string }) => Promise<string>;
  useTeamTemplate?: (appId: string) => Promise<string>;
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
  /** 最近对话默认只显示 5 条，展开后看全部。 */
  const [showAll, setShowAll] = useState(false);
  const [recentOpen, setRecentOpen] = useState(true);
  /** 分组菜单：当前打开菜单的分组 id。 */
  const [groupMenu, setGroupMenu] = useState<string | null>(null);
  /** 发起群聊模态（legacy NeoCreateGroupModal 的选人式建群）。 */
  const [groupPickerOpen, setGroupPickerOpen] = useState(false);
  /** 新建任务菜单展开。 */
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  /** 创建本地项目模态（名称 + 本地文件夹）。 */
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  /** 分组表单：null=关闭；{mode} 新建/改名/建对话。 */
  const [groupForm, setGroupForm] = useState<
    | { mode: 'new' }
    | { mode: 'root' }
    | { mode: 'rename' | 'conversation'; id: string; name: string }
    | null
  >(null);
  const [formValue, setFormValue] = useState('');
  const [busy, setBusy] = useState(false);
  /** 置顶分组 id（本地偏好，后端无 pinned 字段）。 */
  const [pinned, setPinned] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('sf.paper.pinnedGroups') || '[]') as string[];
    } catch {
      return [];
    }
  });
  const menuRef = useRef<HTMLDivElement>(null);

  const kw = q.trim().toLowerCase();
  const list = useMemo(
    () => (kw ? sessions.filter((s) => s.title.toLowerCase().includes(kw)) : sessions),
    [sessions, kw],
  );
  /** 搜索时展示全部命中；平时只显示前 N 条，其余靠「查看更多」展开。 */
  const recentList = useMemo(
    () => (kw || showAll ? list : list.slice(0, LIST.recentLimit)),
    [list, kw, showAll],
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

  const persistPinned = (next: string[]) => {
    setPinned(next);
    try {
      localStorage.setItem('sf.paper.pinnedGroups', JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };
  const togglePin = (id: string) =>
    persistPinned(pinned.includes(id) ? pinned.filter((x) => x !== id) : [id, ...pinned]);

  /** 打开分组文件夹：弹原生目录框重绑工作目录（Shell 负责弹框与落库）。 */
  const openFolder = (p: ProjectNode) => {
    setGroupMenu(null);
    onOpenProjectFolder?.(p.id);
  };

  /** 从本地文件夹建分组：打开「创建本地项目」模态（名称 + 文件夹，可只填名称）。 */
  const createFromFolder = () => {
    setNewTaskOpen(false);
    setProjectModalOpen(true);
  };

  const submitGroupForm = async () => {
    const value = formValue.trim();
    if (!value || busy) return;
    setBusy(true);
    try {
      if (groupForm?.mode === 'root') {
        onCreate?.(value);
      } else if (groupForm?.mode === 'new') {
        await createProject?.(value);
      } else if (groupForm?.mode === 'rename') {
        await renameProject?.(groupForm.id, value);
      } else if (groupForm?.mode === 'conversation') {
        const gid = await createProjectConversation?.(groupForm.id, value);
        if (gid) onCreatedConversation?.(gid);
      }
      setGroupForm(null);
      setFormValue('');
    } catch {
      /* 失败就留在表单里 */
    } finally {
      setBusy(false);
    }
  };

  /** 按置顶排序的分组。 */
  const filteredProjects = useMemo(() => {
    const base = kw ? projects.filter((p) => p.name.toLowerCase().includes(kw)) : projects;
    return [...base].sort((a, b) => {
      const pa = pinned.indexOf(a.id);
      const pb = pinned.indexOf(b.id);
      if (pa >= 0 && pb >= 0) return pa - pb;
      if (pa >= 0) return -1;
      if (pb >= 0) return 1;
      return 0;
    });
  }, [projects, kw, pinned]);
  const filteredAgents = useMemo(
    () => (kw ? roster.filter((a) => a.name.toLowerCase().includes(kw)) : roster),
    [roster, kw],
  );

  return (
    <aside className="slist">
      {/* 右缘拖动热区：6px 命中条，pointerdown 上报 Shell 跟随。 */}
      {onResizeStart ? (
        <div
          className="slist-resize-handle"
          onPointerDown={onResizeStart}
          role="separator"
          aria-orientation="vertical"
          aria-label={LIST.resizeLabel}
        />
      ) : null}
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
        <AgentAvatar label={CEO_AGENT_ID} size="lg" />
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
                // 用户定版（2026-11-25）：点「新建对话」直接建，不再弹命名输入框。
                onCreate?.('');
              }}
            >
              <IconChat size={14} />
              <span>{LIST.newConversation}</span>
            </button>
            {createGroupChat && useTeamTemplate ? (
              <button
                type="button"
                className="slist-new-item"
                role="menuitem"
                onClick={() => {
                  setNewOpen(false);
                  setGroupPickerOpen(true);
                }}
              >
                <IconUsers size={14} />
                <span>{LIST.newGroup}</span>
              </button>
            ) : null}
            <button
              type="button"
              className="slist-new-item"
              role="menuitem"
              onClick={() => {
                setNewOpen(false);
                setNewTaskOpen(true);
                setGroupForm(null);
              }}
            >
              <IconFolder size={14} />
              <span>{LIST.groupNew}</span>
            </button>
          </div>
        )}
      </div>

      {/* 顶层新建：先起个名字，再让后端真的建一个空群 */}
      {groupForm?.mode === 'root' ? (
        <div className="slist-group-form">
          <input
            className="slist-input"
            value={formValue}
            autoFocus
            onChange={(e) => setFormValue(e.target.value)}
            placeholder={LIST.newConversation}
            onKeyDown={(e) => { if (e.key === 'Enter') void submitGroupForm(); }}
          />
          <div className="slist-group-form-actions">
            <button type="button" onClick={() => setGroupForm(null)}>{LIST.cancel}</button>
            <button
              type="button"
              data-primary="true"
              disabled={busy || !formValue.trim()}
              onClick={() => void submitGroupForm()}
            >
              {LIST.create}
            </button>
          </div>
        </div>
      ) : null}

      {/* 发起群聊（选人式模态，搬 legacy NeoCreateGroupModal 主链路） */}
      {groupPickerOpen && createGroupChat && useTeamTemplate ? (
        <GroupChatModal
          onClose={() => setGroupPickerOpen(false)}
          onCreated={(gid) => {
            setGroupPickerOpen(false);
            onCreatedConversation?.(gid);
          }}
          createGroupChat={createGroupChat}
          useTeamTemplate={useTeamTemplate}
        />
      ) : null}

      {/* 创建本地项目：名称 + 本地文件夹（对齐 legacy 的项目建法） */}
      {projectModalOpen ? (
        <CreateProjectModal
          onClose={() => setProjectModalOpen(false)}
          onCreate={async (name, dir) => {
            const created = await createProject?.(name, dir);
            // 本地立刻补一次列表：reload 是异步的，别让用户对着旧侧栏等。
            const next = await listProjects().catch(() => []);
            setProjects(next);
            if (created) setExpanded((all) => ({ ...all, [created.id]: true }));
          }}
        />
      ) : null}

      {/* 搜索 */}
      <label className="slist-search">
        <IconSearch size={13} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={LIST.searchPlaceholder} />
        <kbd>{LIST.searchKey}</kbd>
      </label>

      {/* 最近对话 */}
      <div className="slist-body">
        <div className="slist-group-head">
          <button
            type="button"
            className="slist-group-collapse"
            onClick={() => setRecentOpen((v) => !v)}
            aria-expanded={recentOpen}
          >
            <IconChevronDown size={12} className={recentOpen ? 'is-open' : ''} />
            <span>{LIST.recentTitle}</span>
          </button>
          <button
            type="button"
            className="slist-group-more"
            title={LIST.recentMore}
            aria-label={LIST.recentMore}
            onClick={() => setShowAll((v) => !v)}
          >
            <IconMore size={14} />
          </button>
        </div>
        {recentOpen ? <div className="slist-group">
          {recentList.map((s) => (
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
                  <AgentAvatar label={s.members[0] ?? s.title} size={AVATAR_SIZE.list} status={false} />
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
          {!kw && list.length > LIST.recentLimit ? (
            <button type="button" className="slist-more" onClick={() => setShowAll((v) => !v)}>
              <IconChevronDown size={12} className={showAll ? 'is-open' : ''} />
              {showAll ? LIST.viewLess : `${LIST.viewMore} (${list.length - LIST.recentLimit})`}
            </button>
          ) : null}
        </div> : null}

        {/* 分组（项目管理，对齐参考设计） */}
        <div className="slist-group-head">
          <span className="slist-group-title">{LIST.projectsTitle}</span>
          <button
            type="button"
            className="slist-group-more"
            onClick={() => {
              // 用户定版（2026-11-25）：建项目和建对话一样一键直建，不弹菜单不填名。
              void createProject?.(LIST.untitledProject);
            }}
          >
            <IconPlus size={14} />
          </button>
        </div>

        {/* 新建任务菜单：两条路——空分组 / 从本地文件夹 */}
        {newTaskOpen ? (
          <div className="slist-task-menu" role="menu">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setNewTaskOpen(false);
                setFormValue('');
                setGroupForm({ mode: 'new' });
              }}
            >
              <IconPlus size={14} />
              <span>{LIST.groupNew}</span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => void createFromFolder()}
            >
              <IconFolder size={14} />
              <span>{LIST.groupFromFolder}</span>
            </button>
          </div>
        ) : null}

        {/* 分组表单：新建 / 改名 / 建对话（顶层新建在按钮下面，不在这里） */}
        {groupForm && groupForm.mode !== 'root' ? (
          <div className="slist-group-form">
            <input
              className="slist-input"
              value={formValue}
              autoFocus
              onChange={(e) => setFormValue(e.target.value)}
              placeholder={
                groupForm.mode === 'new'
                  ? LIST.groupNewName
                  : groupForm.mode === 'conversation'
                    ? LIST.groupNewConversationName
                    : LIST.groupEditName
              }
              onKeyDown={(e) => { if (e.key === 'Enter') void submitGroupForm(); }}
            />
            <div className="slist-group-form-actions">
              <button type="button" onClick={() => setGroupForm(null)}>{LIST.cancel}</button>
              <button type="button" data-primary="true" disabled={busy || !formValue.trim()} onClick={() => void submitGroupForm()}>
                {groupForm.mode === 'conversation' ? LIST.create : LIST.groupCreate}
              </button>
            </div>
          </div>
        ) : null}

        <div className="slist-group slist-tree">
          {filteredProjects.length === 0 && filteredAgents.length === 0 ? (
            <div className="slist-empty">{LIST.noProjects}</div>
          ) : (
            <>
              {filteredProjects.map((p) => {
                const open = !!expanded[p.id];
                const isPinned = pinned.includes(p.id);
                return (
                  <div key={p.id} className="slist-tree-item" data-pinned={isPinned ? 'true' : undefined}>
                    <div className="slist-tree-row-wrap">
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
                      <button
                        type="button"
                        className="slist-tree-more"
                        aria-label={LIST.groupMenu}
                        onClick={() => setGroupMenu((g) => (g === p.id ? null : p.id))}
                      >
                        <IconMore size={14} />
                      </button>
                      {groupMenu === p.id ? (
                        <div className="slist-group-menu" role="menu">
                          <button type="button" role="menuitem" onClick={() => { togglePin(p.id); setGroupMenu(null); }}>
                            {isPinned ? LIST.groupUnpin : LIST.groupPin}
                          </button>
                          <button type="button" role="menuitem" onClick={() => openFolder(p)}>
                            {LIST.groupOpenFolder}
                          </button>
                          <button type="button" role="menuitem" onClick={() => {
                            setGroupMenu(null); setFormValue(p.name);
                            setGroupForm({ mode: 'rename', id: p.id, name: p.name });
                          }}>
                            {LIST.groupEdit}
                          </button>
                          <button type="button" role="menuitem" onClick={() => {
                            setGroupMenu(null); setFormValue('');
                            setGroupForm({ mode: 'conversation', id: p.id, name: p.name });
                          }}>
                            {LIST.groupNewConversation}
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            className="is-danger"
                            onClick={() => {
                              setGroupMenu(null);
                              if (window.confirm(LIST.groupRemoveConfirm(p.name))) {
                                void deleteProject?.(p.id);
                              }
                            }}
                          >
                            {LIST.groupRemove}
                          </button>
                        </div>
                      ) : null}
                    </div>
                    {open &&
                      (p.sessions.length === 0 ? (
                        <div className="slist-tree-empty">{LIST.noConversations}</div>
                      ) : (
                        p.sessions.map((s) => (
                          <button
                            type="button"
                            className="slist-tree-sess"
                            key={s.id}
                            disabled={!onOpenSession}
                            onClick={() => onOpenSession?.(s.id)}
                          >
                            <span />
                            <p>
                              {s.title || s.id}
                              {s.status ? ` · ${s.status}` : ''}
                            </p>
                          </button>
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
                    <small>{a.role || a.note || LIST.agentFallbackRole}</small>
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
