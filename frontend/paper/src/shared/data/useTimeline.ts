/**
 * useTimeline.ts — 一条会话的「过程时间线」状态机（数据层，组件只管画）。
 *
 * 三条来源各管一段，缺一不可：
 *   1. `loadTimeline` —— 全量：历史 + 每个 run 事件日志的重放结果，一次读齐
 *   2. `watchRunStream` —— 实时：还在跑的那条 run 把过程一帧一帧推过来
 *      （message 长出新格、message-patch 就地补字），这是「思考与工具调用
 *      跟着跑」的来源；一条 run 一条流，多轮并发各订各的
 *   3. 轮询 —— 兜底：新 run 的注册、流断了之后的收尾，都靠它补
 *
 * 什么时候该轮询（三个条件，任一成立即可，代价是每 2 秒一次轻量 GET）：
 *   · 还在等应答（用户刚发出去）
 *   · 有时间线里的 run 处于 running
 *   · 刚等完应答的收尾窗口内（run 注册比第一句回话晚，留一段时间发现它）
 * 三个都不成立就停 —— 静止的会话不该有后台请求。
 *
 * 路径不通（老后端 / 没准备演示数据）时 `loadTimeline` 返回 null，状态落
 * `unsupported`，界面回落旧的 messages 流，不报错、不空屏。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { source, type WorkspaceSource } from '@/shared/data/source';
import {
  applyTimelinePatchToList,
  isActiveRun,
  reconcileTimeline,
  upsertTimeline,
} from '@/shared/data/timeline';
import type { RunRef, TimelineMessage } from '@/shared/data/types';

/** 兜底轮询间隔：够快看得见进展，也不至于把后端打满。 */
const POLL_MS = 2000;
/** 应答结束后继续找 run 的窗口：run 的注册比第一句话晚一点点是常态。 */
const DISCOVERY_MS = 30_000;
/** 一轮跑完后多看一眼，确保收尾行（用时 / 工具数 / 终态）落到列表里。 */
const SETTLE_MS = 15_000;

export type TimelineStatus = 'idle' | 'loading' | 'ready' | 'unsupported';

export interface TimelineApi {
  status: TimelineStatus;
  /** 服务端时间线 + 本地尚未被确认的乐观回声，已按 ts 排好。 */
  messages: TimelineMessage[];
  /** 超过后端上限（500 条）时为真：更早的过程已被截掉。 */
  truncated: boolean;
  /** 本地先把刚发出去的那句话上屏；服务端回显后它会自动退场。 */
  echo: (text: string) => void;
  /** 最近一条落定的 run id（run_foot 帧）；无则 null。后续建议卡用。 */
  lastSettledRunId: string | null;
  /** team-saved 帧解析出的团队信息；无则 null。团队保存卡用。 */
  teamSaved: { name: string; agent_ids?: string[] } | null;
}

/** 本地回声的 id 前缀：服务端 id 都带自己的前缀（`chat_` / 投影器 id），不会撞。 */
const ECHO_PREFIX = 'local-';

