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
 *   实时(F5): runs 数组里 status==='running' 的 session 用 subscribeRunSession
 *             订阅其 /api/run-sessions/{id}/stream：
 *               onMessage      → 按 id 去重/覆盖后追加（与 /timeline 重拉同源 id）
 *               onMessagePatch → applyPatch 就地点亮（thinking 流/step 增长…）
 *             run 终态（complete / server error）即解除该订阅；卸载/切群清理全部。
 *             时序坑：用户发消息 → 网关 startGatewayRun 创建的新 run 不在当前
 *             runs 里 —— appendLocalUser 后安排 2s/6s 两次 /timeline runs 刷新，
 *             发现新 running run 即订阅，并 dispatch 'sf:gateway-run-active'
 *             （detail={groupId,sessionId}）供右栏 RunWorkPane 实时跟随。
 *
 * groupId 传 null = hook 完全 idle（不 fetch 不订阅）—— ChatPage 灰度开关关闭时
 * 传 null，保证默认零行为变化（不多开 SSE 连接）。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { authHeaders, getApiBase } from '../../api/_base';
import { subscribeRunSession } from '../../api/runSessions';
import { startSseClient, type SseClientHandle } from '../../api/sseClient';
import {
  applyPatch,
  type MessagePatch,
  type TimelineMessage,
} from '../../components/run-session/timeline/types';

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
  /** 2026-11-04「停止生成」— 所有 running runs 立即本地翻终态 'canceled'
   *  （解订阅 + 终态簿记）。配合服务端 POST /:id/stop 实现「点停止真停」。 */
  markAllRunsStopped: () => void;
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
    // U0 绑角色 — Python SSE 帧的 msg.agent_id 透传（agent 消息有，system 无）。
    const agentId = typeof payload.agent_id === 'string' ? payload.agent_id : undefined;
    return {
      id,
      kind: 'assistant_text',
      turn_id: turnId,
      ts,
      body: content,
      streaming: eventType === 'agent.message' && payload.streaming === true,
      ...(senderName ? { sender_name: senderName } : {}),
      ...(agentId ? { agent_id: agentId } : {}),
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

  // ---- F5 实时订阅簿记 -------------------------------------------------------
  // session_id → unsubscribe。Map 本体跨 render 持久，生命周期由 [groupId]
  // cleanup effect 统一回收（卸载/切群全部解除）。
  const runSubsRef = useRef<Map<string, () => void>>(new Map());
  // 已到终态（complete / server error）的 session — 即使后续 /timeline 刷新
  // 仍短暂报 running（服务端状态滞后），也不再重复订阅。
  const terminalRunsRef = useRef<Set<string>>(new Set());
  // appendLocalUser 安排的 2s/6s runs 刷新计时器（切群/卸载时清掉）。
  const refreshTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);

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

  // ---- F5: 只刷 runs 数组（不动 messages —— 流式中的过程卡不可被重拉覆盖）----
  const refreshRuns = useCallback(async (gid: string) => {
    try {
      const res = await fetch(
        `${getApiBase()}/api/groups/${encodeURIComponent(gid)}/timeline`,
        { headers: { ...authHeaders() } },
      );
      if (!res.ok) return;
      const json = (await res.json()) as TimelineResponse;
      if (activeGroupRef.current !== gid) return;
      const fresh = json.runs;
      if (Array.isArray(fresh)) {
        setRuns((prev) =>
          fresh.map((r) => {
            // 服务端状态可能滞后：本地已记终态的 run 不被 stale 'running' 拉回。
            if (r.status === 'running' && terminalRunsRef.current.has(r.session_id)) {
              return prev.find((p) => p.session_id === r.session_id) ?? r;
            }
            return r;
          }),
        );
      }
    } catch {
      // best-effort：发现新 run 失败不打断聊天流（下一次 SSE/手动刷新还有机会）。
    }
  }, []);

  // ---- F5: running run → 订阅其 /stream（message / message-patch 就地点亮）----
  useEffect(() => {
    if (!groupId) return;

    const teardown = (sessionId: string, status: string) => {
      terminalRunsRef.current.add(sessionId);
      const unsub = runSubsRef.current.get(sessionId);
      if (unsub) {
        runSubsRef.current.delete(sessionId);
        unsub();
      }
      // 终态回写 runs（避免下一轮 effect 误判仍 running；UI 徽章同步变灰/变绿）。
      setRuns((prev) =>
        prev.map((r) => (r.session_id === sessionId ? { ...r, status } : r)),
      );
    };

    for (const run of runs) {
      if (run.status !== 'running') continue;
      const sid = run.session_id;
      if (terminalRunsRef.current.has(sid)) continue;
      if (runSubsRef.current.has(sid)) continue;

      // maxRetries 设小：run 终态后服务端关流会触发 onerror，避免对已结束的
      // run 做长时间指数退避（subscribeRunSession 自带 cursor 续传/重连语义）。
      const unsubscribe = subscribeRunSession(
        sid,
        {
          onMessage: (msg: TimelineMessage) => {
            if (activeGroupRef.current !== groupId) return;
            setMessages((prev) => {
              // 按 id 去重/覆盖（同 F2 语义）：/timeline 重拉与 /stream 重放同源 id。
              const idx = prev.findIndex((m) => m.id === msg.id);
              if (idx >= 0) {
                const next = [...prev];
                next[idx] = msg;
                return next;
              }
              return [...prev, msg];
            });
          },
          onMessagePatch: (patch: MessagePatch) => {
            if (activeGroupRef.current !== groupId) return;
            setMessages((prev) =>
              prev.map((m) => (m.id === patch.id ? applyPatch(m, patch) : m)),
            );
          },
          onComplete: () => teardown(sid, 'succeeded'),
          onServerError: () => teardown(sid, 'failed'),
        },
        { maxRetries: 2 },
      );
      runSubsRef.current.set(sid, unsubscribe);

      // 右栏实时跟随：RunWorkPane 监听此事件，groupId 匹配即刷新列表。
      try {
        window.dispatchEvent(
          new CustomEvent('sf:gateway-run-active', {
            detail: { groupId, sessionId: sid },
          }),
        );
      } catch {
        // jsdom/SSR 环境无 window 自定义事件支持时静默。
      }
    }
    // 注意：本 effect 不带 cleanup —— runs 每次变化都会重跑，若在这里解除订阅
    // 会造成流式中途反复断连。订阅生命周期由下方 [groupId] effect 统一回收。
  }, [groupId, runs]);

  // ---- F5: 切群/卸载 → 解除全部 run 订阅 + 清计时器 + 重置终态簿记 ------------
  useEffect(() => {
    if (!groupId) return;
    return () => {
      for (const unsub of runSubsRef.current.values()) unsub();
      runSubsRef.current.clear();
      terminalRunsRef.current.clear();
      for (const t of refreshTimersRef.current) clearTimeout(t);
      refreshTimersRef.current = [];
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

    // F5 时序：发消息 → 网关 startGatewayRun 创建新 run（不在当前 runs 里）。
    // 2s/6s 各刷一次 runs，发现新 running run 由订阅 effect 接管。
    const gid = activeGroupRef.current;
    if (gid) {
      for (const delay of [2000, 6000]) {
        const timer = setTimeout(() => {
          if (activeGroupRef.current === gid) void refreshRuns(gid);
        }, delay);
        refreshTimersRef.current.push(timer);
      }
    }
  }, [refreshRuns]);

  // 2026-11-04 群聊「停止生成」— 把所有 running runs 立即本地翻终态
  // 'canceled'：解除订阅 + 记终态簿记（防 stale 轮询拉回 running）+ runs 回写。
  // 与服务端 POST /:id/stop 配合使用（服务端真停 fan-out，这里 UI 立即退出 busy）。
  const markAllRunsStopped = useCallback(() => {
    const running = runs.filter((r) => r.status === 'running');
    if (running.length === 0) return;
    for (const r of running) {
      terminalRunsRef.current.add(r.session_id);
      const unsub = runSubsRef.current.get(r.session_id);
      if (unsub) {
        runSubsRef.current.delete(r.session_id);
        unsub();
      }
    }
    setRuns((prev) =>
      prev.map((r) => (r.status === 'running' ? { ...r, status: 'canceled' } : r)),
    );
  }, [runs]);

  return useMemo(
    () => ({ messages, runs, loading, error, truncated, appendLocalUser, markAllRunsStopped }),
    [messages, runs, loading, error, truncated, appendLocalUser, markAllRunsStopped],
  );
}
