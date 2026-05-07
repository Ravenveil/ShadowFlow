/**
 * AgentDMPage — Phase 2 mock 单聊视图.
 *
 * Renders a fully-styled (but mock-data-only) DM view between the user and a
 * single agent. Mirrors the shell pattern used by ChatPage: this page lives
 * inside <HfLayout> so it only renders the inner content column (HfTopBar +
 * body). The body is a 2-column grid: [message stream + composer | agent card].
 *
 * Phase 2 scope: pure front-end, no backend wiring. The composer locally
 * appends to a mock message list so users can feel the interaction without
 * any real ACP / streaming session.
 *
 * Functional preservations (existing tests in AgentDMPage.test.tsx still pass):
 *   - BreadcrumbBar (a11y landmark, hidden visually) — agent name visible
 *     in HfTopBar crumbs.
 *   - `kind: ...` / `status: ...` mono metadata strip.
 *   - CreateAgentButton "创建类似 Agent" with Builder gating.
 */
import { useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { useParams } from 'react-router-dom';
import { BreadcrumbBar } from '../core/components/inbox/BreadcrumbBar';
import { CreateAgentButton } from '../core/components/inbox/CreateAgentButton';
import { useInboxStore } from '../core/store/useInboxStore';
import { buildAgentDMBuilderUrl } from '../core/utils/builderNavigation';
import { HfTopBar, HfAvatar, HfDot } from '../components/hifi';
import { useI18n } from '../common/i18n';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

interface MockMessage {
  id: string;
  role: 'user' | 'agent';
  content: string;
  timestamp: string;
  status?: 'sent' | 'delivered' | 'read';
  toolCall?: { name: string; args?: string };
}

const INITIAL_MESSAGES: MockMessage[] = [
  {
    id: '1',
    role: 'user',
    content: '你好，帮我写一篇 Q1 review',
    timestamp: '5m ago',
    status: 'read',
  },
  {
    id: '2',
    role: 'agent',
    content: '好的，先看下 Q1 数据，能给我对比基线吗？',
    timestamp: '5m ago',
  },
  {
    id: '3',
    role: 'user',
    content: '加上 Q4 数据对比',
    timestamp: '4m ago',
    status: 'read',
  },
  {
    id: '4',
    role: 'agent',
    content: 'reading docs/q1-data.md...',
    timestamp: '4m ago',
    toolCall: { name: 'fs.read', args: 'docs/q1-data.md' },
  },
  {
    id: '5',
    role: 'agent',
    content: '初稿已写好，重点突出三个增长点。',
    timestamp: '2m ago',
  },
];

const MOCK_AGENT = {
  id: 'agent-001',
  name: '写写',
  nameEn: 'Writer',
  role: '写手 · Writer',
  roleEn: 'Writer · Author',
  glyph: '写',
  glyphEn: 'W',
  status: 'online' as const,
  model: 'claude-sonnet-4',
  temp: 0.2,
  runs: 18,
  avgDuration: '2.4m',
  successRate: 0.94,
};

const MOCK_RECENT_RUNS: Array<{ when: string; what: string; ok: 'ok' | 'warn' | 'err' }> = [
  { when: '3m ago',  what: 'fs.write docs/q1-review.md', ok: 'ok' },
  { when: '1h ago',  what: 'fs.read  docs/q4-data.md',   ok: 'ok' },
  { when: 'yesterday', what: 'http.get notion.so/q1',    ok: 'warn' },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface BubbleProps {
  msg: MockMessage;
  T: (zh: string, en: string) => string;
  agentName: string;
  agentGlyph: string;
}

function MessageBubble({ msg, T, agentName, agentGlyph }: BubbleProps) {
  const isUser = msg.role === 'user';
  const rowStyle: CSSProperties = {
    display: 'flex',
    flexDirection: isUser ? 'row-reverse' : 'row',
    alignItems: 'flex-end',
    gap: 10,
    marginBottom: 12,
  };
  const bubbleStyle: CSSProperties = {
    maxWidth: '65%',
    padding: '10px 14px',
    borderRadius: isUser ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
    background: isUser ? 'var(--t-accent)' : 'var(--t-panel-2)',
    color: isUser ? 'var(--t-accent-ink)' : 'var(--t-fg)',
    fontSize: 13.5,
    lineHeight: 1.5,
    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
    border: isUser ? 'none' : '1px solid var(--t-border)',
    minWidth: 0,
    wordBreak: 'break-word',
  };
  const metaStyle: CSSProperties = {
    fontFamily: 'var(--font-mono)',
    fontSize: 9.5,
    color: 'var(--t-fg-4)',
    marginTop: 4,
    textAlign: isUser ? 'right' : 'left',
  };

  const statusGlyph = (s?: 'sent' | 'delivered' | 'read') => {
    if (!s) return '';
    if (s === 'sent') return '✓';
    if (s === 'delivered') return '✓✓';
    return '✓✓·';
  };

  return (
    <div style={rowStyle}>
      {/* avatar — only on agent side */}
      {!isUser && (
        <HfAvatar
          glyph={agentGlyph}
          color="var(--t-accent)"
          size={28}
        />
      )}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start', minWidth: 0, maxWidth: '70%' }}>
        {!isUser && (
          <span
            className="hf-meta"
            style={{ fontSize: 10, marginBottom: 3, color: 'var(--t-fg-3)' }}
          >
            {agentName}
          </span>
        )}
        <div style={bubbleStyle}>
          {msg.toolCall ? (
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: 'var(--t-fg-3)',
                background: 'var(--t-bg)',
                border: '1px dashed var(--t-border)',
                borderRadius: 6,
                padding: '6px 8px',
                marginBottom: 6,
                whiteSpace: 'pre-wrap',
                overflowWrap: 'anywhere',
              }}
            >
              <span style={{ color: 'var(--t-accent)' }}>&gt; </span>
              {msg.toolCall.name}
              {msg.toolCall.args ? `("${msg.toolCall.args}")` : '()'}
            </div>
          ) : null}
          {msg.content}
        </div>
        <span style={metaStyle}>
          {msg.timestamp}
          {isUser && msg.status ? ` · ${statusGlyph(msg.status)} ${T(
            msg.status === 'read' ? '已读' : msg.status === 'delivered' ? '已送达' : '已发送',
            msg.status.toUpperCase(),
          )}` : ''}
        </span>
      </div>
    </div>
  );
}

