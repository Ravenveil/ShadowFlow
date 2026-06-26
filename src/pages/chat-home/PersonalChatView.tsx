import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const PAGE_SIZE = 12;
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { Check, ChevronDown, Download, MoreHorizontal, Pencil, Plus, Search, Square, SquarePen, Trash2, X } from 'lucide-react';
import { UnifiedComposer } from '../../components/composer/UnifiedComposer';
import { NewTaskComposer } from './NewTaskComposer';
import { HfAvatar } from '../../components/hifi';
import { listAgents, type AgentRecord } from '../../api/agents';
import { resolveDmConversation, createFreshDmConversation, patchGroup, deleteGroup } from '../../api/groupApi';
import type { AgentDMItem } from '../../common/types/inbox';
import { useChatStream } from '../../core/hooks/useChatStream';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useInboxStore } from '../../core/store/useInboxStore';
import { paletteForAgent, initialOf } from '../../components/chat-fb/agentAvatar';
// 对话框统一（chat-unify）：个人单聊也用 StudioMessageRow 的统一回合气泡。
import { UnifiedChatFeed, timelineMessagesToStudio } from '../../components/workbench/UnifiedChatFeed';
import { PersonalRightPane } from './PersonalRightPane';
import { PersonalRunRightPane } from './PersonalRunRightPane';
import { useSidebarSlotEl } from './SidebarSlotContext';
import { PagePeekOverlay } from './PagePeekOverlay';
import { relTime } from '../../core/utils/relTime';

/**
 * PersonalChatView — 个人态(Cherry Studio 式三栏,融合M1):
 *   左:助手列表 + 「+ 新员工」(一边聊天一边创建员工)
 *   中:真实 DM 单聊(resolveDmConversation → useChatStream group 模式走网关)
 *      渲染用 run 的 Timeline(自然融合:过程事件 M2 点亮)
 *   右:PersonalRightPane(run 式标签:员工/任务/Brief,可收起)
 */
