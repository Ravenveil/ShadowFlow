/**
 * AgentEditChat — 对话式 Agent 编辑器
 *
 * 嵌入 TabAgents 中央面板底部，用户用自然语言描述修改，LLM 解析后自动更新 Agent 配置。
 */

import { useState, useRef, useEffect } from 'react';
import { FBIcons } from './FBAtoms';
import { chatEditAgent, type AgentChatResponse } from '../../api/agents';

interface ChatMsg {
  id: number;
  role: 'user' | 'assistant' | 'error';
  text: string;
  appliedFields?: string[];
}

interface AgentEditChatProps {
  agentId: string;
  onAgentUpdated: () => void;
}

function getSecrets(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem('sf_secrets') ?? '{}');
  } catch {
    return {};
  }
}

function getProviderKey(provider: string): string {
  const secrets = getSecrets();
  const map: Record<string, string> = {
    zhipu: 'zhipu_key',
    openai: 'openai_key',
    claude: 'claude_key',
    deepseek: 'deepseek_key',
  };
  return secrets[map[provider] ?? ''] ?? '';
}

const PROVIDERS = ['zhipu', 'openai', 'claude', 'deepseek', 'ollama'] as const;
const PROVIDER_LABELS: Record<string, string> = {
  zhipu: '智谱', openai: 'OpenAI', claude: 'Claude', deepseek: 'DeepSeek', ollama: 'Ollama',
};

