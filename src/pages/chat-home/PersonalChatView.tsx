import { useEffect, useMemo, useState } from 'react';
import { Plus, Search, MessageSquare, Lock, Rocket, Brain } from 'lucide-react';
import { UnifiedComposer } from '../../components/composer/UnifiedComposer';
import { HfAvatar } from '../../components/hifi';
import { listAgents, type AgentRecord } from '../../api/agents';
import { resolveDmConversation } from '../../api/groupApi';
import { useChatStream, type ChatMessage } from '../../core/hooks/useChatStream';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { Timeline } from '../../components/run-session/timeline/Timeline';
import type { TimelineMessage } from '../../components/run-session/timeline/types';
import { PersonalRightPane } from './PersonalRightPane';
import { ChatRail } from './ChatRailChrome';
import { PagePeekOverlay } from './PagePeekOverlay';

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
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [q, setQ] = useState('');
  const [agentId, setAgentId] = useState<string | null>(null);
  const [dmGroupId, setDmGroupId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    let alive = true;
    // 切工作区即重置选中——避免旧 agentId+新 workspaceId 触发跨区 find-or-create DM 落库
    setAgentId(null);
    void listAgents(workspaceId ?? undefined)
      .then((rows) => { if (alive) setAgents(rows); })
      .catch(() => { if (alive) setAgents([]); });
    return () => { alive = false; };
  }, [workspaceId]);

  // 选中助手 → 解析其 dm conversation(kind='dm',群聊后端同一套:持久化+网关回复+SSE)
  useEffect(() => {
    if (!agentId) { setDmGroupId(null); return; }
    let alive = true;
    setDmGroupId(null);
    void resolveDmConversation(agentId, workspaceId ?? undefined)
      .then((gid) => { if (alive) setDmGroupId(gid); })
      .catch(() => { if (alive) setDmGroupId(null); });
    return () => { alive = false; };
  }, [agentId, workspaceId]);

  const filtered = useMemo(
    () => agents.filter((a) => a.name.toLowerCase().includes(q.trim().toLowerCase())),
    [agents, q],
  );
  const selected = agents.find((a) => a.agent_id === agentId) ?? null;

  const { messages, send, error } = useChatStream({
    mode: 'group',
    targetId: dmGroupId,
    sseChannel: 'group',
  });
  const timelineMessages = useMemo(() => toTimelineMessages(messages), [messages]);

  // F1 — DM 也用完整 composer。dmGroupId 未就绪时抛错（组件错误条提示,草稿不丢）。
  async function handleDmSubmit(p: { text: string }) {
    const t = p.text.trim();
    if (!t) return;
    if (!dmGroupId) throw new Error('会话连接中，请稍候再发');
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
      {/* 左:助手列表 + 新员工（M3b：顶部个人/团队切换 + 底部低频导航图标行；
          M3d：ChatRail 可收起成 48px 窄条） */}
      <ChatRail
        view="personal"
        width={264}
        containerStyle={{ borderRight: '1px solid var(--t-border)', background: 'var(--t-panel)' }}
      >
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
          <div className="pcv-sec">助手</div>
          {filtered.map((a) => {
            const active = a.agent_id === agentId;
            return (
              <button key={a.agent_id} type="button" className={active ? 'pcv-row active' : 'pcv-row'} onClick={() => setAgentId(a.agent_id)}>
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
      </ChatRail>

      {/* 中:DM 单聊(Timeline 渲染) */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
        {agentId === null || selected === null ? (
          <div className="pcv-empty">
            <div className="pcv-empty-glyph"><MessageSquare size={26} strokeWidth={1.75} /></div>
            <div className="pcv-empty-title">和你的 AI 同事单聊</div>
            {/* 这行文案被 PersonalChatView.test.tsx 断言，勿改 */}
            <div className="pcv-empty-sub">选择一个助手开始单聊，或创建一位新员工</div>
            <div className="pcv-empty-hints">
              <span className="pcv-hint"><Lock size={13} /> 私密一对一，不进群</span>
              <span className="pcv-hint"><Rocket size={13} /> 随时升级成 Run</span>
              <span className="pcv-hint"><Brain size={13} /> 记忆持续累积</span>
            </div>
            <button type="button" className="pcv-empty-cta" onClick={() => setShowCreate(true)}>
              <Plus size={15} /> 创建新员工
            </button>
          </div>
        ) : (
          <>
            <div className="pcv-chat-head">
              <HfAvatar glyph={Array.from(selected.name)[0] ?? '?'} color={selected.avatar_color ?? 'var(--t-accent)'} size={28} />
              <span className="pcv-chat-name">{selected.name}</span>
              {!dmGroupId && <span className="pcv-chat-status">连接会话中…</span>}
            </div>
            {/* flex column 受限高度父容器:让 Timeline 自带的 .container(flex:1; min-height:0; overflow-y:auto)
                成为真正的滚动容器,其内置智能自动滚动(流式跟随/滚底)才生效 */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: '12px 16px' }}>
              <Timeline messages={timelineMessages} />
              {error && <div style={{ flexShrink: 0, textAlign: 'center', fontSize: 11, color: 'var(--t-err)', paddingTop: 6 }}>发送失败：{error}</div>}
            </div>
            {/* F1 — 完整 composer（@技能/附件/模型/知识库），与新任务/开始页同一组件 */}
            <div style={{ flexShrink: 0, padding: '10px 16px 14px', borderTop: '1px solid var(--t-border)', background: 'var(--t-panel)' }}>
              <UnifiedComposer
                variant="chat"
                onSubmit={handleDmSubmit}
                placeholder={`发给「${selected.name}」 · 试试 @ 提及 Skill`}
              />
            </div>
          </>
        )}
      </div>

      {/* 右:第三栏常驻(设计稿)——工作区 tab 永远在;员工/任务/Brief 选中助手后点亮 */}
      <PersonalRightPane agent={selected} groupId={dmGroupId} />

      {showCreate && <PagePeekOverlay target="agents" onClose={handlePeekClose} />}
    </div>
  );
}