export function PersonalChatView() {
  const workspaceId = useWorkspaceStore((s) => s.currentId);
  // 统一侧栏(路B)：拿 HfLayout 那条常驻 ChatRail 的列表槽，portal 注入助手列表。
  const slotEl = useSidebarSlotEl();
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [q, setQ] = useState('');
  // 选中助手接入 URL(?agent=<id>)——刷新/分享/后退可恢复(治"路由跳转没做好")。
  const [searchParams, setSearchParams] = useSearchParams();
  const agentId = searchParams.get('agent');
  const selectAgent = (id: string | null) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('view', 'personal');
      if (id) next.set('agent', id); else next.delete('agent');
      return next;
    });
  };
  // ?new=1 → 强制 NewTaskComposer 重挂（清空旧 sessionId）并清除 agent 选中
  const [newTaskKey, setNewTaskKey] = useState(0);
  useEffect(() => {
    if (searchParams.get('new') !== '1') return;
    setNewTaskKey((k) => k + 1);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('new');
      next.delete('agent');
      return next;
    }, { replace: true });
  }, [searchParams, setSearchParams]);
  const [dmGroupId, setDmGroupId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  // 角色弹出信号 — 点 DM 头部递增，右栏据此弹出「角色」tab（对齐用户要求：放右边不是左抽屉）
  const [roleSignal, setRoleSignal] = useState(0);
  // start 态活跃 run（NewTaskComposer 回调）——右栏据此换 run-session 标签页
  const [personalRunId, setPersonalRunId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    // 仅加载当前工作区 agent 列表（不在此清 URL 的 ?agent=，workspace store 异步
    // hydrate 会误触；改由下方 dmGroupId effect 校验 agent 是否在列表里）。
    void listAgents(workspaceId ?? undefined)
      .then((rows) => { if (alive) setAgents(rows); })
      .catch(() => { if (alive) setAgents([]); });
    return () => { alive = false; };
  }, [workspaceId]);

  // 会话记录（U3）— 拉收件箱拿最近单聊会话，渲染成左栏「会话记录」段。
  // Python 没起时为空（503 → store error），降级为空态，不报 JS 错。
  const agentDMs = useInboxStore((s) => s.agentDMs);
  useEffect(() => {
    void useInboxStore.getState().fetchWorkspaceInbox(workspaceId ?? null);
  }, [workspaceId]);
  // 分页：默认展示 PAGE_SIZE 条，每次「更多」追加 PAGE_SIZE 条。
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  // 重置分页当工作区切换
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [workspaceId]);

  // 按最近活动倒序排好的全量列表（不裁剪）。
  const sortedDMs = useMemo(
    () => [...agentDMs].sort((a, b) => Date.parse(b.lastActivityAt ?? '') - Date.parse(a.lastActivityAt ?? '')),
    [agentDMs],
  );
  // 当前窗口可见的那一页。
  const recentDMs = useMemo(() => sortedDMs.slice(0, visibleCount), [sortedDMs, visibleCount]);
  const hasMore = sortedDMs.length > visibleCount;

  // IntersectionObserver：当最后一行进入滚动容器时自动加载下一批。
  const lastDmRowRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const isFiringRef = useRef(false);
  const loadMore = useCallback(() => setVisibleCount((n) => n + PAGE_SIZE), []);
  useEffect(() => {
    const el = lastDmRowRef.current;
    if (!el || !hasMore) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        // Guard: disconnect immediately before state update to prevent double-fire
        // within the same observer cycle (before React re-renders and cleans up).
        if (isFiringRef.current) return;
        isFiringRef.current = true;
        obs.disconnect();
        loadMore();
        setTimeout(() => { isFiringRef.current = false; }, 200);
      },
      { root: listRef.current, threshold: 0.1 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, loadMore, recentDMs.length]); // re-attach when the last row changes

  // 选中助手 → 解析其 dm conversation(kind='dm')。守卫:agent 必须在当前工作区
  // 列表里才解析——挡住"切区后旧 ?agent= 触发跨区 find-or-create DM 落库"。
  const agentInWs = !!agentId && agents.some((a) => a.agent_id === agentId);
  useEffect(() => {
    if (!agentId || !agentInWs) { setDmGroupId(null); return; }
    let alive = true;
    setDmGroupId(null);
    void resolveDmConversation(agentId, workspaceId ?? undefined)
      .then((gid) => { if (alive) setDmGroupId(gid); })
      .catch(() => { if (alive) setDmGroupId(null); });
    return () => { alive = false; };
  }, [agentId, agentInWs, workspaceId]);

  const filtered = useMemo(
    () => agents.filter((a) => a.name.toLowerCase().includes(q.trim().toLowerCase())),
    [agents, q],
  );
  const selected = agents.find((a) => a.agent_id === agentId) ?? null;
  // 单聊 header 用：人设首行 + 当前模型标签（BYOK localStorage，响应式）
  const personaLine = (selected?.soul ?? '').split('\n').map((s) => s.trim()).find(Boolean) ?? '';
  const [modelLabel, setModelLabel] = useState<string>(() => {
    try { return localStorage.getItem('sf.model') || 'Auto'; } catch { return 'Auto'; }
  });
  useEffect(() => {
    // Cross-tab: storage event only fires for OTHER tabs — guard storageArea.
    function onStorage(e: StorageEvent) {
      if (e.key === 'sf.model' && e.storageArea === window.localStorage) {
        setModelLabel(e.newValue || 'Auto');
      }
    }
    // Same-tab: custom event dispatched by every localStorage.setItem('sf.model', …) call.
    function onModelChanged() {
      try { setModelLabel(localStorage.getItem('sf.model') || 'Auto'); } catch { /* ignore */ }
    }
    window.addEventListener('storage', onStorage);
    window.addEventListener('sf-model-changed', onModelChanged);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('sf-model-changed', onModelChanged);
    };
  }, []);

  const { messages, send, cancel, streaming, error, pendingCount } = useChatStream({
    mode: 'group',
    targetId: dmGroupId,
    sseChannel: 'group',
  });
  // 对话框统一：把 ChatMessage[] 映射成统一回合气泡（StudioMessageRow）。
  const studioMessages = useMemo(
    () => timelineMessagesToStudio(
      messages
        .filter((m) => (m.content ?? '').trim().length > 0)
        .map((m, i) => {
          if (m.role === 'user') return { id: m.id, kind: 'user_turn' as const, turn_id: m.id, ts: i, text: m.content };
          if (m.role === 'system') return { id: m.id, kind: 'raw' as const, turn_id: m.id, ts: i, body: m.content, source: 'chat-gateway' };
          return { id: m.id, kind: 'assistant_text' as const, turn_id: m.id, ts: i, body: m.content, streaming: m.streaming };
        }),
    ),
    [messages],
  );

  // Fix #1: memoize content strings to prevent O(n) re-renders on every SSE streaming tick.
  const messageTexts = useMemo(() => messages.map((m) => m.content), [messages]);

  // 「新对话」—— 强制创建全新 DM conversation，保留历史，从空白开始。
  // Fix: isCreating guard prevents double-click race condition (two concurrent
  // createFreshDmConversation calls each resolving to different group IDs).
  // prevId restore ensures we never get stuck in '连接中…' on API error.
  async function handleNewChat() {
    if (!agentId || !agentInWs || isCreating) return;
    const prevId = dmGroupId;
    setIsCreating(true);
    setDmGroupId(null);
    try {
      const newId = await createFreshDmConversation(agentId, workspaceId);
      if (newId) setDmGroupId(newId);
      else setDmGroupId(prevId); // restore previous group on API error / Python down
    } finally {
      setIsCreating(false);
    }
  }

  // F1 — DM 也用完整 composer。dmGroupId 未就绪时（resolveDmConversation 仍在
  // 飞行），send() 会把消息暂存到 pendingQueueRef；targetId 就绪后 drain effect
  // 自动补发。不再提前 return —— 那样会静默丢弃消息且注释与行为矛盾。
  async function handleDmSubmit(p: { text: string }) {
    const t = p.text.trim();
    if (!t) return;
    await send(t);
  }

  // Export modal state
  const [showExport, setShowExport] = useState(false);

  // Fix: compute exportable messages (exclude system + any in-flight streaming messages)
  const exportableMessages = useMemo(
    () => messages.filter((m) => m.role !== 'system' && !m.streaming),
    [messages],
  );

  // Fix: Escape key closes export modal (consistent with other modals in codebase)
  useEffect(() => {
    if (!showExport) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setShowExport(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [showExport]);

  function handleExport(fmt: 'markdown' | 'plain') {
    const agentName = selected?.name ?? 'Agent';
    // Fix: sanitize agent name to prevent malformed filenames
    const safeAgentName = agentName.replace(/[/\\:*?"<>|]/g, '-');
    const nonSystem = exportableMessages;
    let content: string;
    if (fmt === 'markdown') {
      content = nonSystem.map((m) => {
        const label = m.role === 'user' ? '**我:**' : `**${agentName}:**`;
        return `${label}\n\n${m.content}`;
      }).join('\n\n---\n\n');
    } else {
      content = nonSystem.map((m) => {
        const label = m.role === 'user' ? '我:' : `${agentName}:`;
        return `${label}\n${m.content}`;
      }).join('\n\n');
    }
    const ext = fmt === 'markdown' ? 'md' : 'txt';
    const filename = `chat-${safeAgentName}-${new Date().toISOString().slice(0, 10)}.${ext}`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    setShowExport(false);
  }

  // DM 侧栏行上下文菜单（重命名 / 删除）。
  const [menuAgentId, setMenuAgentId] = useState<string | null>(null);
  const [menuGroupId, setMenuGroupId] = useState<string | null>(null);
  // true while resolveDmConversation is in-flight for the menu item
  const [menuGroupIdLoading, setMenuGroupIdLoading] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  // 二步确认删除：点第一次变成 'confirm' 态，再点才真删
  const [deleteConfirmAgentId, setDeleteConfirmAgentId] = useState<string | null>(null);
  // 弹出菜单的 DOM 容器 ref — 用于点外自动关闭
  const menuRef = useRef<HTMLDivElement | null>(null);

  // 点页面其他区域关闭菜单（stopPropagation 在 "..." 按钮里处理）。
  useEffect(() => {
    if (!menuAgentId) return;
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && menuRef.current.contains(e.target as Node)) return;
      setMenuAgentId(null);
      setMenuGroupId(null);
      setMenuGroupIdLoading(false);
      setDeleteConfirmAgentId(null);
    }
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [menuAgentId]);

  async function handleOpenDmMenu(d: AgentDMItem, e: React.MouseEvent) {
    e.stopPropagation();
    if (menuAgentId === d.agentId) {
      setMenuAgentId(null);
      setMenuGroupId(null);
      setMenuGroupIdLoading(false);
      setDeleteConfirmAgentId(null);
      return;
    }
    setMenuAgentId(d.agentId);
    setMenuGroupId(null);
    setDeleteConfirmAgentId(null);
    // 优先复用已解析的 dmGroupId（当前选中的 agent）；否则按需解析。
    let gid: string | null = d.agentId === agentId ? (dmGroupId ?? null) : null;
    if (!gid) {
      setMenuGroupIdLoading(true);
      gid = await resolveDmConversation(d.agentId, workspaceId ?? undefined).catch(() => null);
      setMenuGroupIdLoading(false);
    }
    setMenuGroupId(gid);
  }

  async function handleDmRename(d: AgentDMItem) {
    const newName = renameValue.trim();
    if (!newName) { setRenaming(null); return; }
    const prev = d.agentName;
    // 乐观更新侧栏显示名
    useInboxStore.getState().renameAgentDM(d.agentId, newName);
    setRenaming(null);
    setMenuAgentId(null);
    if (menuGroupId) {
      try {
        await patchGroup(menuGroupId, { name: newName });
      } catch {
        // 后端失败 → 回滚
        useInboxStore.getState().renameAgentDM(d.agentId, prev);
      }
    }
  }

  async function handleDmDelete(d: AgentDMItem) {
    // 第一次点击进入「确认」态，第二次才真删（inline 二步确认，替代 window.confirm）。
    if (deleteConfirmAgentId !== d.agentId) {
      setDeleteConfirmAgentId(d.agentId);
      return;
    }
    setDeleteConfirmAgentId(null);
    useInboxStore.getState().removeAgentDM(d.agentId);
    setMenuAgentId(null);
    if (agentId === d.agentId) selectAgent(null);
    if (menuGroupId) {
      try {
        await deleteGroup(menuGroupId);
      } catch {
        // 后端失败 → 重拉恢复列表
        void useInboxStore.getState().fetchWorkspaceInbox(workspaceId ?? null);
      }
    }
  }

  // 「新员工」= 弹出原 /agents 页面（PagePeekOverlay，完整设计含 Quick Hire）。
  // 关闭弹层时重拉助手列表，弹层里新建的员工立刻出现在左栏。
  function handlePeekClose() {
    setShowCreate(false);
    void listAgents(workspaceId ?? undefined)
      .then(setAgents)
      .catch(() => { /* 列表保持现状 */ });
  }

  return (
    <div style={{ flex: 1, display: 'flex', minWidth: 0, minHeight: 0 }}>
      {/* 左:助手列表 + 新员工 —— 2026-06-23 统一侧栏(路B)：不再自己渲染 ChatRail，
          改用 createPortal 把这段列表注入 HfLayout 那条常驻 ChatRail 的槽（纹丝不动）。
          列表是活的 React 子树，搜索框/选中高亮/点击回调照常用页面 state。 */}
      {slotEl && createPortal(
        <>
          <div className="pcv-rail-head">
            <button type="button" className="pcv-new" onClick={() => setShowCreate(true)} aria-label="+ 新员工">
              <Plus size={15} /> 新员工
            </button>
            <div className="pcv-search">
              <Search size={14} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索助手" aria-label="搜索助手" />
            </div>
          </div>
          <div className="pcv-list" ref={listRef}>
            {/* 会话记录（U3 · 2026-06-23）— 最近单聊会话，点击恢复（group 模式自带
                历史加载）。头像按 agent_id 取色（消费 U0 paletteForAgent）。搜索时隐藏，
                聚焦助手检索。Python 没起 → recentDMs 空 → 整段不渲染。 */}
            {q.trim() === '' && recentDMs.length > 0 && (
              <>
                <div className="pcv-sec">会话记录</div>
                {recentDMs.map((d, idx) => {
                  const isLastRow = idx === recentDMs.length - 1;
                  const active = d.agentId === agentId;
                  const pal = paletteForAgent(d.agentId, d.agentName);
                  const menuOpen = menuAgentId === d.agentId;
                  // 重命名内联态
                  if (renaming === d.agentId) {
                    return (
                      <div key={`dm_${d.agentId}`} ref={isLastRow ? lastDmRowRef : undefined} className={active ? 'pcv-row active' : 'pcv-row'}>
                        <HfAvatar glyph={initialOf(d.agentName)} color={pal.accent} size={32} />
                        <input
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void handleDmRename(d);
                            if (e.key === 'Escape') setRenaming(null);
                          }}
                          onBlur={() => { if (renaming === d.agentId) setRenaming(null); }}
                          // eslint-disable-next-line jsx-a11y/no-autofocus
                          autoFocus
                          style={{ flex: 1, minWidth: 0, background: 'var(--t-panel-2)', border: '1px solid var(--t-accent)', borderRadius: 5, padding: '3px 7px', color: 'var(--t-fg)', fontSize: 12.5, fontFamily: 'inherit', outline: 'none' }}
                        />
                        <button
                          type="button"
                          onMouseDown={(e) => { e.preventDefault(); void handleDmRename(d); }}
                          aria-label="确认重命名"
                          style={{ flexShrink: 0, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--t-accent)', padding: '2px 3px', display: 'inline-flex', alignItems: 'center' }}
                        >
                          <Check size={14} />
                        </button>
                      </div>
                    );
                  }
                  // 正常行 + hover 显示 "..." 按钮
                  return (
                    <div key={`dm_${d.agentId}`} ref={isLastRow ? lastDmRowRef : undefined} className={active ? 'pcv-row active' : 'pcv-row'}>
                      {/* 主点击区域 */}
                      <button
                        type="button"
                        onClick={() => selectAgent(d.agentId)}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
                      >
                        <HfAvatar glyph={initialOf(d.agentName)} color={pal.accent} size={32} />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                            <div className="pcv-row-name" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.agentName}</div>
                            <span style={{ flexShrink: 0, fontSize: 10.5, color: 'var(--t-fg-5)' }}>{relTime(d.lastActivityAt)}</span>
                          </div>
                          <div className="pcv-row-sub">{d.lastMessage || '—'}</div>
                        </div>
                        {d.unreadCount > 0 && (
                          <span style={{ flexShrink: 0, minWidth: 16, height: 16, padding: '0 4px', borderRadius: 8, background: 'var(--t-accent)', color: '#fff', fontSize: 10, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{d.unreadCount}</span>
                        )}
                      </button>
                      {/* "..." 菜单触发器 + 弹出面板 */}
                      <div ref={menuOpen ? menuRef : undefined} style={{ position: 'relative', flexShrink: 0 }}>
                        <button
                          type="button"
                          onClick={(e) => { void handleOpenDmMenu(d, e); }}
                          aria-label="更多操作"
                          className={menuOpen ? 'pcv-dm-dots open' : 'pcv-dm-dots'}
                          style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--t-fg-4)', padding: '2px 4px', borderRadius: 4, display: 'inline-flex', alignItems: 'center' }}
                        >
                          <MoreHorizontal size={14} />
                        </button>
                        {menuOpen && (
                          <div style={{
                            position: 'absolute', right: 0, top: '100%', zIndex: 200,
                            background: 'var(--t-panel)', border: '1px solid var(--t-border)',
                            borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,.22)',
                            padding: 4, minWidth: 130, marginTop: 2,
                          }}>
                            {/* 加载态：resolveDmConversation 仍在飞行时禁用所有操作 */}
                            {menuGroupIdLoading && (
                              <div style={{ padding: '6px 10px', fontSize: 11.5, color: 'var(--t-fg-5)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', border: '2px solid var(--t-fg-5)', borderTopColor: 'transparent', animation: 'spin 0.6s linear infinite' }} />
                                加载中…
                              </div>
                            )}
                            <button
                              type="button"
                              disabled={menuGroupIdLoading}
                              onClick={() => { if (!menuGroupIdLoading) { setRenaming(d.agentId); setRenameValue(d.agentName); setMenuAgentId(null); setDeleteConfirmAgentId(null); } }}
                              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 10px', background: 'none', border: 'none', borderRadius: 5, cursor: menuGroupIdLoading ? 'not-allowed' : 'pointer', fontSize: 12.5, color: menuGroupIdLoading ? 'var(--t-fg-5)' : 'var(--t-fg-3)', textAlign: 'left', fontFamily: 'inherit', opacity: menuGroupIdLoading ? 0.5 : 1 }}
                              onMouseEnter={(e) => { if (!menuGroupIdLoading) (e.currentTarget as HTMLButtonElement).style.background = 'var(--t-panel-2)'; }}
                              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
                            >
                              <Pencil size={13} /> 重命名
                            </button>
                            {/* 二步删除确认：第一次点「删除」→ 变为「确认删除？」；再点才真删 */}
                            {deleteConfirmAgentId === d.agentId ? (
                              <button
                                type="button"
                                onClick={() => void handleDmDelete(d)}
                                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 10px', background: 'rgba(239,68,68,.12)', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 12.5, color: 'var(--t-err, #ef4444)', textAlign: 'left', fontFamily: 'inherit', fontWeight: 600 }}
                              >
                                <Trash2 size={13} /> 确认删除？
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={menuGroupIdLoading}
                                onClick={() => void handleDmDelete(d)}
                                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 10px', background: 'none', border: 'none', borderRadius: 5, cursor: menuGroupIdLoading ? 'not-allowed' : 'pointer', fontSize: 12.5, color: menuGroupIdLoading ? 'var(--t-fg-5)' : 'var(--t-err, #ef4444)', textAlign: 'left', fontFamily: 'inherit', opacity: menuGroupIdLoading ? 0.5 : 1 }}
                                onMouseEnter={(e) => { if (!menuGroupIdLoading) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,.08)'; }}
                                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
                              >
                                <Trash2 size={13} /> 删除
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {hasMore && (
                  <button
                    type="button"
                    className="pcv-more-btn"
                    onClick={loadMore}
                  >
                    <ChevronDown size={13} />
                    更多对话（{sortedDMs.length - visibleCount}）
                  </button>
                )}
              </>
            )}
            <div className="pcv-sec">助手</div>
            {filtered.map((a) => {
              const active = a.agent_id === agentId;
              return (
                <button key={a.agent_id} type="button" className={active ? 'pcv-row active' : 'pcv-row'} onClick={() => selectAgent(a.agent_id)}>
                  <HfAvatar glyph={Array.from(a.name)[0] ?? '?'} color={a.avatar_color ?? 'var(--t-accent)'} size={32} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="pcv-row-name">{a.name}</div>
                    <div className="pcv-row-sub">{a.soul?.split('\n')[0] ?? ''}</div>
                  </div>
                </button>
              );
            })}
            {filtered.length === 0 && <div style={{ fontSize: 11.5, color: 'var(--t-fg-4)', padding: '4px 6px' }}>暂无助手</div>}
          </div>
        </>,
        slotEl,
      )}

      {/* 中:DM 单聊(Timeline 渲染) */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
        {agentId === null || selected === null ? (
          /* 未选助手 = start 形态(用户 2026-06-12 定形)：今天要做什么 + 完整
             composer 直接开干(NewTaskComposer=聊天内 start,发首条即建会话跑 run)。
             不再是"选择一个助手"的死引导;创建员工降为次级文字入口。 */
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
            {/* 个人态:composer 居中(clawsgo);run 就地在 /chat 壳内展开,不跳旧 run-session 页。
                run 活跃时右栏换成 run-session 完整标签页(下方 personalRunId 联动)。 */}
            <NewTaskComposer key={newTaskKey} centered onRunActive={setPersonalRunId} />
            <div style={{ flexShrink: 0, textAlign: 'center', padding: '0 16px 10px', background: 'var(--t-panel)' }}>
              {/* 这行文案被 PersonalChatView.test.tsx 断言（空态语义锚点） */}
              <span style={{ fontSize: 11, color: 'var(--t-fg-5)' }}>选择一个助手开始单聊，或创建一位新员工</span>
              <button type="button" onClick={() => setShowCreate(true)}
                style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--t-accent)', fontSize: 11, fontWeight: 600, padding: 0, marginLeft: 6 }}>
                <Plus size={11} style={{ verticalAlign: '-1px' }} /> 创建新员工
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Cherry/Yuxi 式单聊 header：头像 + 名字 + 人设一行 + 模型/状态。
                点头像/名字 → 打开人设（agent 详情，对齐 ClawsGO 右栏纯工作台）。 */}
            <div className="dm-head">
              <button
                type="button"
                onClick={() => setRoleSignal((n) => n + 1)}
                title="查看角色 / agent 详情"
                style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
              >
                <HfAvatar glyph={Array.from(selected.name)[0] ?? '?'} color={selected.avatar_color ?? 'var(--t-accent)'} size={38} />
                <div className="dm-head-id">
                  <div className="dm-head-name">
                    {selected.name}
                    <span className="dm-head-state" data-on={dmGroupId ? '1' : undefined}>
                      <span className="dm-head-dot" /> {dmGroupId ? '在线' : '连接中…'}
                    </span>
                  </div>
                  <div className="dm-head-persona">{personaLine || '你的 AI 同事 · 私密一对一'} · 点看角色</div>
                </div>
              </button>
              <div className="dm-head-actions">
                <span className="dm-head-model" title="当前模型">{modelLabel}</span>
                <button
                  type="button"
                  onClick={() => setShowExport(true)}
                  disabled={exportableMessages.length === 0 || streaming}
                  title={exportableMessages.length === 0 ? '暂无可导出的消息' : streaming ? '流式输出中，请等待完成后导出' : '导出对话'}
                  aria-label="导出对话"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    border: '1px solid var(--t-border)',
                    background: 'none',
                    cursor: exportableMessages.length === 0 || streaming ? 'not-allowed' : 'pointer',
                    color: exportableMessages.length === 0 || streaming ? 'var(--t-fg-5, var(--t-fg-4))' : 'var(--t-fg-3)',
                    opacity: exportableMessages.length === 0 || streaming ? 0.45 : 1,
                    flexShrink: 0,
                  }}
                >
                  <Download size={14} />
                </button>
                {/* Fix: disabled when isCreating to prevent double-click orphaned DM groups.
                    title communicates ephemeral-conversation semantics (fix #3): switching
                    agents restores the original conversation, not this fresh one. */}
                <button
                  type="button"
                  onClick={() => { void handleNewChat(); }}
                  disabled={isCreating}
                  title="新对话 · 切换助手后恢复原会话（本次对话不会消失，在历史记录中可查）"
                  aria-label="新对话"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    border: '1px solid var(--t-border)',
                    background: 'none',
                    cursor: isCreating ? 'not-allowed' : 'pointer',
                    color: isCreating ? 'var(--t-fg-5)' : 'var(--t-fg-3)',
                    flexShrink: 0,
                    opacity: isCreating ? 0.5 : 1,
                  }}
                >
                  <SquarePen size={14} />
                </button>
              </div>
            </div>
            {/* flex column 受限高度父容器：让 UnifiedChatFeed 内的滚动容器
                成为真正的滚动容器，流式跟随/滚底生效 */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: '12px 16px' }}>
              {studioMessages.length === 0 ? (
                /* DM 空对话引导态——和该助手开始,给几个启动 prompt */
                <div className="dm-empty">
                  <HfAvatar glyph={Array.from(selected.name)[0] ?? '?'} color={selected.avatar_color ?? 'var(--t-accent)'} size={56} />
                  <div className="dm-empty-name">和「{selected.name}」开始对话</div>
                  {personaLine && <div className="dm-empty-persona">{personaLine}</div>}
                  <div className="dm-empty-chips">
                    {['介绍一下你自己', '你能帮我做什么？', '我们开始吧'].map((s) => (
                      <button key={s} type="button" className="dm-empty-chip" onClick={() => { if (dmGroupId) void send(s); }}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                /* 对话框统一（chat-unify）：StudioMessageRow 回合气泡（一个回合一个头像）。 */
                <UnifiedChatFeed messages={studioMessages} typingName={undefined} padding="0" />
              )}
              {error && <div style={{ flexShrink: 0, textAlign: 'center', fontSize: 11, color: 'var(--t-err)', paddingTop: 6 }}>发送失败：{error}</div>}
            </div>
            {/* F1 — 完整 composer（@技能/附件/模型/知识库），streaming 时保持可输入
                以便用户提前排队下一条消息；Stop 按钮作为附加操作出现在 composer 上方。 */}
            <div style={{ flexShrink: 0, padding: '10px 16px 14px', borderTop: '1px solid var(--t-border)', background: 'var(--t-panel)' }}>
              {(streaming || pendingCount > 0) && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, paddingBottom: 6 }}>
                  {streaming && (
                    <button
                      type="button"
                      onClick={cancel}
                      data-testid="dm-stop-btn"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '5px 16px',
                        borderRadius: 8,
                        border: '1px solid rgba(239,68,68,.3)',
                        background: 'rgba(239,68,68,.1)',
                        color: 'var(--t-err, #ef4444)',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      <Square size={12} fill="currentColor" strokeWidth={0} />
                      停止
                    </button>
                  )}
                  {pendingCount > 0 && (
                    <span
                      data-testid="dm-pending-badge"
                      style={{
                        fontSize: 11,
                        color: 'var(--t-fg-4)',
                        background: 'var(--t-border)',
                        borderRadius: 10,
                        padding: '2px 8px',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {pendingCount} 条待发
                    </span>
                  )}
                </div>
              )}
              <UnifiedComposer
                variant="chat"
                onSubmit={handleDmSubmit}
                placeholder={`发给「${selected.name}」 · 试试 @ 提及 Skill`}
                messages={messageTexts}
              />
            </div>
          </>
        )}
      </div>

      {/* 右栏三态：
          · START 落地页(未选 agent + 无活跃 run) → 无右栏,落地页全宽(clawsgo 居中体感)
          · START 态 run 活跃 → run-session 完整标签页(仅真组队≥2节点才出现,见 PersonalRunRightPane)
          · DM(已选 agent) → PersonalRightPane 设定卡 */}
      {agentId === null
        ? (personalRunId ? <PersonalRunRightPane sessionId={personalRunId} /> : null)
        : <PersonalRightPane
            key={selected?.agent_id ?? 'none'}
            agent={selected}
            groupId={dmGroupId}
            roleSignal={roleSignal}
            onAgentUpdated={(updated) => {
              setAgents((prev) => prev.map((a) => a.agent_id === updated.agent_id ? updated : a));
            }}
          />}

      {showCreate && <PagePeekOverlay target="agents" onClose={handlePeekClose} />}

      {showExport && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={() => setShowExport(false)}
        >
          <div
            style={{
              background: 'var(--t-panel)',
              border: '1px solid var(--t-border)',
              borderRadius: 12,
              padding: '20px 24px',
              minWidth: 280,
              boxShadow: '0 8px 32px rgba(0,0,0,.3)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--t-fg)' }}>导出对话</span>
              <button
                type="button"
                onClick={() => setShowExport(false)}
                aria-label="关闭"
                style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--t-fg-4)', display: 'inline-flex', alignItems: 'center', padding: 2, borderRadius: 4 }}
              >
                <X size={16} />
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                type="button"
                onClick={() => handleExport('markdown')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 14px', borderRadius: 8,
                  border: '1px solid var(--t-border)',
                  background: 'var(--t-panel-2)',
                  cursor: 'pointer', color: 'var(--t-fg)',
                  fontSize: 13, fontFamily: 'inherit', textAlign: 'left',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--t-accent)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--t-border)'; }}
              >
                <Download size={14} style={{ flexShrink: 0, color: 'var(--t-accent)' }} />
                <div>
                  <div style={{ fontWeight: 600 }}>Markdown</div>
                  <div style={{ fontSize: 11, color: 'var(--t-fg-4)', marginTop: 2 }}>**我:** / **{selected?.name ?? 'Agent'}:** 粗体标题</div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => handleExport('plain')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 14px', borderRadius: 8,
                  border: '1px solid var(--t-border)',
                  background: 'var(--t-panel-2)',
                  cursor: 'pointer', color: 'var(--t-fg)',
                  fontSize: 13, fontFamily: 'inherit', textAlign: 'left',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--t-accent)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--t-border)'; }}
              >
                <Download size={14} style={{ flexShrink: 0, color: 'var(--t-fg-3)' }} />
                <div>
                  <div style={{ fontWeight: 600 }}>纯文本</div>
                  <div style={{ fontSize: 11, color: 'var(--t-fg-4)', marginTop: 2 }}>我: / {selected?.name ?? 'Agent'}: 普通标签</div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
