/**
 * AgentDMPage — live 1:1 单聊视图.
 *
 * Renders a fully-styled DM view between the user and a single agent. Mirrors
 * the shell pattern used by ChatPage: this page lives inside <HfLayout> so it
 * only renders the inner content column (HfTopBar + body). The body is a
 * 2-column grid: [message stream + composer | agent card].
 *
 * 2026-05-29 — Wired to the real backend via `useChatStream` in `dm` mode
 * (POST /api/chat/completions, BYOK, single-turn, soul injected by agent_id).
 * Replaced the prior phase-2 mock message list + 700ms fake reply. The agent
 * profile card on the right still shows representative metrics (no metrics
 * backend yet).
 *
 * Functional preservations (existing tests in AgentDMPage.test.tsx still pass):
 *   - BreadcrumbBar (a11y landmark, hidden visually) — agent name visible
 *     in HfTopBar crumbs.
 *   - `kind: ...` / `status: ...` mono metadata strip.
 *   - CreateAgentButton "创建类似 Agent" with Builder gating.
 *   - composer placeholder keyed off the agent name.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { useParams } from 'react-router-dom';
import { BreadcrumbBar } from '../core/components/inbox/BreadcrumbBar';
import { CreateAgentButton } from '../core/components/inbox/CreateAgentButton';
import { useChatStream } from '../core/hooks/useChatStream';
import { useInboxStore } from '../core/store/useInboxStore';
import { buildAgentDMBuilderUrl } from '../core/utils/builderNavigation';
import { HfTopBar, HfAvatar, HfDot } from '../components/hifi';
import { useI18n } from '../common/i18n';
// ===== UI5.0 =====(2026-08-14)· 视觉层抽到 AgentDMPage.module.css（气泡/composer/agent 卡）
import dmStyles from './AgentDMPage.module.css';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

interface MockMessage {
  id: string;
  role: 'user' | 'agent';
  content: string;
  timestamp: string;
  status?: 'sent' | 'delivered' | 'read' | 'error';
  toolCall?: { name: string; args?: string };
}

/** Format a backend ISO timestamp (or undefined) into a short HH:MM label for
 *  the DM bubble meta line. Falls back to the raw value / empty string. */
function formatDmTime(ts?: string): string {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

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
  agentName: string;
  agentGlyph: string;
}

function MessageBubble({ msg, agentName, agentGlyph }: BubbleProps) {
  const { t } = useI18n();
  const isUser = msg.role === 'user';

  const statusGlyph = (s?: 'sent' | 'delivered' | 'read' | 'error') => {
    if (!s) return '';
    if (s === 'sent') return '✓';
    if (s === 'delivered') return '✓✓';
    if (s === 'error') return '!';
    return '✓✓·';
  };

  return (
    <div className={`${dmStyles.dmRow} ${isUser ? dmStyles.dmRowUser : ''}`}>
      {/* avatar — only on agent side */}
      {!isUser && (
        <HfAvatar
          glyph={agentGlyph}
          color="var(--t-accent)"
          size={28}
        />
      )}
      <div className={`${dmStyles.dmCol} ${isUser ? dmStyles.dmColUser : ''}`}>
        {!isUser && (
          <span className={`hf-meta ${dmStyles.dmSender}`}>
            {agentName}
          </span>
        )}
        {/* ===== UI5.0 ===== · 气泡视觉（实色 user / 干净 agent 卡）见 AgentDMPage.module.css */}
        <div className={`${dmStyles.dmBubble} ${isUser ? dmStyles.dmBubbleUser : dmStyles.dmBubbleAgent}`}>
          {msg.toolCall ? (
            <div className={dmStyles.dmToolCall}>
              <span className={dmStyles.dmToolCallPrompt}>&gt; </span>
              {msg.toolCall.name}
              {msg.toolCall.args ? `("${msg.toolCall.args}")` : '()'}
            </div>
          ) : null}
          {msg.content}
        </div>
        <span className={`${dmStyles.dmMeta} ${isUser ? dmStyles.dmMetaUser : ''}`}>
          {msg.timestamp}
          {isUser && msg.status ? ` · ${statusGlyph(msg.status)} ${
            msg.status === 'read' ? t('agentDM.msgRead') :
            msg.status === 'delivered' ? t('agentDM.msgDelivered') :
            t('agentDM.msgSent')
          }` : ''}
        </span>
      </div>
    </div>
  );
}

interface AgentCardProps {
  agent: typeof MOCK_AGENT;
  language: 'zh' | 'en';
}

