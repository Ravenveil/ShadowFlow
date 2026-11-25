/**
 * avatarRegistry.ts — Agent 头像的全局唯一真源。
 *
 * 用户要求：主控（董事长）分发团队 / Agent 时，每个 Agent 绑定**唯一**头像；
 * 在灵魂面板改一次，聊天区、会话列表、编队、策略矩阵、DAG 全部同步。
 *
 * 关键点：不能只在「显式配过头像」时才登记 —— 未配的 Agent 在各视图会用
 * 不同标签（`Coordinator · 主控` / `主控`）各自回落到身份表，算出不同的脸。
 * 所以这里对**每个** Agent 都登记一条有效头像：
 *   style 有 → 用该 DiceBear 风格；没有 → 用身份表的 micah 脸；
 *   seed   → 显式 seed，否则取身份表按规范名算出的 seed（同一 Agent 恒等）；
 *   color  → 显式色，否则身份表色。
 * 查表键覆盖 agent_id / 全名 / 名字各段，任何视图传哪种写法都能命中同一个人。
 */
import { useSyncExternalStore } from 'react';
import { agentIdentity } from '@/shared/data/identities';

export interface AgentAvatarInfo {
  /** 有值 = 用该 DiceBear 风格渲染；无值 = 用身份表的 micah 脸。 */
  style?: string;
  seed: string;
  color: string;
  /** 提示词生成的定制图（dataURL/URL），有则优先。 */
  image?: string;
}

export interface AgentAvatarSource {
  agent_id: string;
  name?: string;
  avatar_style?: string;
  avatar_seed?: string;
  avatar_image?: string;
  avatar_color?: string;
}

const norm = (s: string): string => s.trim().toLowerCase();

/** 归一化键集合：id / 全名 / 名字各段（`A · B` 取 A、B）。 */
function keysOf(src: AgentAvatarSource): string[] {
  const keys = new Set<string>();
  if (src.agent_id) keys.add(norm(src.agent_id));
  const name = (src.name ?? '').trim();
  if (name) {
    keys.add(norm(name));
    for (const part of name.split(/[·|/]/)) {
      const p = part.trim();
      if (p && p.length >= 2) keys.add(norm(p));
    }
  }
  return [...keys];
}

/** 由后端字段 + 身份表兜底算出该 Agent 的有效头像。 */
function buildInfo(src: AgentAvatarSource): AgentAvatarInfo {
  const base = agentIdentity(src.name || src.agent_id);
  return {
    style: src.avatar_style || undefined,
    // 用户定版（2026-11-25）：seed 固定用身份表值（如董事长恒 'CEO'），不拼 agent_id ——
    // 拼了 id 每次后端重建 agent 脸就变，用户要求「固定之前的那个头像，不用再换」。
    seed: src.avatar_seed || base.seed,
    color: src.avatar_color || base.color,
    image: src.avatar_image || undefined,
  };
}

let table = new Map<string, AgentAvatarInfo>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** 全量灌入（Shell 启动 / 团队刷新时调）；每个 Agent 都会登记。 */
export function setAgentAvatars(list: AgentAvatarSource[]): void {
  const next = new Map<string, AgentAvatarInfo>();
  for (const item of list) {
    const info = buildInfo(item);
    for (const k of keysOf(item)) next.set(k, info);
  }
  table = next;
  emit();
}

/** 单个 Agent 头像更新（灵魂面板保存成功后调，即时全局生效）。 */
export function patchAgentAvatar(src: AgentAvatarSource): void {
  const info = buildInfo(src);
  for (const k of keysOf(src)) table.set(k, info);
  emit();
}

/** 删除 Agent 后清掉它的登记（不让其他视图继续显示已删的人）。 */
export function removeAgentAvatar(src: AgentAvatarSource): void {
  for (const k of keysOf(src)) table.delete(k);
  emit();
}

/** 按 id / 名字 / 名字段查头像；未命中返回 undefined（回落身份表）。 */
export function lookupAgentAvatar(key: string | null | undefined): AgentAvatarInfo | undefined {
  if (!key) return undefined;
  const k = norm(key);
  const hit = table.get(k);
  if (hit) return hit;
  // 宽松匹配：短名（如「主控」）匹配到已登记键里包含它的那个人。
  for (const [tKey, info] of table) {
    if (tKey.includes(k) || k.includes(tKey)) return info;
  }
  return undefined;
}

/** React 绑定：表变化时重渲染。 */
export function useAgentAvatar(key: string | null | undefined): AgentAvatarInfo | undefined {
  return useSyncExternalStore(
    subscribe,
    () => lookupAgentAvatar(key),
    () => undefined,
  );
}
