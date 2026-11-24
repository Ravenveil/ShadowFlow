/**
 * useOnboardingGate 测试（2026-11-07，入职问卷触发面收口）。
 *
 * 契约（NeoOnboardingModal 文档口径「触发：进入秘书的会话」）：
 *   - 只有**秘书的会话**（nav.groupId === 秘书 DM gid）才弹问卷——
 *     别的 agent 的 DM / 群聊会话误弹即红；
 *   - 首访标记（sf.onboarding.done）已置 → 永不弹（连 resolve 都不发）；
 *   - 秘书 gid 解析不到（inbox 空 + resolve 失败/null）→ 不弹（fail-closed）；
 *   - 秘书 gid 取值与自我介绍落点同源：inbox agentDMs 同步取，
 *     回落 resolveDmConversation；
 *   - 800ms 让位延迟：到点才弹；期间切走会话即取消，回秘书会话再弹。
 */
import { renderHook, act } from '../../test/utils';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import {
  useOnboardingGate,
  shouldOpenOnboarding,
  isOnboardingDone,
  ONBOARDING_DELAY_MS,
} from '../useOnboardingGate';
import { ONBOARDING_DONE_KEY } from '../NeoOnboardingModal';
import { SECRETARY_AGENT_ID } from '../secretary';
import type { NeoNav } from '../types';
import { resolveDmConversation } from '../../api/groupApi';
import { useInboxStore } from '../../core/store/useInboxStore';
import type { AgentDMItem } from '../../common/types/inbox';

vi.mock('../../api/groupApi', () => ({ resolveDmConversation: vi.fn() }));

const GID_SEC = 'g-secretary-dm';
const GID_OTHER = 'g-other-agent-dm';
const GID_GROUP = 'g-team-group';

const conv = (groupId: string): NeoNav => ({ view: 'conversation', groupId });

const dmItem = (agentId: string, group_id: string): AgentDMItem =>
  ({ agentId, agentName: agentId, group_id }) as unknown as AgentDMItem;

/** inbox 已含秘书 DM（同步路径，不发 resolve 请求）。 */
const seedInboxWithSecretary = () => {
  useInboxStore.setState({ agentDMs: [dmItem(SECRETARY_AGENT_ID, GID_SEC)] });
};

