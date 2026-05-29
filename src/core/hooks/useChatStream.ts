/**
 * useChatStream — unified chat data hook for both group rooms and 1:1 agent DMs.
 *
 * Backend touchpoints (verified against `docs/design/phase-2-backend-frontend-audit.md`
 * + `shadowflow/server.py` / `shadowflow/api/groups.py` at audit-time):
 *
 *   group mode:
 *     - GET  /api/groups/{id}/messages?limit=50           — history (MessageItem[])
 *     - POST /chat/sessions/{id}/messages                 — send (ChatTurnResult)
 *     - GET  /workflow/runs/{run_id}/events  (optional)   — live SSE
 *
 *   dm mode:
 *     - POST /api/chat/completions  (BYOK via `src/api/chat.ts`) — single-turn
 *
 * The contract intentionally hides which path is taken so pages (ChatPage,
 * AgentDMPage) stay agnostic. If any backend call fails the hook falls back
 * to a small mock conversation so the UI never goes blank — failures surface
 * in `error` for an optional banner.
 *
 * NOTE: PB landed `ChatMessage` in `src/core/components/chat/ChatStream.tsx`;
 * we re-export that type so callers don't have to import two places.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { chatCompletion } from '../../api/chat';
import { fetchRecentMessages, postGroupMessage } from '../../api/groupApi';
import { startSseClient, type SseClientHandle } from '../../api/sseClient';
import type { Message as InboxMessage } from '../../common/types/inbox';
import type { ChatMessage } from '../components/chat/ChatStream';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ChatStreamMode = 'group' | 'dm';
export type ChatSseChannel = 'workflow' | 'approvals' | 'group' | 'none';

export interface UseChatStreamOptions {
  /** group → /api/groups/{id}/messages + /chat/sessions/{id}/messages
   *  dm    → BYOK /api/chat/completions */
  mode: ChatStreamMode;
  /** group_id (group mode) or agent_id (dm mode). `null` keeps the hook idle. */
  targetId: string | null;
  /** Optional run_id for the workflow SSE channel — only used when `sseChannel === 'workflow'`. */
  runId?: string;
  /** SSE channel selector. Defaults to 'none' to avoid surprise sockets. */
  sseChannel?: ChatSseChannel;
  /** History page size for `mode === 'group'`. Defaults to 50. */
  historyLimit?: number;
  /**
   * 2026-05-29 · ModelPicker 选择，group 模式 send 时透传给 postGroupMessage →
   * Node 网关据此用 cli:* / byok:* executor 生成回复。
   */
  executor?: string;
  model?: string;
}

export interface UseChatStreamResult {
  messages: ChatMessage[];
  loading: boolean;
  error: string | null;
  /** True while the SSE connection is open. */
  streaming: boolean;
  /** Send a user message → optimistic append + assistant reply. */
  send: (content: string) => Promise<void>;
  /** Force-reload history from the backend. */
  refresh: () => Promise<void>;
}

// Re-export so consumers only need `useChatStream`'s module
export type { ChatMessage } from '../components/chat/ChatStream';

// ---------------------------------------------------------------------------
// Mock fallback (UI never goes blank when the backend is unreachable)
// ---------------------------------------------------------------------------

function buildMockConversation(mode: ChatStreamMode): ChatMessage[] {
  const now = new Date().toISOString();
  const senderName = mode === 'group' ? 'Atlas' : 'Agent';
  return [
    {
      id: 'mock-sys-1',
      role: 'system',
      content: 'offline · mock conversation',
      timestamp: now,
    },
    {
      id: 'mock-1',
      role: 'agent',
      content:
        mode === 'group'
          ? 'Welcome to the group. Backend stream is unreachable; showing a placeholder thread.'
          : 'Hi — backend chat is unreachable. Showing a placeholder so the UI stays usable.',
      timestamp: now,
      senderName,
      senderGlyph: senderName.charAt(0),
    },
    {
      id: 'mock-2',
      role: 'user',
      content: 'Got it. I will retry once the backend is back.',
      timestamp: now,
      status: 'sent',
    },
    {
      id: 'mock-3',
      role: 'agent',
      content: 'No rush — every send is queued client-side until then.',
      timestamp: now,
      senderName,
      senderGlyph: senderName.charAt(0),
    },
    {
      id: 'mock-4',
      role: 'system',
      content: 'mock — connect the API server to load real messages',
      timestamp: now,
    },
  ];
}

