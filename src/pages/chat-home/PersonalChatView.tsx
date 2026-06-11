import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { Plus, Search, Send } from 'lucide-react';
import { HfAvatar } from '../../components/hifi';
import { listAgents, type AgentRecord } from '../../api/agents';
import { resolveDmConversation } from '../../api/groupApi';
import { useChatStream, type ChatMessage } from '../../core/hooks/useChatStream';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { Timeline } from '../../components/run-session/timeline/Timeline';
import type { TimelineMessage } from '../../components/run-session/timeline/types';
import { CreateAgentModal } from '../../core/components/agent/CreateAgentModal';
import { PersonalRightPane } from './PersonalRightPane';
import { ChatRail } from './ChatRailChrome';

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

  const [draft, setDraft] = useState('');
  const doSend = () => {
    // dmGroupId 未就绪(后端未启/解析中)时不清空草稿——否则键盘 Enter 路径会静默丢字
    if (!dmGroupId) return;
    const t = draft.trim(); if (!t) return;
    setDraft(''); void send(t);
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); }
  };

  function handleCreated(agent: AgentRecord) {
    setAgents((prev) => [...prev, agent]);
    setShowCreate(false);
    setAgentId(agent.agent_id); // 创建即进入 DM —— 一边聊天一边把员工创建出来
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
        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button type="button" onClick={() => setShowCreate(true)} aria-label="+ 新员工"
            style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '9px 0', borderRadius: 10, border: 'none', cursor: 'pointer', background: 'var(--t-accent)', color: 'var(--t-accent-ink)', fontWeight: 700, fontSize: 13 }}>
            <Plus size={15} /> 新员工
          </button>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: 9, color: 'var(--t-fg-4)' }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索助手" aria-label="搜索助手"
              style={{ width: '100%', padding: '8px 10px 8px 30px', borderRadius: 8, border: '1px solid var(--t-border)', background: 'var(--t-bg)', color: 'var(--t-fg)', fontSize: 12.5, outline: 'none' }} />
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 8px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-fg-4)', padding: '6px 6px', letterSpacing: '.04em' }}>助手</div>
          {filtered.map((a) => {
            const active = a.agent_id === agentId;
            return (
              <button key={a.agent_id} type="button" onClick={() => setAgentId(a.agent_id)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 6px', borderRadius: 8, border: 'none', cursor: 'pointer', textAlign: 'left', background: active ? 'var(--t-accent-tint)' : 'transparent' }}>
                <HfAvatar glyph={Array.from(a.name)[0] ?? '?'} color={a.avatar_color ?? 'var(--t-accent)'} size={32} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t-fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--t-fg-4)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.soul?.split('\n')[0] ?? ''}</div>
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
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--t-fg-3)', fontSize: 14 }}>
            选择一个助手开始单聊，或创建一位新员工
          </div>
        ) : (
          <>
            <div style={{ height: 48, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '0 20px', borderBottom: '1px solid var(--t-border)', background: 'var(--t-panel)' }}>
              <HfAvatar glyph={Array.from(selected.name)[0] ?? '?'} color={selected.avatar_color ?? 'var(--t-accent)'} size={28} />
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--t-fg)' }}>{selected.name}</span>
              {!dmGroupId && <span style={{ fontSize: 11, color: 'var(--t-fg-4)' }}>连接会话中…</span>}
            </div>
            {/* flex column 受限高度父容器:让 Timeline 自带的 .container(flex:1; min-height:0; overflow-y:auto)
                成为真正的滚动容器,其内置智能自动滚动(流式跟随/滚底)才生效 */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: '12px 16px' }}>
              <Timeline messages={timelineMessages} />
              {error && <div style={{ flexShrink: 0, textAlign: 'center', fontSize: 11, color: 'var(--t-err)', paddingTop: 6 }}>发送失败：{error}</div>}
            </div>
            <div style={{ flexShrink: 0, borderTop: '1px solid var(--t-border)', padding: '12px 20px', background: 'var(--t-panel)', display: 'flex', alignItems: 'flex-end', gap: 10 }}>
              <textarea value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey} rows={1} aria-label="发消息"
                placeholder="发消息 · Enter 发送 · Shift+Enter 换行"
                style={{ flex: 1, minHeight: 38, maxHeight: 120, padding: '9px 12px', resize: 'none', border: '1px solid var(--t-border)', borderRadius: 10, background: 'var(--t-bg)', color: 'var(--t-fg)', fontSize: 13, outline: 'none' }} />
              <button type="button" onClick={doSend} disabled={!draft.trim() || !dmGroupId} aria-label="发送"
                style={{ height: 38, padding: '0 14px', borderRadius: 10, border: '1px solid var(--t-accent)', background: draft.trim() && dmGroupId ? 'var(--t-accent)' : 'var(--t-panel-2)', color: draft.trim() && dmGroupId ? 'var(--t-accent-ink)' : 'var(--t-fg-4)', fontWeight: 700, fontSize: 12, cursor: draft.trim() && dmGroupId ? 'pointer' : 'not-allowed', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span>发送</span><Send size={14} />
              </button>
            </div>
          </>
        )}
      </div>

      {/* 右:run 式标签页(选中助手且会话就绪才出现) */}
      {selected && dmGroupId && <PersonalRightPane agent={selected} groupId={dmGroupId} />}

      {showCreate && (
        <CreateAgentModal onCreated={handleCreated} onClose={() => setShowCreate(false)} />
      )}
    </div>
  );
}
