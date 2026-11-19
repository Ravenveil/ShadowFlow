/**
 * collaboration 域 — groups 子域领域模型（纯规则层）
 *
 * 群/DM 的成员语义、消息 reactions 去重、置顶翻转、kind 过滤与存储形归一，
 * 纯函数，禁止 import express/sqlite/crypto/fs。
 *
 * 关键不变量：
 *   - DM 幂等：同 workspace 内 agent_ids 恰为 [agentId] 的 dm 群唯一，重复调用返回同一条
 *   - reactions 是 emoji → 用户集合；取消最后一个用户时剪掉该 emoji 桶（不留空数组）
 *   - 置顶省略参数 = 翻转当前态（不是「设为 true」）
 *   - 列表默认只列 kind=group，DM 必须显式指定
 */

export type GroupKind = 'group' | 'dm';
export type SenderKind = 'user' | 'agent' | 'system';

export const GROUP_KINDS: readonly GroupKind[] = ['group', 'dm'];
export const SENDER_KINDS: readonly SenderKind[] = ['user', 'agent', 'system'];

/** 容错 JSON 解析：坏数据/空值一律回退，不猜。 */
export function parseJsonSafe<T>(raw: string | null | undefined, fallback: T): T {
  if (raw == null || raw === '') return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** 非法/缺失的 sender_kind 归一到 user（历史数据可能是任意串）。 */
export function normalizeSenderKind(v: unknown): SenderKind {
  return v === 'agent' || v === 'system' ? v : 'user';
}

/** 非法/缺失的 kind 归一到 group。 */
export function normalizeGroupKind(v: unknown): GroupKind {
  return v === 'dm' ? 'dm' : 'group';
}

/**
 * 列表过滤的 kind 归一：未指定或空数组 → 只列 group（DM 不进默认列表）。
 * 这条规则直接影响产品行为（群列表里不该混进单聊）。
 */
export function resolveKindsFilter(kinds: readonly string[] | undefined): string[] {
  return kinds && kinds.length > 0 ? [...kinds] : ['group'];
}

/**
 * 切换一个 emoji 反应。返回新 map（不改入参）。
 * 空桶剪枝：最后一个用户取消后删除该 emoji 键。
 */
export function toggleReaction(
  reactions: Record<string, string[]>,
  emoji: string,
  userId: string,
  on: boolean,
): Record<string, string[]> {
  const next: Record<string, string[]> = { ...reactions };
  const users = new Set(next[emoji] ?? []);
  if (on) users.add(userId);
  else users.delete(userId);
  if (users.size > 0) next[emoji] = Array.from(users);
  else delete next[emoji];
  return next;
}

/** 置顶：省略 → 翻转当前态；显式 true/false → 直接设。 */
export function nextPinned(current: boolean, pinned?: boolean): boolean {
  return pinned === undefined ? !current : pinned;
}

/** DM 命中：agent_ids 恰为该 agent 一条（多 agent 群不是 DM）。 */
export function isDmForAgent(agentIds: readonly string[], agentId: string): boolean {
  return agentIds.length === 1 && agentIds[0] === agentId;
}

/** per-user-per-group 偏好（对齐 Python UserGroupSetting 默认值，五字段全集）。 */
export interface UserGroupSettingShape {
  muted: boolean;
  pinned: boolean;
  folded: boolean;
  show_nickname: boolean;
  my_nickname: string | null;
}

/** 用户从未存过偏好时的干净默认：不静音、不置顶、不折叠、显示昵称、无自定义昵称。 */
export function defaultUserSetting(): UserGroupSettingShape {
  return {
    muted: false,
    pinned: false,
    folded: false,
    show_nickname: true,
    my_nickname: null,
  };
}