beforeEach(() => {
  localStorage.clear();
  useInboxStore.setState({ agentDMs: [] });
  vi.mocked(resolveDmConversation).mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('shouldOpenOnboarding — 纯谓词', () => {
  it('秘书会话 + 首访 → true', () => {
    expect(
      shouldOpenOnboarding({
        done: false,
        navView: 'conversation',
        navGroupId: GID_SEC,
        secretaryGid: GID_SEC,
      }),
    ).toBe(true);
  });

  it('done=true → false（即便秘书会话）', () => {
    expect(
      shouldOpenOnboarding({
        done: true,
        navView: 'conversation',
        navGroupId: GID_SEC,
        secretaryGid: GID_SEC,
      }),
    ).toBe(false);
  });

  it('非会话视图 → false', () => {
    expect(
      shouldOpenOnboarding({
        done: false,
        navView: 'home',
        navGroupId: GID_SEC,
        secretaryGid: GID_SEC,
      }),
    ).toBe(false);
  });

  it('别的会话（DM/群聊）→ false', () => {
    for (const navGroupId of [GID_OTHER, GID_GROUP]) {
      expect(
        shouldOpenOnboarding({
          done: false,
          navView: 'conversation',
          navGroupId,
          secretaryGid: GID_SEC,
        }),
      ).toBe(false);
    }
  });

  it('secretaryGid 未解析（null/undefined）→ false（fail-closed）', () => {
    for (const secretaryGid of [null, undefined, '']) {
      expect(
        shouldOpenOnboarding({
          done: false,
          navView: 'conversation',
          navGroupId: GID_SEC,
          secretaryGid,
        }),
      ).toBe(false);
    }
  });
});

describe('isOnboardingDone', () => {
  it('无标记 → false；置 1 → true', () => {
    expect(isOnboardingDone()).toBe(false);
    localStorage.setItem(ONBOARDING_DONE_KEY, '1');
    expect(isOnboardingDone()).toBe(true);
  });

  it('localStorage 不可用 → 视为已完成（不弹）', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('quota');
    });
    try {
      expect(isOnboardingDone()).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('useOnboardingGate — 触发面', () => {
  it('秘书会话：800ms 让位后弹出（到点前不弹）', () => {
    vi.useFakeTimers();
    seedInboxWithSecretary();
    const { result } = renderHook(() => useOnboardingGate(conv(GID_SEC)));
    act(() => {
      vi.advanceTimersByTime(ONBOARDING_DELAY_MS - 1);
    });
    expect(result.current.open).toBe(false);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.open).toBe(true);
    // 同步路径不发 resolve 请求
    expect(resolveDmConversation).not.toHaveBeenCalled();
  });

  it('别的 agent 的 DM 会话不弹（文档「秘书会话」口径，误弹即红）', () => {
    vi.useFakeTimers();
    seedInboxWithSecretary();
    const { result } = renderHook(() => useOnboardingGate(conv(GID_OTHER)));
    act(() => {
      vi.advanceTimersByTime(ONBOARDING_DELAY_MS * 2);
    });
    expect(result.current.open).toBe(false);
  });

  it('群聊会话不弹', () => {
    vi.useFakeTimers();
    seedInboxWithSecretary();
    const { result } = renderHook(() => useOnboardingGate(conv(GID_GROUP)));
    act(() => {
      vi.advanceTimersByTime(ONBOARDING_DELAY_MS * 2);
    });
    expect(result.current.open).toBe(false);
  });

  it('首访标记已置 → 不弹且不发 resolve', () => {
    vi.useFakeTimers();
    localStorage.setItem(ONBOARDING_DONE_KEY, '1');
    const { result } = renderHook(() => useOnboardingGate(conv(GID_SEC)));
    act(() => {
      vi.advanceTimersByTime(ONBOARDING_DELAY_MS * 2);
    });
    expect(result.current.open).toBe(false);
    expect(resolveDmConversation).not.toHaveBeenCalled();
  });

  it('非会话视图不弹', () => {
    vi.useFakeTimers();
    seedInboxWithSecretary();
    const { result } = renderHook(() => useOnboardingGate({ view: 'home' }));
    act(() => {
      vi.advanceTimersByTime(ONBOARDING_DELAY_MS * 2);
    });
    expect(result.current.open).toBe(false);
  });

  it('inbox 未加载 → 回落 resolveDmConversation；命中秘书会话即弹', async () => {
    vi.useFakeTimers();
    vi.mocked(resolveDmConversation).mockResolvedValue(GID_SEC);
    const { result } = renderHook(() => useOnboardingGate(conv(GID_SEC)));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ONBOARDING_DELAY_MS);
    });
    expect(resolveDmConversation).toHaveBeenCalledTimes(1);
    expect(vi.mocked(resolveDmConversation).mock.calls[0]?.[0]).toBe(SECRETARY_AGENT_ID);
    expect(result.current.open).toBe(true);
  });

  it('resolve 回 null（失败）→ 不弹（fail-closed）', async () => {
    vi.useFakeTimers();
    vi.mocked(resolveDmConversation).mockResolvedValue(null);
    const { result } = renderHook(() => useOnboardingGate(conv(GID_SEC)));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ONBOARDING_DELAY_MS * 2);
    });
    expect(result.current.open).toBe(false);
  });

  it('800ms 内切走会话即取消；回秘书会话再弹', () => {
    vi.useFakeTimers();
    seedInboxWithSecretary();
    const { result, rerender } = renderHook(
      (nav: NeoNav) => useOnboardingGate(nav),
      { initialProps: conv(GID_SEC) },
    );
    act(() => {
      vi.advanceTimersByTime(ONBOARDING_DELAY_MS / 2);
    });
    rerender(conv(GID_OTHER));
    act(() => {
      vi.advanceTimersByTime(ONBOARDING_DELAY_MS * 2);
    });
    expect(result.current.open).toBe(false);
    rerender(conv(GID_SEC));
    act(() => {
      vi.advanceTimersByTime(ONBOARDING_DELAY_MS);
    });
    expect(result.current.open).toBe(true);
  });

  it('close() 收口（跳过/提交后关闭）', () => {
    vi.useFakeTimers();
    seedInboxWithSecretary();
    const { result } = renderHook(() => useOnboardingGate(conv(GID_SEC)));
    act(() => {
      vi.advanceTimersByTime(ONBOARDING_DELAY_MS);
    });
    expect(result.current.open).toBe(true);
    act(() => {
      result.current.close();
    });
    expect(result.current.open).toBe(false);
  });
});
