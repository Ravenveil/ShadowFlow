import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { Plus, Search, Square, SquarePen } from 'lucide-react';
import { UnifiedComposer } from '../../components/composer/UnifiedComposer';
import { NewTaskComposer } from './NewTaskComposer';
import { HfAvatar } from '../../components/hifi';
import { listAgents, type AgentRecord } from '../../api/agents';
import { resolveDmConversation, createFreshDmConversation } from '../../api/groupApi';
import { useChatStream, type ChatMessage } from '../../core/hooks/useChatStream';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useInboxStore } from '../../core/store/useInboxStore';
import { paletteForAgent, initialOf } from '../../components/chat-fb/agentAvatar';
import { Timeline } from '../../components/run-session/timeline/Timeline';
import type { TimelineMessage } from '../../components/run-session/timeline/types';
// 对话框统一（chat-unify）：个人单聊也用 StudioMessageRow 的统一回合气泡。
import { UnifiedChatFeed, timelineMessagesToStudio } from '../../components/workbench/UnifiedChatFeed';
import { useUnifiedBubble } from './useUnifiedBubble';
import { PersonalRightPane } from './PersonalRightPane';
import { PersonalRunRightPane } from './PersonalRunRightPane';
import { useSidebarSlotEl } from './SidebarSlotContext';
import { PagePeekOverlay } from './PagePeekOverlay';
import { relTime } from '../../core/utils/relTime';

/**
 * ChatMessage → TimelineMessage 适配层(融合M1)。
 * 纯文本两种卡;M2 过程事件(thinking/tool_call)落库后在此扩展映射即点亮富卡。
 */
function toTimelineMessages(messages: ChatMessage[]): TimelineMessage[] {
  return messages
    // 过滤空 content(如 SSE tool_call 占位消息)——否则渲染成空白 .item 行
    .filter((m) => (m.content ?? '').trim().length > 0)
    .map((m, i) => {
      if (m.role === 'user') {
        return { id: m.id, kind: 'user_turn', turn_id: m.id, ts: i, text: m.content } as TimelineMessage;
      }
      if (m.role === 'system') {
        // system = 网关失败反馈(缺 key/403/悬空成员等)→ raw 卡(折叠 mono 块)。
        // 决不能过滤:否则环境问题表现为「发了没人理」的静默失败。
        return { id: m.id, kind: 'raw', turn_id: m.id, ts: i, body: m.content, source: 'chat-gateway' } as TimelineMessage;
      }
      return { id: m.id, kind: 'assistant_text', turn_id: m.id, ts: i, body: m.content, streaming: m.streaming } as TimelineMessage;
    });
}

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
  const [dmGroupId, setDmGroupId] = useState<string | null>(null);
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
  // 按最近活动倒序；最多 12 条（够覆盖「最近聊过谁」，再多走上方搜索/助手段）。
  const recentDMs = useMemo(
    () => [...agentDMs]
      .sort((a, b) => Date.parse(b.lastActivityAt ?? '') - Date.parse(a.lastActivityAt ?? ''))
      .slice(0, 12),
    [agentDMs],
  );

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
  const timelineMessages = useMemo(() => toTimelineMessages(messages), [messages]);
  // 对话框统一：把同一份 Timeline 消息映射成统一回合气泡（StudioMessageRow）。
  const unifiedBubble = useUnifiedBubble();
  const studioMessages = useMemo(
    () => timelineMessagesToStudio(timelineMessages),
    [timelineMessages],
  );

  // Fix #1: memoize content strings to prevent O(n) re-renders on every SSE streaming tick.
  const messageTexts = useMemo(() => messages.map((m) => m.content), [messages]);

  // 「新对话」—— 强制创建全新 DM conversation，保留历史，从空白开始。
  async function handleNewChat() {
    if (!agentId || !agentInWs) return;
    setDmGroupId(null);
    const newId = await createFreshDmConversation(agentId, workspaceId);
    if (newId) setDmGroupId(newId);
  }

  // F1 — DM 也用完整 composer。dmGroupId 未就绪时（resolveDmConversation 仍在
  // 飞行），send() 会把消息暂存到 pendingQueueRef；targetId 就绪后 drain effect
  // 自动补发。不再提前 return —— 那样会静默丢弃消息且注释与行为矛盾。
  async function handleDmSubmit(p: { text: string }) {
    const t = p.text.trim();
    if (!t) return;
    await send(t);
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
          <div className="pcv-list">
            {/* 会话记录（U3 · 2026-06-23）— 最近单聊会话，点击恢复（group 模式自带
                历史加载）。头像按 agent_id 取色（消费 U0 paletteForAgent）。搜索时隐藏，
                聚焦助手检索。Python 没起 → recentDMs 空 → 整段不渲染。 */}
            {q.trim() === '' && recentDMs.length > 0 && (
              <>
                <div className="pcv-sec">会话记录</div>
                {recentDMs.map((d) => {
                  const active = d.agentId === agentId;
                  const pal = paletteForAgent(d.agentId, d.agentName);
                  return (
                    <button key={`dm_${d.agentId}`} type="button" className={active ? 'pcv-row active' : 'pcv-row'} onClick={() => selectAgent(d.agentId)}>
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
                  );
                })}
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
            <NewTaskComposer centered onRunActive={setPersonalRunId} />
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
                  onClick={() => { void handleNewChat(); }}
                  title="新对话（保留历史）"
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
                    cursor: 'pointer',
                    color: 'var(--t-fg-3)',
                    flexShrink: 0,
                  }}
                >
                  <SquarePen size={14} />
                </button>
              </div>
            </div>
            {/* flex column 受限高度父容器:让 Timeline 自带的 .container(flex:1; min-height:0; overflow-y:auto)
                成为真正的滚动容器,其内置智能自动滚动(流式跟随/滚底)才生效 */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: '12px 16px' }}>
              {timelineMessages.length === 0 ? (
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
              ) : unifiedBubble ? (
                /* 对话框统一（chat-unify）：StudioMessageRow 回合气泡（一个回合一个头像）。 */
                <UnifiedChatFeed messages={studioMessages} typingName={undefined} padding="0" />
              ) : (
                <Timeline messages={timelineMessages} variant="chat" />
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
        : <PersonalRightPane key={selected?.agent_id ?? 'none'} agent={selected} groupId={dmGroupId} roleSignal={roleSignal} />}

      {showCreate && <PagePeekOverlay target="agents" onClose={handlePeekClose} />}
    </div>
  );
}
