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
 * AgentDMPage) stay agnostic. If any backend call fails the hook leaves the
 * thread empty (no mock injection) — failures surface in `error` for a banner.
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
  /** True while a sent message is awaiting the agent reply (POST in-flight or waiting for SSE response). */
  streaming: boolean;
  /** Number of messages buffered in the pending queue (typed while streaming or targetId was null). */
  pendingCount: number;
  /** Send a user message → optimistic append + assistant reply. */
  send: (content: string) => Promise<void>;
  /** Abort the current in-flight send and reset streaming state. */
  cancel: () => void;
  /** Force-reload history from the backend. */
  refresh: () => Promise<void>;
}

// Re-export so consumers only need `useChatStream`'s module
export type { ChatMessage } from '../components/chat/ChatStream';

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
  // Mirrors the pending queue length as React state so the UI can show a badge.
  const [pendingCount, setPendingCount] = useState(0);

  // ---- internal refs --------------------------------------------------------
  const sseHandleRef = useRef<SseClientHandle | null>(null);
  // AbortController for the currently in-flight postGroupMessage / chatCompletion POST.
  const abortCtrlRef = useRef<AbortController | null>(null);
  // Epoch ms when cancel() was last called; 0 = not cancelled.
  // SSE replies arriving within 8 s of cancel are suppressed (the group POST
  // typically completes in milliseconds, so the agent reply is already queued
  // server-side when the user presses Stop). Cleared on next send().
  const cancelledAtRef = useRef<number>(0);
  // Track the latest target so async fetches don't write into a switched-away view
  const activeTargetRef = useRef<string | null>(targetId);
  activeTargetRef.current = targetId;
  // Mirror streaming state as a ref so send() can read the current value
  // without needing streaming in its useCallback dependency array.
  const streamingRef = useRef(false);
  streamingRef.current = streaming;
  // Queue of messages typed while an agent reply is in-flight OR while targetId is null.
  // Drained sequentially after each agent.complete / DM reply (or once targetId resolves).
  const pendingQueueRef = useRef<string[]>([]);
  // Tracks previous targetId so Fix 2 can distinguish agent-switch from initial connection.
  const prevTargetIdRef = useRef<string | null>(targetId);

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
      console.warn('[useChatStream] history fetch failed:', msg);
      setError(msg);
      // 后端不可达时留空（不再注入 mock 假对话）；错误经 `error` 暴露给上层 banner。
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [mode, targetId, historyLimit]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  // ---- Fix 2: clear pending queue on agent switch --------------------------
  // Fires whenever targetId changes. We only clear when switching FROM a
  // non-null target (genuine agent-switch) to avoid discarding messages that
  // were buffered while targetId was still null during the initial connection.
  useEffect(() => {
    const prev = prevTargetIdRef.current;
    prevTargetIdRef.current = targetId;
    if (prev !== null && prev !== targetId) {
      pendingQueueRef.current = [];
      setPendingCount(0);
    }
  }, [targetId]);

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

    try {
      const handle = startSseClient({
        url,
        onEvent: (eventType, data) => {
          if (!alive) return;
          const payload = (data ?? {}) as Record<string, unknown>;

          // Suppress SSE replies that race in after a client-side cancel.
          // cancelledAtRef is set in cancel(), cleared at the next send().
          const isCancelledReply = cancelledAtRef.current > 0 && Date.now() - cancelledAtRef.current < 8_000;

          // agent.message / agent.complete → append assistant bubble
          if (eventType === 'agent.message' || eventType === 'agent.complete') {
            if (isCancelledReply) { setStreaming(false); return; }
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
            // Agent replied — send cycle complete.
            setStreaming(false);
            return;
          }

          // system.notice → centered system row (chat-bridge feedback, e.g.
          // missing BYOK key or a dangling agent member).
          if (eventType === 'system.notice') {
            if (isCancelledReply) { setStreaming(false); return; }
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
            // Gateway notice (e.g. missing key, dangling member) ends the send cycle.
            setStreaming(false);
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
      if (!text) return;

      // targetId not yet resolved (e.g. resolveDmConversation still in-flight).
      // Buffer for delivery once targetId becomes non-null and the drain effect fires.
      if (!targetId) {
        pendingQueueRef.current.push(text);
        setPendingCount((c) => c + 1);
        return;
      }

      // If a response is already in-flight, buffer the message and return.
      // The drain effect below will call send() again once streaming ends.
      // Fix 5: use push() instead of spread — ref mutation doesn't need a new array.
      if (streamingRef.current) {
        pendingQueueRef.current.push(text);
        setPendingCount((c) => c + 1);
        return;
      }

      // Each send gets its own AbortController so cancel() can abort it.
      const ctrl = new AbortController();
      abortCtrlRef.current = ctrl;
      // Clear any prior cancel suppression — this is a fresh send.
      cancelledAtRef.current = 0;

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
      setStreaming(true);

      try {
        if (mode === 'group') {
          // Persist the user message to the group's log on the Python backend.
          // The backend chat-bridge then dispatches agent replies asynchronously
          // and pushes them back over the group SSE channel (sseChannel:'group'),
          // so we do NOT append the reply here — the SSE handler does.
          // streaming stays true until the SSE agent reply resets it.
          await postGroupMessage(targetId, text, { senderName: 'user', senderKind: 'user', executor, model, signal: ctrl.signal });
          setMessages((prev) =>
            prev.map((m) => (m.id === optimisticId ? { ...m, status: 'delivered' as const } : m)),
          );
          return;
        }

        // ---- dm mode: BYOK chat completion ---------------------------------
        // Pass the AbortController signal so cancel() actually terminates the
        // in-flight HTTP request (not just flipping streaming=false in the UI).
        const reply = await chatCompletion(
          { messages: [{ role: 'user', content: text }], agent_id: targetId },
          { signal: ctrl.signal },
        );
        setMessages((prev) => [
          ...prev.map((m) => (m.id === optimisticId ? { ...m, status: 'delivered' as const } : m)),
          {
            id: `assist-${Date.now()}`,
            role: 'agent',
            content: reply.content,
            timestamp: new Date().toISOString(),
          },
        ]);
        // DM: reply arrived directly (no SSE), cycle complete.
        setStreaming(false);
      } catch (err) {
        // AbortError = user cancelled deliberately; no error banner needed.
        // Remove the orphaned optimistic bubble — leaving it at status:'sent'
        // with no agent reply is an ambiguous dangling state.
        if (err instanceof Error && err.name === 'AbortError') {
          setStreaming(false);
          setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
          return;
        }
        const msg = err instanceof Error ? err.message : 'send failed';
        // eslint-disable-next-line no-console
        console.warn('[useChatStream] send failed → marking message error:', msg);
        setError(msg);
        setStreaming(false);
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

  // ---- drain pending queue --------------------------------------------------
  // Fires when streaming transitions from true → false, OR when send reference
  // changes (i.e. targetId changed from null → value, enabling buffered messages
  // to be delivered once the connection is established).
  // Dequeues one message and sends it; that send sets streaming=true again,
  // so the next drain fires only after the subsequent agent reply.
  useEffect(() => {
    if (!streaming && pendingQueueRef.current.length > 0) {
      const [next, ...rest] = pendingQueueRef.current;
      pendingQueueRef.current = rest;
      setPendingCount((c) => Math.max(0, c - 1));
      void send(next);
    }
  }, [streaming, send]);

  // ---- cancel ---------------------------------------------------------------
  const cancel = useCallback(() => {
    abortCtrlRef.current?.abort();
    abortCtrlRef.current = null;
    // Record when cancel was pressed so the SSE handler can suppress agent
    // replies that are already in-flight (group mode: the POST completed in
    // milliseconds but the server-side reply will still arrive over SSE).
    cancelledAtRef.current = Date.now();
    // Fix 1: clear pending queue BEFORE flipping streaming to false.
    // Without this, the drain useEffect would immediately fire and start
    // sending queued messages, contradicting the user's intent to stop.
    pendingQueueRef.current = [];
    setPendingCount(0);
    setStreaming(false);
  }, []);

  // ---- refresh --------------------------------------------------------------
  const refresh = useCallback(async () => {
    await loadHistory();
  }, [loadHistory]);

  return useMemo(
    () => ({ messages, loading, error, streaming, pendingCount, send, cancel, refresh }),
    [messages, loading, error, streaming, pendingCount, send, cancel, refresh]
  );
}