export function AgentEditChat({ agentId, onAgentUpdated }: AgentEditChatProps) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [provider, setProvider] = useState('zhipu');
  const [expanded, setExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const nextId = useRef(1);

  useEffect(() => {
    setMessages([]);
    nextId.current = 1;
  }, [agentId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  const handleSend = async () => {
    const msg = text.trim();
    if (!msg || sending) return;

    const key = getProviderKey(provider);
    if (!key && provider !== 'ollama') {
      setMessages(prev => [...prev, {
        id: nextId.current++,
        role: 'error',
        text: `未配置 ${PROVIDER_LABELS[provider]} API Key。请在设置中添加。`,
      }]);
      return;
    }

    const userMsg: ChatMsg = { id: nextId.current++, role: 'user', text: msg };
    setMessages(prev => [...prev, userMsg]);
    setText('');
    setSending(true);

    try {
      const resp: AgentChatResponse = await chatEditAgent(agentId, msg, key, provider);
      const assistantMsg: ChatMsg = {
        id: nextId.current++,
        role: 'assistant',
        text: resp.reply || (resp.applied ? '已更新。' : '没有需要修改的内容。'),
        appliedFields: resp.applied_fields,
      };
      setMessages(prev => [...prev, assistantMsg]);
      if (resp.applied) {
        onAgentUpdated();
      }
    } catch (e) {
      setMessages(prev => [...prev, {
        id: nextId.current++,
        role: 'error',
        text: e instanceof Error ? e.message : String(e),
      }]);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!expanded) {
    return (
      <div
        onClick={() => { setExpanded(true); requestAnimationFrame(() => textareaRef.current?.focus()); }}
        style={{
          margin: '0 0 2px',
          padding: '10px 14px',
          background: 'var(--t-panel)',
          border: '1px solid var(--t-border)',
          borderRadius: 10,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          transition: 'border-color 120ms',
        }}
        onMouseOver={e => (e.currentTarget.style.borderColor = 'var(--t-accent)')}
        onMouseOut={e => (e.currentTarget.style.borderColor = 'var(--t-border)')}
      >
        <span style={{ width: 14, height: 14, display: 'flex', color: 'var(--t-accent-bright)' }}>{FBIcons.chat}</span>
        <span style={{ fontSize: 12, color: 'var(--t-fg-4)' }}>对话修改 Agent ... 说"把 soul 改成..."、粘贴 skill 链接</span>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      border: '1px solid var(--t-border)', borderRadius: 10,
      background: 'var(--t-panel)', overflow: 'hidden',
      maxHeight: 360, minHeight: 180,
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '7px 12px', borderBottom: '1px solid var(--t-border)',
        background: 'var(--skin-panel)', flexShrink: 0,
      }}>
        <span style={{ width: 14, height: 14, display: 'flex', color: 'var(--t-accent-bright)' }}>{FBIcons.chat}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-fg-2)' }}>对话修改</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--t-fg-5)' }}>用自然语言修改 Agent 配置</span>
        <button
          className="fb-btn fb-btn-icon"
          onClick={() => setExpanded(false)}
          style={{ width: 20, height: 20 }}
          title="收起"
        >×</button>
      </div>

      {/* Messages */}
      {messages.length > 0 && <div ref={scrollRef} style={{
        flex: 1, overflow: 'auto', padding: '8px 12px',
        display: 'flex', flexDirection: 'column', gap: 6,
      }}>
        {messages.map(m => (
          <div key={m.id} style={{
            display: 'flex',
            justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
          }}>
            <div style={{
              maxWidth: '85%',
              padding: '6px 10px',
              borderRadius: 8,
              fontSize: 12,
              lineHeight: 1.5,
              ...(m.role === 'user' ? {
                background: 'var(--t-accent-tint)',
                border: '1px solid color-mix(in oklab, var(--t-accent) 30%, transparent)',
                color: 'var(--t-fg)',
              } : m.role === 'error' ? {
                background: 'var(--status-reject-tint)',
                border: '1px solid color-mix(in oklab, var(--status-reject) 30%, transparent)',
                color: 'var(--status-reject)',
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
              } : {
                background: 'var(--t-panel-2)',
                border: '1px solid var(--t-border)',
                color: 'var(--t-fg-2)',
              }),
            }}>
              {m.text}
              {m.appliedFields && m.appliedFields.length > 0 && (
                <div style={{
                  marginTop: 4, display: 'flex', gap: 4, flexWrap: 'wrap',
                }}>
                  {m.appliedFields.map(f => (
                    <span key={f} style={{
                      fontFamily: 'var(--font-mono)', fontSize: 9,
                      padding: '1px 5px', borderRadius: 3,
                      background: 'var(--status-ok-tint)',
                      color: 'var(--status-ok)',
                      border: '1px solid color-mix(in oklab, var(--status-ok) 25%, transparent)',
                    }}>
                      {f} updated
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {sending && (
          <div style={{
            padding: '6px 10px', borderRadius: 8,
            background: 'var(--t-panel-2)', border: '1px solid var(--t-border)',
            fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--t-fg-4)',
            alignSelf: 'flex-start',
          }}>
            思考中...
          </div>
        )}
      </div>}

      {/* Input + provider */}
      <div style={{
        flex: messages.length === 0 ? 1 : undefined,
        flexShrink: 0,
        display: 'flex', flexDirection: 'column',
        borderTop: messages.length > 0 ? '1px solid var(--t-border)' : undefined,
      }}>
        {/* Provider selector */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 3,
          padding: '4px 10px',
          background: 'var(--t-panel)', flexShrink: 0,
        }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--t-fg-5)', marginRight: 3 }}>LLM</span>
          {PROVIDERS.map(p => (
            <button
              key={p}
              onClick={() => setProvider(p)}
              style={{
                fontFamily: 'var(--font-mono)', fontSize: 9.5,
                padding: '1px 6px', borderRadius: 3,
                border: p === provider ? '1px solid var(--t-accent-bright)' : '1px solid var(--t-border)',
                background: p === provider ? 'var(--t-accent-bright)' : 'transparent',
                color: p === provider ? '#fff' : 'var(--t-fg-4)',
                cursor: 'pointer', transition: 'all 0.12s',
              }}
            >
              {PROVIDER_LABELS[p]}
            </button>
          ))}
        </div>

        {/* Textarea */}
        <div style={{
          flex: 1, padding: '6px 10px 8px',
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex', alignItems: 'flex-start', gap: 8,
        }}>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="加一个代码审查技能、把角色改成后端专家..."
            disabled={sending}
            rows={messages.length === 0 ? 4 : 1}
            style={{
              flex: 1, resize: 'none', border: 0, outline: 0,
              background: 'transparent', color: 'var(--t-fg)',
              fontSize: 12, fontFamily: 'var(--font-sans)',
              lineHeight: 1.5, padding: '4px 0',
              height: messages.length === 0 ? '100%' : undefined,
            }}
          />
        <button
          className="fb-btn fb-btn-primary fb-btn-sm"
          disabled={!text.trim() || sending}
          onClick={handleSend}
          style={{
            display: 'flex', gap: 4, alignItems: 'center',
            opacity: text.trim() && !sending ? 1 : 0.4,
            flexShrink: 0,
          }}
        >
          <span style={{ width: 11, height: 11, display: 'flex' }}>{FBIcons.send}</span>
          发送
        </button>
        </div>
      </div>
    </div>
  );
}
