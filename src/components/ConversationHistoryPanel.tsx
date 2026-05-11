/**
 * ConversationHistoryPanel — Story 15.24
 *
 * Middle column of the `/projects` page. Lists every Conversation under a
 * given project (newest first). Clicking a conversation row toggles an
 * accordion that lazy-loads the message timeline and renders each message
 * with role badge, content, run_id chip (clickable → /run-session/:run_id),
 * and a relative timestamp.
 *
 * The component does NOT use markdown rendering for message content — to keep
 * the surface dependency-free, content is shown as a clamped <pre> block; the
 * full content is exposed via the native title attribute. A future Story can
 * upgrade to react-markdown without changing this component's shape.
 */

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, MessageSquare, Plus } from 'lucide-react';
import {
  listConversations,
  createConversation,
  listMessages,
  type ConversationRecord,
  type MessageRecord,
} from '../api/conversations';
import { useI18n } from '../common/i18n';

export interface ConversationHistoryPanelProps {
  projectId: string;
}

function formatRelative(iso: string): string {
  try {
    const then = new Date(iso).getTime();
    const now = Date.now();
    const diff = Math.max(0, now - then) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  } catch {
    return iso;
  }
}

const ROLE_COLORS: Record<MessageRecord['role'], { bg: string; fg: string; label: string }> = {
  user: { bg: 'rgba(99,102,241,0.18)', fg: '#a5b4fc', label: 'user' },
  assistant: { bg: 'rgba(34,197,94,0.18)', fg: '#86efac', label: 'assistant' },
  system: { bg: 'rgba(148,163,184,0.18)', fg: '#cbd5e1', label: 'system' },
};

const PANEL_STYLE: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  background: 'var(--t-bg)',
  borderRight: '1px solid var(--t-border)',
  overflow: 'hidden',
};

const HEADER_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '14px 14px 8px',
  borderBottom: '1px solid var(--t-border)',
};

const TITLE_STYLE: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.14em',
  color: 'var(--t-fg-2)',
  textTransform: 'uppercase',
};

const NEW_BTN_STYLE: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '4px 8px',
  borderRadius: 6,
  border: '1px solid var(--t-border)',
  background: 'var(--t-panel)',
  color: 'var(--t-fg-2)',
  fontSize: 11,
  cursor: 'pointer',
};

const LIST_STYLE: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '6px',
};

const EMPTY_STYLE: React.CSSProperties = {
  padding: '32px 16px',
  textAlign: 'center',
  fontSize: 12,
  color: 'var(--t-fg-4)',
  lineHeight: 1.6,
};

