/**
 * groups-event-bus.ts — 后端合一·阶段1b（2026-06-12）：Node 侧群 SSE 内存总线。
 *
 * 对齐 Python shadowflow/api/_group_events.py 的 per-group in-process pub/sub。
 * SF_GROUPS_BACKEND==='node' 时，groups-node.ts 的 GET /:id/events 订阅本总线；
 * groups-chat.ts 网关在 node 模式下把 agent 回复 / system 通知 publish 到这里，
 * 浏览器即可实时看到（取代 Python SSE bus）。
 *
 * 事件形状：{ type: 'agent.message' | 'system.notice' | 'agent.typing', data: {...} }。
 * SSE 端把 type → `event:` 行、data → `data:` 行。
 *
 * 设计同 Python：
 *   - 仅进程内（多 worker 不跨进程；单进程 Node 网关无此问题）。
 *   - best-effort：listener 抛错被吞，不阻塞 publisher。
 *   - 自清理：最后一个 listener 退订后删除该 group 的 bucket。
 */

export interface GroupEvent {
  type: string;
  data: unknown;
}

type Listener = (event: GroupEvent) => void;

const subscribers = new Map<string, Set<Listener>>();

/** 订阅某群事件。 */
export function subscribe(groupId: string, fn: Listener): void {
  let set = subscribers.get(groupId);
  if (!set) {
    set = new Set();
    subscribers.set(groupId, set);
  }
  set.add(fn);
}

/** 退订；bucket 空时删除（防止无界增长）。 */
export function unsubscribe(groupId: string, fn: Listener): void {
  const set = subscribers.get(groupId);
  if (!set) return;
  set.delete(fn);
  if (set.size === 0) subscribers.delete(groupId);
}

/** 向某群所有订阅者推送一个事件。无订阅者 = no-op。listener 抛错被吞。 */
export function publishGroupEvent(groupId: string, event: GroupEvent): void {
  const set = subscribers.get(groupId);
  if (!set) return;
  for (const fn of [...set]) {
    try {
      fn(event);
    } catch {
      /* best-effort — 一个坏 listener 不能阻塞其他订阅者 */
    }
  }
}

/** 订阅者数（测试用）。 */
export function subscriberCount(groupId: string): number {
  return subscribers.get(groupId)?.size ?? 0;
}
