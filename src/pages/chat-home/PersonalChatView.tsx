import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Search, Send } from 'lucide-react';
import { HfAvatar } from '../../components/hifi';
import { listAgents, type AgentRecord } from '../../api/agents';
import { useChatStream } from '../../core/hooks/useChatStream';
import { useWorkspaceStore } from '../../store/workspaceStore';

/**
 * PersonalChatView — /chat「个人」视图（Cherry Studio 式）。
 * 左：当前工作区 agent 列表（listAgents）；右：选中 agent 的一对一单聊
 * （useChatStream dm 模式，复用 baseline 既有 BYOK 单轮链路）。
 * 选中态用组件内 state（Step 1 不引入新路由）。
 */
export function PersonalChatView() {
  const workspaceId = useWorkspaceStore((s) => s.currentId);
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [q, setQ] = useState('');
  const [agentId, setAgentId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void listAgents(workspaceId ?? undefined)
      .then((rows) => { if (alive) setAgents(rows); })
      .catch(() => { if (alive) setAgents([]); });
    return () => { alive = false; };
  }, [workspaceId]);

  const filtered = useMemo(
    () => agents.filter((a) => a.name.toLowerCase().includes(q.trim().toLowerCase())),
    [agents, q],
  );
  const selected = agents.find((a) => a.agent_id === agentId) ?? null;

  const { messages, send, error } = useChatStream({ mode: 'dm', targetId: agentId });
  const [draft, setDraft] = useState('');
  const streamRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    requestAnimationFrame(() => {
      const n = streamRef.current; if (n) n.scrollTop = n.scrollHeight;
    });
  }, [messages.length]);

  const doSend = () => {
    const t = draft.trim(); if (!t) return;
    setDraft(''); void send(t);
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); }
  };

  return (
    <div style={{ flex: 1, display: 'flex', minWidth: 0, minHeight: 0 }}>
      {/* 左：agent 列表 */}
      <div style={{ width: 264, flexShrink: 0, borderRight: '1px solid var(--t-border)', display: 'flex', flexDirection: 'column', background: 'var(--t-panel)' }}>
        <div style={{ padding: 12 }}>
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
      </div>

      {/* 右：dm 单聊 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
        {agentId === null || selected === null ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--t-fg-3)', fontSize: 14 }}>
            选择一个助手，开始一对一聊
          </div>
        ) : (
          <>
            <div style={{ height: 48, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '0 20px', borderBottom: '1px solid var(--t-border)', background: 'var(--t-panel)' }}>
              <HfAvatar glyph={Array.from(selected.name)[0] ?? '?'} color={selected.avatar_color ?? 'var(--t-accent)'} size={28} />
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--t-fg)' }}>{selected.name}</span>
            </div>
            <div ref={streamRef} style={{ flex: 1, overflowY: 'auto', padding: '20px 28px', minHeight: 0 }}>
              {messages.map((m) => {
                const isUser = m.role === 'user';
                return (
                  <div key={m.id} style={{ display: 'flex', flexDirection: isUser ? 'row-reverse' : 'row', marginBottom: 12 }}>
                    <div style={{ maxWidth: '65%', padding: '10px 14px', borderRadius: isUser ? '12px 12px 4px 12px' : '12px 12px 12px 4px', background: isUser ? 'var(--t-accent)' : 'var(--t-panel-2)', color: isUser ? 'var(--t-accent-ink)' : 'var(--t-fg)', fontSize: 13.5, lineHeight: 1.5, border: isUser ? 'none' : '1px solid var(--t-border)', wordBreak: 'break-word' }}>
                      {m.content}
                    </div>
                  </div>
                );
              })}
              {error && <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--t-err)' }}>发送失败：{error}</div>}
            </div>
            <div style={{ flexShrink: 0, borderTop: '1px solid var(--t-border)', padding: '12px 20px', background: 'var(--t-panel)', display: 'flex', alignItems: 'flex-end', gap: 10 }}>
              <textarea value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey} rows={1} aria-label="发消息"
                placeholder="发消息 · Enter 发送 · Shift+Enter 换行"
                style={{ flex: 1, minHeight: 38, maxHeight: 120, padding: '9px 12px', resize: 'none', border: '1px solid var(--t-border)', borderRadius: 10, background: 'var(--t-bg)', color: 'var(--t-fg)', fontSize: 13, outline: 'none' }} />
              <button type="button" onClick={doSend} disabled={!draft.trim()} aria-label="发送"
                style={{ height: 38, padding: '0 14px', borderRadius: 10, border: '1px solid var(--t-accent)', background: draft.trim() ? 'var(--t-accent)' : 'var(--t-panel-2)', color: draft.trim() ? 'var(--t-accent-ink)' : 'var(--t-fg-4)', fontWeight: 700, fontSize: 12, cursor: draft.trim() ? 'pointer' : 'not-allowed', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span>发送</span><Send size={14} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