export function ConversationHistoryPanel({ projectId }: ConversationHistoryPanelProps) {
  const { t } = useI18n();
  const [conversations, setConversations] = useState<ConversationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [messagesById, setMessagesById] = useState<Record<string, MessageRecord[]>>({});
  const [loadingMessages, setLoadingMessages] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setExpandedId(null);
    setMessagesById({});
    listConversations(projectId)
      .then((list) => {
        if (!cancelled) setConversations(list);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'load failed');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  async function expand(cid: string) {
    if (expandedId === cid) {
      setExpandedId(null);
      return;
    }
    setExpandedId(cid);
    if (!messagesById[cid]) {
      setLoadingMessages(cid);
      try {
        const m = await listMessages(cid);
        setMessagesById((prev) => ({ ...prev, [cid]: m }));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'load messages failed');
      } finally {
        setLoadingMessages(null);
      }
    }
  }

  async function handleNew() {
    setCreating(true);
    try {
      const c = await createConversation(projectId);
      setConversations((prev) => [c, ...prev]);
      setExpandedId(c.conversation_id);
      setMessagesById((prev) => ({ ...prev, [c.conversation_id]: [] }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'create failed');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div style={PANEL_STYLE} data-testid="conversation-history-panel">
      <div style={HEADER_STYLE}>
        <span style={TITLE_STYLE}>{t('projects.conversations.title')}</span>
        <button
          type="button"
          onClick={handleNew}
          disabled={creating}
          style={NEW_BTN_STYLE}
          data-testid="conversation-new-btn"
        >
          <Plus size={12} strokeWidth={1.75} aria-hidden /> {t('common.new')}
        </button>
      </div>

      <div style={LIST_STYLE}>
        {loading ? (
          <div style={EMPTY_STYLE}>{t('common.loading')}</div>
        ) : error ? (
          <div style={{ ...EMPTY_STYLE, color: '#fca5a5' }} role="alert">
            {error}
          </div>
        ) : conversations.length === 0 ? (
          <div style={EMPTY_STYLE} data-testid="conversation-history-empty">
            {t('projects.conversations.empty')}
          </div>
        ) : (
          conversations.map((c) => {
            const isOpen = expandedId === c.conversation_id;
            const title =
              c.title && c.title.trim().length > 0
                ? c.title
                : `Conversation ${c.conversation_id.slice(0, 8)}`;
            const messages = messagesById[c.conversation_id] ?? [];
            return (
              <div
                key={c.conversation_id}
                style={{
                  marginBottom: 6,
                  border: '1px solid var(--t-border)',
                  borderRadius: 8,
                  background: isOpen ? 'var(--t-panel)' : 'transparent',
                }}
              >
                <div
                  onClick={() => expand(c.conversation_id)}
                  role="button"
                  tabIndex={0}
                  data-testid={`conversation-row-${c.conversation_id}`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      expand(c.conversation_id);
                    }
                  }}
                  style={{
                    padding: '10px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    cursor: 'pointer',
                    fontSize: 12,
                    color: 'var(--t-fg)',
                  }}
                >
                  <MessageSquare
                    size={14}
                    strokeWidth={1.75}
                    aria-hidden
                    style={{ color: 'var(--t-fg-3)', flexShrink: 0 }}
                  />
                  <span
                    style={{
                      flex: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      fontWeight: isOpen ? 600 : 500,
                    }}
                  >
                    {title}
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10,
                      color: 'var(--t-fg-4)',
                      flexShrink: 0,
                    }}
                    title={c.updated_at}
                  >
                    {formatRelative(c.updated_at)}
                  </span>
                </div>
                {isOpen && (
                  <div
                    style={{
                      borderTop: '1px solid var(--t-border)',
                      padding: '8px 12px',
                      background: 'var(--t-bg)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                    }}
                    data-testid={`conversation-messages-${c.conversation_id}`}
                  >
                    {loadingMessages === c.conversation_id ? (
                      <div style={{ fontSize: 11, color: 'var(--t-fg-4)' }}>
                        {t('common.loading')}
                      </div>
                    ) : messages.length === 0 ? (
                      <div style={{ fontSize: 11, color: 'var(--t-fg-4)' }}>
                        {t('projects.messages.empty')}
                      </div>
                    ) : (
                      messages.map((m) => {
                        const role = ROLE_COLORS[m.role];
                        return (
                          <div
                            key={m.message_id}
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 4,
                              padding: '6px 8px',
                              borderRadius: 6,
                              background: 'rgba(255,255,255,0.02)',
                              border: '1px solid var(--t-border)',
                            }}
                            data-testid={`message-${m.message_id}`}
                          >
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                fontSize: 10,
                              }}
                            >
                              <span
                                style={{
                                  display: 'inline-block',
                                  padding: '1px 6px',
                                  borderRadius: 4,
                                  background: role.bg,
                                  color: role.fg,
                                  fontWeight: 700,
                                  fontFamily: 'var(--font-mono)',
                                  letterSpacing: '0.06em',
                                  textTransform: 'uppercase',
                                }}
                              >
                                {role.label}
                              </span>
                              <span
                                style={{ color: 'var(--t-fg-4)' }}
                                title={m.created_at}
                              >
                                {formatRelative(m.created_at)}
                              </span>
                              {m.run_id && (
                                <Link
                                  to={`/run-session/${m.run_id}`}
                                  data-testid={`message-runid-${m.message_id}`}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 3,
                                    padding: '1px 6px',
                                    borderRadius: 4,
                                    background: 'rgba(124,58,237,0.18)',
                                    color: '#c4b5fd',
                                    fontFamily: 'var(--font-mono)',
                                    fontSize: 9,
                                    textDecoration: 'none',
                                  }}
                                  title={m.run_id}
                                >
                                  run <ExternalLink size={9} strokeWidth={2} aria-hidden />
                                </Link>
                              )}
                            </div>
                            <pre
                              title={m.content}
                              style={{
                                margin: 0,
                                fontSize: 11.5,
                                color: 'var(--t-fg)',
                                fontFamily: 'inherit',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                                maxHeight: 200,
                                overflow: 'auto',
                              }}
                            >
                              {m.content}
                            </pre>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default ConversationHistoryPanel;