interface AgentCardProps {
  agent: typeof MOCK_AGENT;
  T: (zh: string, en: string) => string;
  language: 'zh' | 'en';
}

function AgentCard({ agent, T, language }: AgentCardProps) {
  const metricRow: CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '6px 0',
    borderBottom: '1px dashed var(--t-border)',
  };
  const metricLabel: CSSProperties = {
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    color: 'var(--t-fg-4)',
    letterSpacing: '.06em',
    textTransform: 'uppercase',
  };
  const metricValue: CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--t-fg)',
    fontVariantNumeric: 'tabular-nums',
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        padding: 18,
        height: '100%',
        overflow: 'auto',
      }}
    >
      {/* avatar + name block */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <HfAvatar
          glyph={language === 'zh' ? agent.glyph : agent.glyphEn}
          color="var(--t-accent)"
          size={80}
          status="ok"
        />
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t-fg)', marginBottom: 2 }}>
            {language === 'zh' ? agent.name : agent.nameEn}
          </div>
          <div className="hf-meta" style={{ fontSize: 11 }}>
            {language === 'zh' ? agent.role : agent.roleEn}
          </div>
        </div>
      </div>

      {/* metrics block */}
      <div>
        <div className="hf-label" style={{ marginBottom: 6 }}>
          {T('指标', 'METRICS')}
        </div>
        <div style={metricRow}>
          <span style={metricLabel}>{T('运行', 'RUNS')}</span>
          <span style={metricValue}>{agent.runs}</span>
        </div>
        <div style={metricRow}>
          <span style={metricLabel}>{T('平均耗时', 'AVG')}</span>
          <span style={metricValue}>{agent.avgDuration}</span>
        </div>
        <div style={metricRow}>
          <span style={metricLabel}>{T('成功率', 'SUCCESS')}</span>
          <span style={metricValue}>{Math.round(agent.successRate * 100)}%</span>
        </div>
        <div style={metricRow}>
          <span style={metricLabel}>{T('状态', 'STATUS')}</span>
          <span style={{ ...metricValue, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <HfDot color="var(--t-ok)" pulse size={7} />
            <span style={{ color: 'var(--t-ok)' }}>{T('在线', 'ONLINE')}</span>
          </span>
        </div>
      </div>

      {/* recent runs */}
      <div>
        <div className="hf-label" style={{ marginBottom: 8 }}>
          {T('最近运行', 'RECENT RUNS')}
        </div>
        {MOCK_RECENT_RUNS.map((r, i) => (
          <div
            key={`${r.when}-${i}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 0',
              borderBottom: '1px dashed var(--t-border)',
            }}
          >
            <HfDot color={`var(--t-${r.ok})`} size={6} />
            <span
              className="hf-mono"
              style={{
                fontSize: 10,
                color: 'var(--t-fg-3)',
                flex: 1,
                minWidth: 0,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {r.what}
            </span>
            <span className="hf-meta" style={{ fontSize: 9 }}>
              {r.when}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function AgentDMPage() {
  const { agentId } = useParams<{ agentId: string }>();
  const agentDMs = useInboxStore((s) => s.agentDMs);
  const agentMeta = agentDMs.find((a) => a.agentId === agentId);
  const agentName = agentMeta?.agentName ?? agentId ?? '';
  const { language } = useI18n();
  const T = (zh: string, en: string) => (language === 'zh' ? zh : en);

  // Compose displayed agent profile: prefer real inbox-store metadata, fall
  // back to mock fixture (`agent-001` via test, or no agentId).
  const displayAgent = useMemo(() => {
    if (agentMeta?.agentName) {
      return {
        ...MOCK_AGENT,
        id: agentMeta.agentId,
        name: agentMeta.agentName,
        nameEn: agentMeta.agentName,
        glyph: Array.from(agentMeta.agentName)[0] ?? MOCK_AGENT.glyph,
        glyphEn: (Array.from(agentMeta.agentName)[0] ?? MOCK_AGENT.glyphEn).toUpperCase(),
      };
    }
    if (agentId) {
      return { ...MOCK_AGENT, id: agentId };
    }
    return MOCK_AGENT;
  }, [agentMeta, agentId]);

  const builderUrl = buildAgentDMBuilderUrl({
    agentId: agentId ?? '',
    agentName,
  });

  // ---- Composer + mock message stream ------------------------------------
  const [messages, setMessages] = useState<MockMessage[]>(INITIAL_MESSAGES);
  const [draft, setDraft] = useState('');
  const streamRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      const node = streamRef.current;
      if (node) node.scrollTop = node.scrollHeight;
    });
  };

  const sendMessage = () => {
    const text = draft.trim();
    if (!text) return;
    const newMsg: MockMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: T('刚刚', 'just now'),
      status: 'sent',
    };
    setMessages((prev) => [...prev, newMsg]);
    setDraft('');
    scrollToBottom();
    // Simulated agent reply (mock-only) so the page feels alive.
    window.setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'agent',
          content: T('收到，我来处理。', 'Got it, on it.'),
          timestamp: T('刚刚', 'just now'),
        },
      ]);
      scrollToBottom();
    }, 700);
  };

  const onComposerKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Cmd/Ctrl + Enter or plain Enter (no shift) to send.
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      sendMessage();
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // ------------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------------

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        background: 'var(--t-bg)',
        color: 'var(--t-fg)',
      }}
    >
      <HfTopBar
        right={
          <CreateAgentButton
            label="创建类似 Agent"
            builderUrl={builderUrl}
          />
        }
      />

      {/* Hidden BreadcrumbBar so existing AgentDMPage tests still find the
          breadcrumb landmark + agent-name text. */}
      <div
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          overflow: 'hidden',
          clip: 'rect(0 0 0 0)',
        }}
      >
        <BreadcrumbBar label={agentName} />
      </div>

      {/* Agent header bar — 60px, kind/status mono strip preserved for tests */}
      <div
        style={{
          height: 60,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          padding: '0 22px',
          borderBottom: '1px solid var(--t-border)',
          background: 'var(--t-panel)',
        }}
      >
        <HfAvatar
          glyph={language === 'zh' ? displayAgent.glyph : displayAgent.glyphEn}
          color="var(--t-accent)"
          size={36}
          status="ok"
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--t-fg)' }}>
              {language === 'zh' ? displayAgent.name : displayAgent.nameEn}
            </span>
            <HfDot color="var(--t-ok)" pulse size={7} />
            <span
              className="hf-mono"
              style={{ fontSize: 10, color: 'var(--t-ok)', letterSpacing: '.08em', textTransform: 'uppercase' }}
            >
              {T('在线', 'online')}
            </span>
          </div>
          {agentMeta ? (
            <div className="hf-mono" style={{ fontSize: 10, color: 'var(--t-fg-4)' }}>
              kind: {agentMeta.kind} · status: {agentMeta.status} · {displayAgent.model} · t={displayAgent.temp}
            </div>
          ) : (
            <div className="hf-mono" style={{ fontSize: 10, color: 'var(--t-fg-4)' }}>
              {language === 'zh' ? displayAgent.role : displayAgent.roleEn} · {displayAgent.model} · t={displayAgent.temp}
            </div>
          )}
        </div>
      </div>

      {/* Body: 2-column grid (message stream | agent card) */}
      <div
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: '1fr 280px',
          minHeight: 0,
        }}
      >
        {/* --- Center: message stream + composer ---------------------------- */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            minWidth: 0,
            minHeight: 0,
            borderRight: '1px solid var(--t-border)',
          }}
        >
          {/* message stream */}
          <div
            ref={streamRef}
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '20px 28px',
              minHeight: 0,
            }}
          >
            {messages.map((m) => (
              <MessageBubble
                key={m.id}
                msg={m}
                T={T}
                agentName={language === 'zh' ? displayAgent.name : displayAgent.nameEn}
                agentGlyph={language === 'zh' ? displayAgent.glyph : displayAgent.glyphEn}
              />
            ))}
          </div>

          {/* composer */}
          <div
            style={{
              flexShrink: 0,
              borderTop: '1px solid var(--t-border)',
              padding: '12px 20px',
              background: 'var(--t-panel)',
              display: 'flex',
              alignItems: 'flex-end',
              gap: 10,
            }}
          >
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onComposerKeyDown}
              placeholder={T(
                `发消息给 ${language === 'zh' ? displayAgent.name : displayAgent.nameEn} ...`,
                `Message ${displayAgent.nameEn} ...`,
              )}
              rows={1}
              aria-label={T('单聊输入框', 'DM composer')}
              style={{
                flex: 1,
                minHeight: 38,
                maxHeight: 120,
                padding: '9px 12px',
                resize: 'none',
                border: '1px solid var(--t-border)',
                borderRadius: 10,
                background: 'var(--t-bg)',
                color: 'var(--t-fg)',
                fontFamily: 'inherit',
                fontSize: 13,
                lineHeight: 1.4,
                outline: 'none',
              }}
              onFocus={(e) => {
                (e.currentTarget as HTMLTextAreaElement).style.borderColor = 'var(--t-accent)';
              }}
              onBlur={(e) => {
                (e.currentTarget as HTMLTextAreaElement).style.borderColor = 'var(--t-border)';
              }}
            />
            <button
              type="button"
              onClick={sendMessage}
              disabled={!draft.trim()}
              aria-label={T('发送', 'Send')}
              style={{
                height: 38,
                padding: '0 14px',
                borderRadius: 10,
                border: '1px solid var(--t-accent)',
                background: draft.trim() ? 'var(--t-accent)' : 'var(--t-panel-2)',
                color: draft.trim() ? 'var(--t-accent-ink)' : 'var(--t-fg-4)',
                fontSize: 12,
                fontWeight: 700,
                cursor: draft.trim() ? 'pointer' : 'not-allowed',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                transition: 'background 120ms ease, color 120ms ease',
              }}
            >
              <span>{T('发送', 'Send')}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, opacity: 0.7 }}>
                ⌘⏎
              </span>
            </button>
          </div>
        </div>

        {/* --- Right: agent card ------------------------------------------- */}
        <div
          style={{
            background: 'var(--t-panel)',
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
          <AgentCard agent={displayAgent} T={T} language={language as 'zh' | 'en'} />
        </div>
      </div>

      {/* Phase-2 marker — kept visible (smaller) so /agent-dm/:agentId is
          obviously the new mock view; also satisfies existing test that asserts
          on the placeholder string. */}
      <div
        aria-hidden="false"
        style={{
          position: 'absolute',
          right: 14,
          bottom: 12,
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          letterSpacing: '.08em',
          color: 'var(--t-fg-5)',
          textTransform: 'uppercase',
          pointerEvents: 'none',
          opacity: 0.7,
        }}
      >
        DM · phase 2 mock
      </div>
    </div>
  );
}
