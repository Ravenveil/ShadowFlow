/**
 * useGroupTimeline — F2 (unified-conversation-core-plan-2026-06-11) 灰度数据 hook。
 *
 * 统一会话内核的群聊中栏读路径：
 *
 *   初始加载: GET /api/groups/{id}/timeline  (B2, server groups-chat.ts)
 *             → { group_id, messages: TimelineMessage[], runs, truncated }
 *             聊天消息 + run 过程事件已在服务端归并为统一 TimelineMessage 流
 *             （chatMessagesToTimeline + replayTimeline，ts 升序）。
 *
 *   增量:     订阅既有群 SSE /api/groups/{id}/events（与 useChatStream 的
 *             sseChannel:'group' 完全同款连接方式 — startSseClient，不开新机制）。
 *             帧→TimelineMessage 的轻量适配与 server 端 chatMessagesToTimeline
 *             同语义：
 *               agent.message / agent.complete → assistant_text (+sender_name)
 *               system.notice                  → raw (source:'chat-gateway')
 *             turn_id 挂到最近一条 user_turn（没有则 'chat_turn_0'）。
 *             id 用 `chat_<message_id>`，与 server 适配器的 id 规则一致 —— 同一条
 *             消息无论从 /timeline 重拉还是 SSE 推来都是同一个 id（天然去重锚点）。
 *
 *   乐观:     appendLocalUser(text) — 用户自己发的消息不会从 SSE 回流，发送方
 *             （ChatPage handleSend，POST 路径不变）发完后调它本地追加一条
 *             user_turn，并开启新 turn（其后的 agent 回复挂在它名下）。
 *
 * groupId 传 null = hook 完全 idle（不 fetch 不订阅）—— ChatPage 灰度开关关闭时
 * 传 null，保证默认零行为变化（不多开 SSE 连接）。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { authHeaders, getApiBase } from '../../api/_base';
import { startSseClient, type SseClientHandle } from '../../api/sseClient';
import type { TimelineMessage } from '../../components/run-session/timeline/types';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface TimelineRunRef {
  session_id: string;
  status: string;
}

export interface UseGroupTimelineResult {
  /** 统一 Timeline 流（聊天消息 + run 过程卡，ts 升序 + SSE 增量追加）。 */
  messages: TimelineMessage[];
  /** 该群互链 conversation 下的 run sessions（B2 响应透传）。 */
  runs: TimelineRunRef[];
  loading: boolean;
  error: string | null;
  /** B2 响应里 >500 条被截断时为 true。 */
  truncated: boolean;
  /** 乐观追加用户自己发的消息（开启新 turn）。发送 POST 由调用方负责。 */
  appendLocalUser: (text: string) => void;
}

interface TimelineResponse {
  group_id?: string;
  messages?: TimelineMessage[];
  runs?: TimelineRunRef[];
  truncated?: boolean;
}

// ---------------------------------------------------------------------------
// Pure helpers (exported for unit tests)
// ---------------------------------------------------------------------------

/** 找最近一条 user_turn 的 turn_id；没有则与 server 端同款的兜底 'chat_turn_0'。 */
export function lastTurnId(messages: readonly TimelineMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m && m.kind === 'user_turn') return m.turn_id;
  }
  return 'chat_turn_0';
}

/**
 * 群 SSE 帧（MessageItem 风格 payload）→ TimelineMessage。
 * 与 server/src/lib/timeline-replay.ts `chatMessagesToTimeline` 同语义：
 *   agent → assistant_text（保留 sender_name）；system.notice → raw。
 * 返回 null = 该帧不产生 Timeline 行（空内容 / 不认识的事件）。
 */