// ---------------------------------------------------------------------------
// Conversion helpers
// ---------------------------------------------------------------------------

function inboxRoleToChatRole(senderKind: string | undefined): ChatMessage['role'] {
  if (senderKind === 'agent') return 'agent';
  if (senderKind === 'user' || senderKind === 'human') return 'user';
  return 'system';
}

function inboxToChat(item: InboxMessage, idx: number): ChatMessage {
  // 2026-05-29 · Stream M — 优先用后端真实 message_id 当 id（reactions/pin 动作要靠
  // 它定位消息）。老消息缺 message_id 时退回合成 id。
  const id =
    item.message_id ??
    (item as InboxMessage & { id?: string }).id ??
    `gmsg-${item.timestamp}-${idx}`;
  return {
    id,
    role: inboxRoleToChatRole(item.sender_kind),
    content: item.content ?? '',
    timestamp: item.timestamp,
    senderName: item.sender_name,
    senderGlyph: (item.sender_name ?? '?').charAt(0).toUpperCase(),
    reactions: item.reactions,
    pinned: item.pinned,
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useChatStream(options: UseChatStreamOptions): UseChatStreamResult {
  const { mode, targetId, runId, sseChannel = 'none', historyLimit = 50, executor, model } = options;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);

  // ---- internal refs --------------------------------------------------------
  const sseHandleRef = useRef<SseClientHandle | null>(null);
  // Track the latest target so async fetches don't write into a switched-away view
  const activeTargetRef = useRef<string | null>(targetId);
  activeTargetRef.current = targetId;

  // ---- history loading ------------------------------------------------------
  const loadHistory = useCallback(async () => {
    if (!targetId) {
      setMessages([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (mode === 'group') {
        const items = await fetchRecentMessages(targetId, historyLimit);
        if (activeTargetRef.current !== targetId) return;
        const converted = items.map((m, i) => inboxToChat(m, i));
        setMessages(converted);
      } else {
        // DM history endpoint isn't part of MVP — start fresh; chatCompletion is single-turn.
        setMessages([]);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'history fetch failed';
      // eslint-disable-next-line no-console
      console.warn('[useChatStream] history fetch failed → mock fallback:', msg);
      setError(msg);
      setMessages(buildMockConversation(mode));
    } finally {
      setLoading(false);
    }
  }, [mode, targetId, historyLimit]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  // ---- SSE subscription -----------------------------------------------------
  useEffect(() => {
    if (sseChannel === 'none') return;

    let url: string | null = null;
    if (sseChannel === 'workflow' && runId) {
      url = `/workflow/runs/${encodeURIComponent(runId)}/events`;
    } else if (sseChannel === 'approvals') {
      url = `/api/approvals/events`;
    } else if (sseChannel === 'group' && targetId) {
      // Real-time push of async chat-bridge agent replies for this group.
      url = `/api/groups/${encodeURIComponent(targetId)}/events`;
    }
    if (!url) return;

    let alive = true;
    setStreaming(true);

    try {
      const handle = startSseClient({
        url,
        onEvent: (eventType, data) => {
          if (!alive) return;
          const payload = (data ?? {}) as Record<string, unknown>;

          // agent.message / agent.complete → append assistant bubble
          if (eventType === 'agent.message' || eventType === 'agent.complete') {
            const content = String(payload.content ?? payload.message ?? '');
            if (!content) return;
            const senderName = (payload.sender_name as string) ?? (payload.agent_name as string) ?? 'Agent';
            const msgId = String(payload.message_id ?? `sse-${Date.now()}`);
            setMessages((prev) => {
              // Dedup — the same agent reply can arrive both via SSE and a
              // later history refresh; key off the backend message_id.
              if (payload.message_id && prev.some((m) => m.id === msgId)) {
                return prev;
              }
              return [
                ...prev,
                {
                  id: msgId,
                  role: 'agent',
                  content,
                  timestamp:
                    (payload.timestamp as string) ?? new Date().toISOString(),
                  senderName,
                  senderGlyph: senderName.charAt(0).toUpperCase(),
                  streaming: eventType === 'agent.message' && payload.streaming === true,
                },
              ];
            });
            return;
          }

          // system.notice → centered system row (chat-bridge feedback, e.g.
          // missing BYOK key or a dangling agent member).
          if (eventType === 'system.notice') {
            const content = String(payload.content ?? '');
            if (!content) return;
            const msgId = String(payload.message_id ?? `sse-sys-${Date.now()}`);
            setMessages((prev) => {
              if (payload.message_id && prev.some((m) => m.id === msgId)) {
                return prev;
              }
              return [
                ...prev,
                {
                  id: msgId,
                  role: 'system',
                  content,
                  timestamp:
                    (payload.timestamp as string) ?? new Date().toISOString(),
                },
              ];
            });
            return;
          }

          // agent.tool_call → inset bubble
          if (eventType === 'agent.tool_call') {
            const name = String(payload.name ?? payload.tool ?? 'tool');
            const args = payload.args !== undefined ? String(payload.args) : '';
            const senderName = (payload.sender_name as string) ?? 'Agent';
            setMessages((prev) => [
              ...prev,
              {
                id: `tool-${Date.now()}-${prev.length}`,
                role: 'agent',
                content: '',
                timestamp: new Date().toISOString(),
                senderName,
                senderGlyph: senderName.charAt(0).toUpperCase(),
                toolCall: { name, args },
              },
            ]);
            return;
          }
        },
        onError: () => {
          // EventSource auto-reconnects; we only flip streaming false on hard close.
          if (!alive) return;
          // eslint-disable-next-line no-console
          console.warn('[useChatStream] SSE error — relying on browser reconnect');
        },
      });
      sseHandleRef.current = handle;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[useChatStream] SSE setup failed:', err);
      setStreaming(false);
    }

    return () => {
      alive = false;
      setStreaming(false);
      sseHandleRef.current?.close();
      sseHandleRef.current = null;
    };
  }, [sseChannel, runId, targetId]);

  // ---- send -----------------------------------------------------------------
  const send = useCallback(
    async (content: string) => {
      const text = content.trim();
      if (!text || !targetId) return;

      const optimisticId = `local-${Date.now()}`;
      const optimistic: ChatMessage = {
        id: optimisticId,
        role: 'user',
        content: text,
        timestamp: new Date().toISOString(),
        status: 'sent',
      };
      setMessages((prev) => [...prev, optimistic]);
      setError(null);

      try {
        if (mode === 'group') {
          // Persist the user message to the group's log on the Python backend.
          // The backend chat-bridge then dispatches agent replies asynchronously
          // and pushes them back over the group SSE channel (sseChannel:'group'),
          // so we do NOT append the reply here — the SSE handler does.
          await postGroupMessage(targetId, text, { senderName: 'user', senderKind: 'user', executor, model });
          setMessages((prev) =>
            prev.map((m) => (m.id === optimisticId ? { ...m, status: 'delivered' as const } : m)),
          );
          return;
        }

        // ---- dm mode: BYOK chat completion ---------------------------------
        const reply = await chatCompletion({
          messages: [{ role: 'user', content: text }],
          agent_id: targetId,
        });
        setMessages((prev) => [
          ...prev.map((m) => (m.id === optimisticId ? { ...m, status: 'delivered' as const } : m)),
          {
            id: `assist-${Date.now()}`,
            role: 'agent',
            content: reply.content,
            timestamp: new Date().toISOString(),
          },
        ]);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'send failed';
        // eslint-disable-next-line no-console
        console.warn('[useChatStream] send failed → marking message error:', msg);
        setError(msg);
        // Mark the user bubble as errored but DO NOT remove it
        setMessages((prev) =>
          prev.map((m) =>
            m.id === optimisticId
              ? { ...m, status: 'sent', content: m.content }
              : m
          )
        );
      }
    },
    [mode, targetId, executor, model]
  );

  // ---- refresh --------------------------------------------------------------
  const refresh = useCallback(async () => {
    await loadHistory();
  }, [loadHistory]);

  return useMemo(
    () => ({ messages, loading, error, streaming, send, refresh }),
    [messages, loading, error, streaming, send, refresh]
  );
}
