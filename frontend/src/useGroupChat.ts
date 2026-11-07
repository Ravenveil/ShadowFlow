/**
 * useGroupChat.ts — 单个群（会话）的实时聊天状态机。
 *
 * 数据流：
 *   1. 打开群 → GET /api/groups/:id/timeline 全量渲染
 *   2. 订阅 GET /api/groups/:id/events（SSE）：
 *        agent.message → 追加回复；agent.typing → 「正在输入」指示
 *   3. timeline.runs[] 中非终态 session → 订阅 GET /api/run-sessions/:id/stream：
 *        message → upsert 整条 TimelineMessage
 *        message-patch → applyPatch 就地合并（流式输出核心）
 *   4. 任一 SSE 断开 → 回退 2s 轮询 timeline（stream 恢复后停止）
 *   5. 发送 → POST /api/groups/:id/messages，乐观追加用户气泡，
 *      sf-working 动画保留到收到 agent 回复（或超时兜底）
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  chatItemToTimeline,
  getTimeline,
  openSse,
  postMessage,
  stopGroup,
  type MessageItem,
  type RunRef,
  type SseMessage,
  type TimelineMessage,
  type UserAttachment,
} from "./chat-api";
import { applyPatchToList, isTerminalRunStatus, upsertMessage } from "./message-patches";

export interface GroupChatSnapshot {
  status: "idle" | "loading" | "ready" | "error";
  messages: TimelineMessage[];
  runs: RunRef[];
  /** agent.typing 瞬态指示（sender 展示名）。 */
  typing: string | null;
  /** 已发消息、等待 agent 回复（sf-working 动画）。 */
  awaitingReply: boolean;
  error: string | null;
  /** SSE 是否在线（false = 轮询兜底中）。 */
  live: boolean;
}

export interface GroupChatControls {
  /**
   * text 可为空串（仅发附件，2026-11-07 对话框拖拽传图）；attachments 为已上传成功的附件。
   * gidOverride：跨群补发（2026-11-08 主理人裁决「建群后自动补发」）——目标群为
   * 尚未激活的新群时跳过乐观气泡，直接 postMessage，消息随新会话服务端回读出现。
   */
  send: (text: string, attachments?: UserAttachment[], gidOverride?: string) => Promise<void>;
  stop: () => Promise<void>;
  rerun: () => Promise<void>;
  reload: () => void;
}

export type GroupChat = GroupChatSnapshot & GroupChatControls;

const POLL_INTERVAL_MS = 2000;
const TYPING_TIMEOUT_MS = 20_000;
const AWAITING_TIMEOUT_MS = 90_000;