export function useTimeline(
  sessionId: string | null,
  opts: { awaiting?: boolean } = {},
  src: WorkspaceSource = source,
): TimelineApi {
  const [status, setStatus] = useState<TimelineStatus>('idle');
  const [server, setServer] = useState<TimelineMessage[]>([]);
  const [echoes, setEchoes] = useState<TimelineMessage[]>([]);
  const [runs, setRuns] = useState<RunRef[]>([]);
  const [truncated, setTruncated] = useState(false);

  const awaiting = opts.awaiting ?? false;
  const aliveRef = useRef(true);
  const sessionRef = useRef<string | null>(sessionId);
  sessionRef.current = sessionId;
  /** 轮询何时可以收工（epoch ms）；0 = 现在就可以收工。 */
  const pollUntilRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const runClosesRef = useRef(new Map<string, () => void>());
  const echoSeqRef = useRef(0);
  const awaitingRef = useRef(awaiting);
  awaitingRef.current = awaiting;

  const load = useCallback(
    async (silent: boolean) => {
      const sid = sessionId;
      if (!sid || !src.loadTimeline) {
        if (!src.loadTimeline) setStatus('unsupported');
        return;
      }
      if (!silent) setStatus('loading');
      let snapshot: Awaited<ReturnType<NonNullable<WorkspaceSource['loadTimeline']>>> = null;
      try {
        snapshot = await src.loadTimeline(sid);
      } catch {
        // 读路径挂了不该把聊天框变成错误页：保持上一份数据，交给兜底轮询再试
        if (!silent) setStatus('unsupported');
        return;
      }
      if (!aliveRef.current || sessionRef.current !== sid) return;
      if (!snapshot) {
        setStatus('unsupported');
        return;
      }
      setServer(snapshot.messages);
      setRuns(snapshot.runs);
      setTruncated(snapshot.truncated);
      setStatus('ready');

      const anyActive = snapshot.runs.some((r) => isActiveRun(r.status));
      if (anyActive) pollUntilRef.current = Date.now() + SETTLE_MS + DISCOVERY_MS;
      else if (!awaitingRef.current) pollUntilRef.current = 0;
    },
    [sessionId, src],
  );

  const stopPoll = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startPoll = useCallback(() => {
    if (timerRef.current !== null) return;
    timerRef.current = setInterval(() => {
      if (Date.now() >= pollUntilRef.current && !awaitingRef.current) {
        stopPoll();
        return;
      }
      void load(true);
    }, POLL_MS);
  }, [load, stopPoll]);

  /* ── 换会话：清空重来 ─────────────────────────────────────────────── */
  useEffect(() => {
    aliveRef.current = true;
    setServer([]);
    setEchoes([]);
    setRuns([]);
    setTruncated(false);
    setStatus(sessionId && src.loadTimeline ? 'loading' : 'idle');
    pollUntilRef.current = 0;
    if (!sessionId || !src.loadTimeline) {
      stopPoll();
      return;
    }
    pollUntilRef.current = Date.now() + DISCOVERY_MS;
    void load(false);
    startPoll();
    return () => {
      aliveRef.current = false;
      stopPoll();
      for (const close of runClosesRef.current.values()) close();
      runClosesRef.current.clear();
    };
  }, [sessionId, src, load, startPoll, stopPoll]);

  /* ── 等应答期间保持轮询；等完再留一段发现窗口 ─────────────────────── */
  const prevAwaiting = useRef(awaiting);
  useEffect(() => {
    if (status !== 'ready') return;
    const was = prevAwaiting.current;
    prevAwaiting.current = awaiting;
    if (awaiting) {
      pollUntilRef.current = Math.max(pollUntilRef.current, Date.now() + DISCOVERY_MS);
      startPoll();
      return;
    }
    // 只在「真→假」这个边沿上补一次：run 的注册比第一句回话晚一点点是常态，
    // 这时列表里可能还看不到它，重读一次并把发现窗口留住。
    if (!was) return;
    pollUntilRef.current = Math.max(pollUntilRef.current, Date.now() + DISCOVERY_MS);
    startPoll();
    void load(true);
  }, [awaiting, status, startPoll, load]);

  /* ── 活跃 run：一条流一份订阅，终态即退订 ─────────────────────────── */
  const activeKey = runs
    .filter((r) => isActiveRun(r.status))
    .map((r) => r.sessionId)
    .join(',');

  useEffect(() => {
    const watch = src.watchRunStream;
    if (!sessionId || !watch) return;
    const active = activeKey ? activeKey.split(',') : [];

    for (const [id, close] of runClosesRef.current) {
      if (active.includes(id)) continue;
      close();
      runClosesRef.current.delete(id);
    }
    for (const id of active) {
      if (runClosesRef.current.has(id)) continue;
      const close = watch(id, {
        onMessage: (msg) => setServer((prev) => upsertTimeline(prev, msg)),
        onPatch: (patch) => setServer((prev) => applyTimelinePatchToList(prev, patch)),
        // 收尾：用时、工具数、终态都在全量读里，重读一次补齐
        onSettle: () => void load(true),
      });
      runClosesRef.current.set(id, close);
    }
  }, [sessionId, activeKey, src, load]);

  const echo = useCallback((text: string) => {
    const body = text.trim();
    if (!body) return;
    echoSeqRef.current += 1;
    const id = `${ECHO_PREFIX}${Date.now()}-${echoSeqRef.current}`;
    setEchoes((prev) => [
      ...prev,
      { id, kind: 'user_turn', turn_id: id, ts: Date.now(), text: body },
    ]);
    pollUntilRef.current = Math.max(pollUntilRef.current, Date.now() + DISCOVERY_MS);
    startPoll();
  }, [startPoll]);

  const messages = useMemo(() => reconcileTimeline(server, echoes), [server, echoes]);

  /** 最近一条终态 run id（后续建议卡用）；宽松取字段——映射层不过这些杂帧。 */
  const lastSettledRunId = useMemo(() => {
    const ids: string[] = [];
    for (const m of server) {
      const raw = m as unknown as Record<string, unknown>;
      if (m.kind === 'run_foot' && typeof raw.run_id === 'string') ids.push(raw.run_id);
    }
    return ids[ids.length - 1] ?? null;
  }, [server]);

  /** run 保存团队帧（team-saved）→ 引导卡数据。 */
  const teamSaved = useMemo(() => {
    for (const m of server) {
      const raw = m as unknown as Record<string, unknown>;
      if (m.kind === 'team_saved' || m.kind === 'team-saved') {
        return {
          name: typeof raw.name === 'string' ? raw.name : '',
          agent_ids: Array.isArray(raw.agent_ids) ? (raw.agent_ids as string[]) : [],
        };
      }
    }
    return null;
  }, [server]);

  return { status, messages, truncated, echo, lastSettledRunId, teamSaved };
}