export function sseFrameToTimeline(
  eventType: string,
  payload: Record<string, unknown>,
  turnId: string,
): TimelineMessage | null {
  const content = String(payload.content ?? payload.message ?? '');
  if (!content) return null;

  const rawTs = payload.timestamp;
  const parsed = typeof rawTs === 'string' ? Date.parse(rawTs) : NaN;
  const ts = Number.isFinite(parsed) ? parsed : Date.now();
  const id = payload.message_id
    ? `chat_${String(payload.message_id)}`
    : `chat_sse_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  if (eventType === 'agent.message' || eventType === 'agent.complete') {
    const senderName =
      (payload.sender_name as string) ?? (payload.agent_name as string) ?? undefined;
    return {
      id,
      kind: 'assistant_text',
      turn_id: turnId,
      ts,
      body: content,
      streaming: eventType === 'agent.message' && payload.streaming === true,
      ...(senderName ? { sender_name: senderName } : {}),
    };
  }

  if (eventType === 'system.notice') {
    return {
      id,
      kind: 'raw',
      turn_id: turnId,
      ts,
      body: content,
      source: 'chat-gateway',
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useGroupTimeline(groupId: string | null): UseGroupTimelineResult {
  const [messages, setMessages] = useState<TimelineMessage[]>([]);
  const [runs, setRuns] = useState<TimelineRunRef[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);

  // 防串台：异步 fetch 落地时校验目标群没被切走（同 useChatStream activeTargetRef）。
  const activeGroupRef = useRef<string | null>(groupId);
  activeGroupRef.current = groupId;
  const sseHandleRef = useRef<SseClientHandle | null>(null);

  // ---- 初始加载 /timeline ----------------------------------------------------
  useEffect(() => {
    if (!groupId) {
      setMessages([]);
      setRuns([]);
      setTruncated(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const res = await fetch(
          `${getApiBase()}/api/groups/${encodeURIComponent(groupId)}/timeline`,
          { headers: { ...authHeaders() } },
        );
        if (!res.ok) {
          throw new Error(`timeline fetch failed: HTTP ${res.status}`);
        }
        const json = (await res.json()) as TimelineResponse;
        if (cancelled || activeGroupRef.current !== groupId) return;
        setMessages(Array.isArray(json.messages) ? json.messages : []);
        setRuns(Array.isArray(json.runs) ? json.runs : []);
        setTruncated(Boolean(json.truncated));
      } catch (err) {
        if (cancelled || activeGroupRef.current !== groupId) return;
        const msg = err instanceof Error ? err.message : 'timeline fetch failed';
        // eslint-disable-next-line no-console
        console.warn('[useGroupTimeline] initial fetch failed:', msg);
        setError(msg);
        setMessages([]);
        setRuns([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  // ---- SSE 增量（复用 useChatStream 同款 /api/groups/{id}/events 连接方式）----
  useEffect(() => {
    if (!groupId) return;
    let alive = true;

    try {
      const handle = startSseClient({
        url: `/api/groups/${encodeURIComponent(groupId)}/events`,
        onEvent: (eventType, data) => {
          if (!alive) return;
          if (
            eventType !== 'agent.message' &&
            eventType !== 'agent.complete' &&
            eventType !== 'system.notice'
          ) {
            return;
          }
          const payload = (data ?? {}) as Record<string, unknown>;
          setMessages((prev) => {
            const next = sseFrameToTimeline(eventType, payload, lastTurnId(prev));
            if (!next) return prev;
            // 去重：同一条消息可能 SSE 推一次 + /timeline 重拉一次（id 同源 chat_<mid>）。
            if (prev.some((m) => m.id === next.id)) return prev;
            return [...prev, next];
          });
        },
        onError: () => {
          if (!alive) return;
          // EventSource 自带重连；只记 warning，不打断流。
          // eslint-disable-next-line no-console
          console.warn('[useGroupTimeline] SSE error — relying on browser reconnect');
        },
      });
      sseHandleRef.current = handle;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[useGroupTimeline] SSE setup failed:', err);
    }

    return () => {
      alive = false;
      sseHandleRef.current?.close();
      sseHandleRef.current = null;
    };
  }, [groupId]);

  // ---- 乐观追加（用户自己发的消息不会从 SSE 回流）---------------------------
  const appendLocalUser = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const id = `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const msg: TimelineMessage = {
      id,
      kind: 'user_turn',
      turn_id: id, // 用户消息开启新 turn（与 server chatMessagesToTimeline 同语义）
      ts: Date.now(),
      text: trimmed,
    };
    setMessages((prev) => [...prev, msg]);
  }, []);

  return useMemo(
    () => ({ messages, runs, loading, error, truncated, appendLocalUser }),
    [messages, runs, loading, error, truncated, appendLocalUser],
  );
}