export function useGroupChat(groupId: string | null): GroupChat {
  const [snapshot, setSnapshot] = useState<GroupChatSnapshot>({
    status: "idle",
    messages: [],
    runs: [],
    typing: null,
    awaitingReply: false,
    error: null,
    live: false,
  });

  // 流式订阅句柄 / 兜底轮询（不进 state，避免重渲染抖动）
  const eventsCloseRef = useRef<(() => void) | null>(null);
  const runClosesRef = useRef<Map<string, () => void>>(new Map());
  const runFailedRef = useRef<Set<string>>(new Set());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastEventIdRef = useRef<string | undefined>(undefined);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const awaitingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const groupIdRef = useRef<string | null>(groupId);
  groupIdRef.current = groupId;

  const patch = useCallback((p: Partial<GroupChatSnapshot>) => {
    setSnapshot((cur) => ({ ...cur, ...p }));
  }, []);

  // ── 兜底轮询 ──────────────────────────────────────────────────────────────
  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const loadTimeline = useCallback(
    async (silent: boolean) => {
      const gid = groupIdRef.current;
      if (!gid) return;
      try {
        const res = await getTimeline(gid);
        if (groupIdRef.current !== gid) return;
        setSnapshot((cur) => {
          // 保留尚未被服务端确认的本地乐观消息（id 前缀 local-）
          const serverIds = new Set(res.messages.map((m) => m.id));
          const localOnly = cur.messages.filter(
            (m) => m.id.startsWith("local-") && !serverIds.has(m.id),
          );
          const merged = [...res.messages, ...localOnly].sort((a, b) => a.ts - b.ts);
          return {
            ...cur,
            status: "ready",
            error: null,
            messages: merged,
            runs: res.runs ?? [],
          };
        });
      } catch (err) {
        if (groupIdRef.current !== gid) return;
        if (!silent) {
          patch({
            status: "error",
            error: err instanceof Error ? err.message : "加载失败",
          });
        }
      }
    },
    [patch],
  );

  const startPolling = useCallback(() => {
    if (pollRef.current !== null) return;
    pollRef.current = setInterval(() => {
      void loadTimeline(true);
    }, POLL_INTERVAL_MS);
  }, [loadTimeline]);

  // ── group events SSE ─────────────────────────────────────────────────────
  const openEventsStream = useCallback(() => {
    const gid = groupIdRef.current;
    if (!gid) return;
    eventsCloseRef.current?.();
    eventsCloseRef.current = null;

    const handle = (msg: SseMessage) => {
      if (msg.id != null) lastEventIdRef.current = msg.id;
      if (msg.event === "agent.message") {
        let item: MessageItem | null = null;
        try {
          item = JSON.parse(msg.data) as MessageItem;
        } catch {
          return;
        }
        const tl = chatItemToTimeline(item);
        setSnapshot((cur) => ({
          ...cur,
          messages: upsertMessage(cur.messages, tl),
          typing: null,
          awaitingReply: tl.kind === "assistant_text" ? false : cur.awaitingReply,
        }));
      } else if (msg.event === "agent.typing") {
        let name = "Agent";
        try {
          const data = JSON.parse(msg.data) as { sender_name?: string; agent_name?: string };
          name = data.sender_name || data.agent_name || "Agent";
        } catch {
          /* 保持默认 */
        }
        setSnapshot((cur) => ({ ...cur, typing: name }));
        if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
        typingTimerRef.current = setTimeout(() => {
          setSnapshot((cur) => ({ ...cur, typing: null }));
        }, TYPING_TIMEOUT_MS);
      }
      // system.notice 等其它帧：忽略（additive，不打扰聊天流）
    };

    eventsCloseRef.current = openSse(`/api/groups/${gid}/events`, {
      lastEventId: lastEventIdRef.current,
      onMessage: handle,
      onOpen: () => {
        reconnectAttemptRef.current = 0;
        patch({ live: true });
      },
      onError: () => {
        patch({ live: false });
        startPolling();
        // 断线重连（带 Last-Event-ID 补帧），指数退避上限 8 次
        if (reconnectAttemptRef.current < 8 && groupIdRef.current === gid) {
          const delay = Math.min(1500 * 2 ** reconnectAttemptRef.current, 15_000);
          reconnectAttemptRef.current += 1;
          reconnectTimerRef.current = setTimeout(() => {
            if (groupIdRef.current === gid) openEventsStream();
          }, delay);
        }
      },
    });
  }, [patch, startPolling]);

  // ── run 流 SSE（message / message-patch）─────────────────────────────────
  const syncRunStreams = useCallback(
    (runs: RunRef[]) => {
      const active = new Set(
        runs.filter((r) => !isTerminalRunStatus(r.status)).map((r) => r.session_id),
      );
      // 关闭已终态 / 不再存在的 run 流
      for (const [sid, close] of runClosesRef.current) {
        if (!active.has(sid)) {
          close();
          runClosesRef.current.delete(sid);
        }
      }
      // 打开新的非终态 run 流（失败过的不再重试，走轮询兜底）
      for (const sid of active) {
        if (runClosesRef.current.has(sid) || runFailedRef.current.has(sid)) continue;
        const close = openSse(`/api/run-sessions/${sid}/stream`, {
          onMessage: (msg: SseMessage) => {
            if (msg.event === "message") {
              try {
                const tl = JSON.parse(msg.data) as TimelineMessage;
                if (tl && typeof tl.id === "string") {
                  setSnapshot((cur) => ({
                    ...cur,
                    messages: upsertMessage(cur.messages, tl),
                  }));
                }
              } catch {
                /* 坏帧丢弃 */
              }
            } else if (msg.event === "message-patch") {
              try {
                const p = JSON.parse(msg.data) as { id?: string; op?: string };
                if (p && typeof p.id === "string") {
                  setSnapshot((cur) => ({
                    ...cur,
                    messages: applyPatchToList(cur.messages, p as never),
                  }));
                }
              } catch {
                /* 坏帧丢弃 */
              }
            } else if (msg.event === "retry-pending" || msg.event === "aborted") {
              void loadTimeline(true);
            }
          },
          onError: () => {
            runFailedRef.current.add(sid);
            runClosesRef.current.delete(sid);
            // run 流不可用 → 2s 轮询 timeline 兜底
            startPolling();
          },
        });
        runClosesRef.current.set(sid, close);
      }
    },
    [loadTimeline, startPolling],
  );

  // ── 主 effect：群切换时重建一切 ────────────────────────────────────────────
  useEffect(() => {
    // 清理上一个群
    eventsCloseRef.current?.();
    eventsCloseRef.current = null;
    runClosesRef.current.forEach((close) => close());
    runClosesRef.current.clear();
    runFailedRef.current.clear();
    stopPolling();
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    if (awaitingTimerRef.current) clearTimeout(awaitingTimerRef.current);
    lastEventIdRef.current = undefined;
    reconnectAttemptRef.current = 0;

    if (!groupId) {
      setSnapshot({
        status: "idle",
        messages: [],
        runs: [],
        typing: null,
        awaitingReply: false,
        error: null,
        live: false,
      });
      return;
    }

    setSnapshot({
      status: "loading",
      messages: [],
      runs: [],
      typing: null,
      awaitingReply: false,
      error: null,
      live: false,
    });
    void loadTimeline(false);
    openEventsStream();
    // 初始一次 run 流对账（timeline 返回后由 runs effect 接手）
  }, [groupId, loadTimeline, openEventsStream, stopPolling]);

  // runs 变化 → 对账 run 流订阅
  useEffect(() => {
    if (!groupId) return;
    syncRunStreams(snapshot.runs);
  }, [groupId, snapshot.runs, syncRunStreams]);

  // 卸载 → 全量清理
  useEffect(
    () => () => {
      eventsCloseRef.current?.();
      runClosesRef.current.forEach((close) => close());
      runClosesRef.current.clear();
      stopPolling();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      if (awaitingTimerRef.current) clearTimeout(awaitingTimerRef.current);
    },
    [stopPolling],
  );

  // ── 操作 ────────────────────────────────────────────────────────────────
  const send = useCallback(
    async (text: string, attachments?: UserAttachment[], gidOverride?: string) => {
      // 目标群统一取 gid（2026-11-08 裁决）：gidOverride 优先，否则当前激活群
      const gid = gidOverride ?? groupIdRef.current;
      const content = text.trim();
      // 文本与附件至少给一个（2026-11-07 对话框拖拽传图：支持仅附件发送）
      if (!gid || (!content && !(attachments && attachments.length > 0))) return;
      const atts = attachments && attachments.length > 0 ? attachments : undefined;
      // 跨群补发：目标群尚未激活 → 跳过乐观气泡/等待态（群切换 effect 会重置列表并拉
      // timeline，消息随服务端回读出现，避免闪烁），直接 postMessage
      const crossGroup = gidOverride != null && gidOverride !== groupIdRef.current;
      const tempId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      if (!crossGroup) {
        const optimistic: TimelineMessage = {
          id: tempId,
          kind: "user_turn",
          turn_id: tempId,
          ts: Date.now(),
          text: content,
          ...(atts ? { attachments: atts } : {}),
        };
        setSnapshot((cur) => ({
          ...cur,
          messages: upsertMessage(cur.messages, optimistic),
          awaitingReply: true,
          error: null,
        }));
        if (awaitingTimerRef.current) clearTimeout(awaitingTimerRef.current);
        awaitingTimerRef.current = setTimeout(() => {
          setSnapshot((cur) => ({ ...cur, awaitingReply: false }));
        }, AWAITING_TIMEOUT_MS);
      }
      try {
        const item = await postMessage(gid, content, atts);
        const real = chatItemToTimeline(item);
        // 旧后端未回传 attachments 时保留乐观 chips，避免消息确认后闪烁丢失
        if (!real.attachments?.length && atts) real.attachments = atts;
        if (crossGroup) {
          // 服务端确认后合入当前列表（群切换通常此时已完成；upsert 按 id 去重，
          // 即使 timeline 重拉先到也不会产生重复）
          setSnapshot((cur) => ({ ...cur, messages: upsertMessage(cur.messages, real) }));
          return;
        }
        if (groupIdRef.current !== gid) return;
        setSnapshot((cur) => ({
          ...cur,
          messages: upsertMessage(
            cur.messages.filter((m) => m.id !== tempId),
            real,
          ),
        }));
      } catch (err) {
        const message = err instanceof Error ? err.message : "发送失败";
        if (crossGroup) {
          // 补发失败：错误提示挂到当前（可能已切换的）会话上
          setSnapshot((cur) => ({ ...cur, awaitingReply: false, error: message }));
          return;
        }
        if (groupIdRef.current !== gid) return;
        setSnapshot((cur) => ({
          ...cur,
          messages: cur.messages.filter((m) => m.id !== tempId),
          awaitingReply: false,
          error: message,
        }));
      }
    },
    [],
  );

  const stop = useCallback(async () => {
    const gid = groupIdRef.current;
    if (!gid) return;
    try {
      await stopGroup(gid);
    } catch {
      /* 服务端已终止/不可达都视为停止 */
    }
    setSnapshot((cur) => ({ ...cur, awaitingReply: false }));
    await loadTimeline(true);
  }, [loadTimeline]);

  const rerun = useCallback(async () => {
    await send("重跑上一轮任务");
  }, [send]);

  const reload = useCallback(() => {
    void loadTimeline(false);
  }, [loadTimeline]);

  return {
    status: snapshot.status,
    messages: snapshot.messages,
    runs: snapshot.runs,
    typing: snapshot.typing,
    awaitingReply: snapshot.awaitingReply,
    error: snapshot.error,
    live: snapshot.live,
    send,
    stop,
    rerun,
    reload,
  };
}
