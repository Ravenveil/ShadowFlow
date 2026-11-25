/**
 * message-feedback.ts — 单后端迁移：/api/messages/:mid/feedback 的 Node 数据层
 * （移植自 Python backend/python/shadowflow/api/groups/groups.py 的 L1 feedback 段）。
 *
 * 存储：<repo>/.shadowflow/feedback/message_feedback.json
 * Shape：{ message_id: { user_id: 1|-1 } }；每用户一票，同票 toggle、反票切换。
 * 原子写 tmp + rename，legacy↔single 共享同一文件。
 */

import fs from 'fs';
import path from 'path';
import { repoDataFile } from '../adapters/infra-repo-root';

// 对齐 Python _validate_message_id（见 groups.py）——允许常见 id 字符，禁路径穿越。
const MESSAGE_ID_RE = /^[a-zA-Z0-9_.:-]{1,256}$/;

export function isValidMessageId(id: string): boolean {
  return MESSAGE_ID_RE.test(id);
}

type RatingMap = Record<string, number>;
type FeedbackStore = Record<string, RatingMap>;

function feedbackFile(): string {
  return repoDataFile('feedback', 'message_feedback.json');
}

export function loadFeedbackStore(): FeedbackStore {
  const file = feedbackFile();
  try {
    if (!fs.existsSync(file)) return {};
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as FeedbackStore)
      : {};
  } catch {
    return {};
  }
}

function saveFeedbackStore(store: FeedbackStore): void {
  const file = feedbackFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(store), 'utf-8');
  fs.renameSync(tmp, file);
}

export interface FeedbackView {
  message_id: string;
  up: number;
  down: number;
  my_rating: 1 | -1 | null;
}

function view(store: FeedbackStore, messageId: string, userId: string): FeedbackView {
  const ratings = store[messageId] || {};
  let up = 0;
  let down = 0;
  for (const r of Object.values(ratings)) {
    if (r === 1) up += 1;
    else if (r === -1) down += 1;
  }
  const my = ratings[userId];
  return {
    message_id: messageId,
    up,
    down,
    my_rating: my === 1 || my === -1 ? my : null,
  };
}

/** 读取某消息的投票视图（GET）。 */
export function getFeedback(messageId: string, userId: string): FeedbackView {
  return view(loadFeedbackStore(), messageId, userId);
}

/** 投一票（POST）：同票撤销、反票切换；返回最新视图。 */
export function postFeedback(messageId: string, rating: 1 | -1, userId: string): FeedbackView {
  const store = loadFeedbackStore();
  const ratings: RatingMap = { ...(store[messageId] || {}) };
  if (ratings[userId] === rating) delete ratings[userId];
  else ratings[userId] = rating;
  if (Object.keys(ratings).length) store[messageId] = ratings;
  else delete store[messageId];
  saveFeedbackStore(store);
  return view(store, messageId, userId);
}