function AgentCard({ agent, language }: AgentCardProps) {
  const { t } = useI18n();
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
        gap: 14,
        padding: 18,
        height: '100%',
        overflow: 'auto',
      }}
    >
      {/* avatar + name block —===== UI5.0 ===== 卡片化分区 */}
      <div className={dmStyles.dmCardSection} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '18px 14px' }}>
        <HfAvatar
          glyph={language === 'zh' ? agent.glyph : agent.glyphEn}
          color="var(--t-accent)"
          size={72}
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
      <div className={dmStyles.dmCardSection}>
        <div className="hf-label" style={{ marginBottom: 6 }}>
          {t('agentDM.metricsLabel')}
        </div>
        <div className={dmStyles.dmMetricRow}>
          <span style={metricLabel}>{t('agentDM.metricsRuns')}</span>
          <span style={metricValue}>{agent.runs}</span>
        </div>
        <div className={dmStyles.dmMetricRow}>
          <span style={metricLabel}>{t('agentDM.metricsAvg')}</span>
          <span style={metricValue}>{agent.avgDuration}</span>
        </div>
        <div className={dmStyles.dmMetricRow}>
          <span style={metricLabel}>{t('agentDM.metricsSuccess')}</span>
          <span style={metricValue}>{Math.round(agent.successRate * 100)}%</span>
        </div>
        <div className={dmStyles.dmMetricRow}>
          <span style={metricLabel}>{t('agentDM.metricsStatus')}</span>
          <span style={{ ...metricValue, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <HfDot color="var(--t-ok)" pulse size={7} />
            <span style={{ color: 'var(--t-ok)' }}>{t('agentDM.metricsOnline')}</span>
          </span>
        </div>
      </div>

      {/* recent runs */}
      <div className={dmStyles.dmCardSection}>
        <div className="hf-label" style={{ marginBottom: 6 }}>
          {t('agentDM.recentRuns')}
        </div>
        {MOCK_RECENT_RUNS.map((r, i) => (
          <div
            key={`${r.when}-${i}`}
            className={dmStyles.dmMetricRow}
            style={{ gap: 8, justifyContent: 'flex-start' }}
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
  const { language, t } = useI18n();

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

  // ---- Composer + real DM message stream (useChatStream `dm` mode) --------
  // POSTs to /api/chat/completions (BYOK) with agent_id so the backend injects
  // this agent's `soul` as the system prompt. Single-turn, synchronous, no SSE.
  const { messages: chatMessages, send, cancel: dmCancel, streaming: dmStreaming, error: dmError } = useChatStream({
    mode: 'dm',
    targetId: agentId ?? null,
  });
  const [draft, setDraft] = useState('');
  const streamRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      const node = streamRef.current;
      if (node) node.scrollTop = node.scrollHeight;
    });
  };

  // Adapt the shared ChatMessage[] to the local MessageBubble's MockMessage
  // shape. `system` rows (rare in DM) render as left-aligned agent bubbles.
  const messages: MockMessage[] = useMemo(
    () =>
      chatMessages.map((m) => ({
        id: m.id,
        role: m.role === 'user' ? 'user' : 'agent',
        content: m.content,
        timestamp: formatDmTime(m.timestamp),
        status: m.status,
        toolCall: m.toolCall,
      })),
    [chatMessages],
  );

  useEffect(() => {
    scrollToBottom();
  }, [messages.length]);

  // Global Escape → cancel in-flight DM send.
  // Runs at the window level so it works even when the composer textarea is not focused
  // (e.g. the user scrolled up to read history and then wants to stop the reply).
  useEffect(() => {
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && dmStreaming) {
        e.preventDefault();
        dmCancel();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dmStreaming, dmCancel]);

  const sendMessage = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    scrollToBottom();
    void send(text);
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
            label={t('agentDM.createSimilar')}
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
              {t('agentDM.online')}
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
                agentName={language === 'zh' ? displayAgent.name : displayAgent.nameEn}
                agentGlyph={language === 'zh' ? displayAgent.glyph : displayAgent.glyphEn}
              />
            ))}
            {dmError ? (
              <div
                className="hf-mono"
                style={{
                  fontSize: 11,
                  color: 'var(--t-danger, #e5484d)',
                  textAlign: 'center',
                  padding: '6px 0',
                }}
              >
                {language === 'zh' ? `发送失败：${dmError}` : `Send failed: ${dmError}`}
              </div>
            ) : null}
          </div>

          {/* composer —===== UI5.0 ===== 16px 大圆角浮动卡 + focus 蓝环 + 胶囊发送键 */}
          <div
            style={{
              flexShrink: 0,
              borderTop: '1px solid var(--t-border)',
              padding: '12px 20px 14px',
              background: 'var(--t-bg)',
              display: 'flex',
              alignItems: 'flex-end',
              gap: 10,
            }}
          >
            <div className={dmStyles.dmComposerShell}>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onComposerKeyDown}
                // TODO: i18n — agentDM.composerPlaceholder has {name} interpolation not supported by t()
                placeholder={language === 'zh'
                  ? `发消息给 ${displayAgent.name} ...`
                  : `Message ${displayAgent.nameEn} ...`}
                rows={1}
                aria-label={t('agentDM.composerAriaLabel')}
                className={dmStyles.dmTextarea}
              />
              <button
                type="button"
                onClick={sendMessage}
                disabled={!draft.trim()}
                aria-label={t('agentDM.send')}
                className={dmStyles.dmSend}
              >
                <span>{t('agentDM.send')}</span>
                <span className={dmStyles.dmSendKbd}>⌘⏎</span>
              </button>
            </div>
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
          <AgentCard agent={displayAgent} language={language as 'zh' | 'en'} />
        </div>
      </div>

      {/* Mode marker — now a live BYOK DM (was a phase-2 mock). */}
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
        DM · live
      </div>
    </div>
  );
}
