/**
 * useOnboardingGate — 首访入职问卷的触发面收口（2026-11-07）。
 *
 * 契约（NeoOnboardingModal 文档口径）：触发 = 首访标记缺失 + **进入秘书的
 * 会话**（欢迎语上屏后延迟 ONBOARDING_DELAY_MS 弹出）。此前实现只看
 * `nav.view === 'conversation'`——任意会话视图（别的 agent 的 DM / 群聊）
 * 都在 800ms 后弹问卷，与文档不符；且自我介绍恒发进秘书的会话
 * （NeoApp handleOnboardingFinished），弹窗所在会话与消息目标错位。
 *
 * 触发判定（shouldOpenOnboarding 纯谓词，全部分支可直测）：
 *   - done（sf.onboarding.done）→ 永不弹；
 *   - nav 不在会话视图 → 不弹；
 *   - 只有 nav.groupId === 秘书 DM 的 group_id 才弹；
 *   - 秘书 gid 解析不到（inbox 未加载且 resolve 失败）→ 不弹（fail-closed，
 *     与其弹错会话不如等下次进入秘书会话再弹）。
 *
 * 秘书 gid 解析序与 NeoApp handleOnboardingFinished 的消息目标取法**同源**：
 *   1. inbox 的 agentDMs 按 SECRETARY_AGENT_ID 同步取（已加载时零请求）；
 *   2. 回落 resolveDmConversation（find-or-create，幂等）。
 * 两者一致保证「弹窗所在会话 = 自我介绍的落点」。
 */
import { useCallback, useEffect, useState } from 'react';
import { resolveDmConversation } from '../api/groupApi';
import { useInboxStore } from '../core/store/useInboxStore';
import { useWorkspaceStore } from '../store/workspaceStore';
import { ONBOARDING_DONE_KEY } from './NeoOnboardingModal';
import { SECRETARY_AGENT_ID } from './secretary';
import type { NeoNav } from './types';

/** 欢迎语先上屏的让位延迟（进入秘书会话后 800ms 弹）。 */
export const ONBOARDING_DELAY_MS = 800;

/** 首访标记（localStorage 不可用视为已完成——宁可不弹也不误弹）。 */
export function isOnboardingDone(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_DONE_KEY) === '1';
  } catch {
    return true;
  }
}

/**
 * 纯谓词：当前会话是否是「秘书的会话」且应弹问卷。
 * secretaryGid 未解析（null/undefined）一律 false（fail-closed）。
 */
export function shouldOpenOnboarding(input: {
  done: boolean;
  navView: string;
  navGroupId: string;
  secretaryGid: string | null | undefined;
}): boolean {
  return (
    !input.done &&
    input.navView === 'conversation' &&
    Boolean(input.secretaryGid) &&
    input.navGroupId === input.secretaryGid
  );
}

/**
 * 触发面 hook：返回 open 态与 close()。
 * - 触发判定进 shouldOpenOnboarding；本 hook 只管解析秘书 gid + 延迟 + 取消。
 * - nav 切走 / inbox 到达 / 组件卸载都清计时器（800ms 内离开 = 不弹）。
 * - open 后 close() 由调用方在跳过/提交收口时调用（done 标记同前：
 *   提交由 NeoOnboardingModal 落、跳过由 NeoApp 落）。
 */
export function useOnboardingGate(nav: NeoNav): {
  open: boolean;
  close: () => void;
} {
  const inboxDMs = useInboxStore((s) => s.agentDMs);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  // 派生值：Union 上直接读 groupId 不合法，收窄后取出供 effect 与依赖共用。
  const inConversation = nav.view === 'conversation';
  const navGroupId = inConversation ? nav.groupId : '';

  useEffect(() => {
    if (!inConversation || !navGroupId) return;
    if (isOnboardingDone()) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const arm = (secretaryGid: string | null | undefined) => {
      if (!alive) return;
      if (
        !shouldOpenOnboarding({
          done: false,
          navView: 'conversation',
          navGroupId,
          secretaryGid,
        })
      ) {
        return;
      }
      timer = setTimeout(() => {
        if (alive) setOpen(true);
      }, ONBOARDING_DELAY_MS);
    };
    const syncGid =
      (inboxDMs ?? []).find((d) => d.agentId === SECRETARY_AGENT_ID)?.group_id ?? null;
    if (syncGid) {
      arm(syncGid);
    } else {
      // inbox 未加载/不含秘书 DM：回落 find-or-create 解析（与消息落点同源）。
      // 失败 → arm(null) 走 fail-closed 分支。
      resolveDmConversation(SECRETARY_AGENT_ID, useWorkspaceStore.getState().currentId)
        .then((gid) => arm(gid))
        .catch(() => arm(null));
    }
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [inConversation, navGroupId, inboxDMs]);

  return { open, close };
}
