/**
 * events.ts — 群事件流（SSE）订阅。
 *
 * 后端 `POST /api/groups/:id/messages` 是「收下消息就 201」，agent 的回复
 * 随后从 `GET /api/groups/:id/events` 推过来（同进程内存总线）。
 * 所以「发出去」和「看到回复」是两件事 —— 本文件负责后一半。
 *
 * 只暴露一个函数：给一个群 id，回调每帧（type + data），返回退订函数。
 * 断线重连交给 EventSource 自己（它内置 Last-Event-ID 重连 + 后端环形缓冲补帧）。
 */
import { API_BASE, ROUTES } from './client';

/** 进消息流的帧类型；typing 之类不入流。 */
export const MESSAGE_FRAME_TYPES = ['agent.message', 'system.notice'] as const;

export type MessageFrameType = (typeof MESSAGE_FRAME_TYPES)[number];

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

/**
 * 订阅一个群的消息帧。
 * @param groupId 会话 id（后端群 id）
 * @param onFrame 每帧回调；解析失败的帧直接丢弃，不打断连接
 * @returns 退订函数（组件卸载 / 切会话时调用）
 */
export function watchGroup(
  groupId: string,
  onFrame: (type: MessageFrameType, data: unknown) => void,
): () => void {
  if (typeof EventSource === 'undefined' || !groupId) return () => {};

  const es = new EventSource(`${API_BASE}${ROUTES.groupEvents(groupId)}`);

  const handlers = MESSAGE_FRAME_TYPES.map((type) => {
    const handler = (ev: Event) => {
      const data = safeParse((ev as MessageEvent<string>).data);
      if (data) onFrame(type, data);
    };
    es.addEventListener(type, handler);
    return [type, handler] as const;
  });

  return () => {
    for (const [type, handler] of handlers) es.removeEventListener(type, handler);
    es.close();
  };
}
