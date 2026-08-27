/**
 * messageFeedback.ts — 消息 👍/👎 反馈 REST 客户端（2026-08-22 L1 缺口补齐）。
 *
 * 后端（Python，shadowflow/api/groups.py）：
 *   POST /api/messages/{mid}/feedback { rating: 1 | -1, user_id? } — 每用户一票，
 *        重复同一 rating = 撤销（toggle），换向 = 切换。
 *   GET  /api/messages/{mid}/feedback?user_id=                    — 计数 + 我的票。
 *
 * message_id 对群聊消息 = 群记录的 message_id；对单聊（run-session）消息 =
 * TimelineMessage.id（Node 管线生成）。后端按 id 独立存储，两种都可用。
 */
import { getApiBase } from './_base';

export interface MessageFeedback {
  message_id: string;
  up: number;
  down: number;
  /** 当前 userId 自己的票：1 / -1 / null（未投）。 */
  my_rating: 1 | -1 | null;
}

function parse(json: unknown, messageId: string): MessageFeedback {
  const data = (json as { data?: Partial<MessageFeedback> })?.data ?? {};
  const my = data.my_rating;
  return {
    message_id: typeof data.message_id === 'string' ? data.message_id : messageId,
    up: typeof data.up === 'number' ? data.up : 0,
    down: typeof data.down === 'number' ? data.down : 0,
    my_rating: my === 1 || my === -1 ? my : null,
  };
}

export async function getMessageFeedback(
  messageId: string,
  userId = 'anonymous',
): Promise<MessageFeedback> {
  const res = await fetch(
    `${getApiBase()}/api/messages/${encodeURIComponent(messageId)}/feedback?user_id=${encodeURIComponent(userId)}`,
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parse(await res.json(), messageId);
}

export async function postMessageFeedback(
  messageId: string,
  rating: 1 | -1,
  userId = 'anonymous',
): Promise<MessageFeedback> {
  const res = await fetch(
    `${getApiBase()}/api/messages/${encodeURIComponent(messageId)}/feedback`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating, user_id: userId }),
    },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parse(await res.json(), messageId);
}
