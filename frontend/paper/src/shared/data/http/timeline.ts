/**
 * timeline.ts — 会话时间线的**传输层**：读一次全量 + 订一条 run 的过程流。
 *
 * 为什么是两条通道：
 *   `GET /timeline`            —— 历史。后端已经把「群聊天消息」与「每个 run
 *                                 的事件日志重放结果」按时间归并好，还顺手
 *                                 给了 run 列表，前端不必自己拼。
 *   `GET /run-sessions/:id/stream` —— 实时。跑着的那条 run 把过程一帧一帧推
 *                                 过来（message 长出新格、message-patch 就地
 *                                 补字），这是「思考与工具调用实时可见」的来源。
 *
 * 两条通道的分工写在返回的 `runs[]` 里：非终态的才值得订阅，跑完的从
 * 全量读里就有。这里只管搬运和过滤坏帧，状态机在 `runtime/chat/useTimeline`。
 */
import { API_BASE, ROUTES, mayGet } from '@/shared/data/http/client';
import { toTimelineMessage, toTimelineSnapshot } from '@/shared/data/http/mappers';
import type { TimelineMessage, TimelinePatch, TimelineSnapshot } from '@/shared/data/types';

/** 读一次全量时间线。群不存在 / 后端读路径不可用 → null（调用方回落旧消息流）。 */
export async function fetchTimeline(groupId: string): Promise<TimelineSnapshot | null> {
  const raw = await mayGet<unknown>(ROUTES.groupTimeline(groupId));
  return raw ? toTimelineSnapshot(raw) : null;
}

export interface RunStreamHandlers {
  /** 新的一格。 */
  onMessage: (msg: TimelineMessage) => void;
  /** 就地长一块（流式正文、步骤树、工具终态）。 */
  onPatch: (patch: TimelinePatch) => void;
  /** 这一轮有了结论（跑完 / 出错 / 中止）：该重读一次全量补齐收尾与终态。 */
  onSettle: () => void;
}

function parse(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

/**
 * 订一条 run 的过程流；返回退订函数。
 *
 * 断线不重连：时间线本身有轮询兜底，重连策略留给上层统一决定，
 * 这里只保证「不因为一条流的抖动把界面拖住」。
 */
export function watchRun(sessionId: string, handlers: RunStreamHandlers): () => void {
  if (typeof EventSource === 'undefined' || !sessionId) return () => {};

  const es = new EventSource(`${API_BASE}${ROUTES.runStream(sessionId)}`);
  let closed = false;

  const close = (): void => {
    if (closed) return;
    closed = true;
    es.close();
  };

  const onMessage = (ev: Event): void => {
    const msg = toTimelineMessage(parse((ev as MessageEvent<string>).data));
    if (msg) handlers.onMessage({ ...msg, session_id: sessionId });
  };

  const onPatch = (ev: Event): void => {
    const raw = parse((ev as MessageEvent<string>).data);
    if (!raw || typeof raw !== 'object') return;
    const p = raw as Record<string, unknown>;
    if (typeof p.id !== 'string' || typeof p.op !== 'string') return;
    handlers.onPatch(p as unknown as TimelinePatch);
  };

  const onSettle = (): void => {
    handlers.onSettle();
    close();
  };

  const onError = (): void => {
    // 服务端主动收流（终态回放）与真断线在 EventSource 里长得一样：
    // 都当成「这条流没有更多可看的了」，交给上层重读全量。
    if (!closed) handlers.onSettle();
    close();
  };

  es.addEventListener('message', onMessage);
  es.addEventListener('message-patch', onPatch);
  for (const name of ['complete', 'error', 'aborted', 'retry-pending']) {
    es.addEventListener(name, onSettle);
  }
  es.addEventListener('error', onError);

  return close;
}
