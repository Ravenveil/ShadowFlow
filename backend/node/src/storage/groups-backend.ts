/**
 * groups-backend.ts — 群读写后端（ADR-0001：唯一实现 = Node SQLite store）。
 *
 * 历史：2026-06-12 引入 python/node/dual 三实现按 `SF_GROUPS_BACKEND` 分派；
 * 2026-11-24 Python 退役，python/dual 两个实现（HTTP 打 :8000 与双写 diff
 * 报警）随之删除，只保留 Node 直调 groups-store 的一条路径。
 *
 * 网关只依赖三个方法（不是 groups-store 全集）：
 *   - getGroup(id)        → { agent_ids, messages, workspace_dir, team_id, kind } | null
 *   - appendMessage(id,b) → 追加一条消息（noDispatch 仅旧 Python 语义；无回复桥，忽略）
 *   - listMessages(id)    → 该群消息（升序）
 *
 * 形状对齐：返回蛇形 key 的群/消息形状，与原 Python record JSON 一致，
 * 所以 groups-chat.ts 的 GroupRecord/ChatMessageItem 解构无需区分后端。
 */

import * as store from './groups-store';

/** 网关消费的最小群形状（蛇形，与原 Python record JSON 对齐）。 */
export interface BackendGroup {
  group_id?: string;
  agent_ids?: string[];
  messages?: Array<{
    message_id?: string;
    sender_name?: string;
    sender_kind?: string;
    content?: string;
    timestamp?: string;
    reply_to?: string | null;
    /** U0 绑角色（2026-06-23）— agent 消息发送者 agent_id 真源；user/system 为 null。 */
    agent_id?: string | null;
  }>;
  kind?: string;
  workspace_dir?: string | null;
  team_id?: string | null;
  [k: string]: unknown;
}

export interface AppendMessageBody {
  content: string;
  sender_name: string;
  sender_kind: string;
  /** U0 绑角色 — agent 消息发送者 agent_id（Node store 暂未落该列，见 appendMessage）。 */
  agent_id?: string;
}

export interface AppendMessageOpts {
  /** 旧 Python 语义：抑制其自带回复桥。Node 无桥 → 忽略。 */
  noDispatch?: boolean;
}

/** 网关只依赖这三个方法。 */
export interface GroupsBackend {
  getGroup(groupId: string): Promise<BackendGroup | null>;
  appendMessage(
    groupId: string,
    body: AppendMessageBody,
    opts?: AppendMessageOpts,
  ): Promise<unknown>;
  listMessages(groupId: string): Promise<BackendGroup['messages']>;
}

const nodeBackend: GroupsBackend = {
  async getGroup(groupId) {
    return store.getGroup(groupId) as BackendGroup | null;
  },

  async appendMessage(groupId, body) {
    // Node 无旧 Python 回复桥，noDispatch 无意义（网关本就是唯一回复来源）。
    // 群不存在时 groups-store.appendGroupMessage 抛错 → 网关 catch → 502
    // PERSIST_FAILED（与旧 Python 语义一致）。
    // U0 绑角色 TODO：Node SQLite store 暂未落 agent_id 列；待加列后透传
    // body.agent_id（前端 U0 头像归属目前靠 SSE 帧合并兜底，见 groups-chat.ts）。
    return store.appendGroupMessage(groupId, {
      content: body.content,
      sender_name: body.sender_name,
      sender_kind: body.sender_kind as store.SenderKind,
    });
  },

  async listMessages(groupId) {
    return store.listGroupMessages(groupId) as BackendGroup['messages'];
  },
};

/** 唯一实现：Node SQLite 直调。返回函数形式保留调用方零改动。 */
export function getGroupsBackend(): GroupsBackend {
  return nodeBackend;
}
