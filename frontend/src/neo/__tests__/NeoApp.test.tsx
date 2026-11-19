/**
 * NeoApp — 外壳接线测试（2026-11-19）。
 *
 * 覆盖三处跨组件契约：
 *   - DM 会话：inbox 命中仍然调 getGroup 取 workspace_dir（右栏文件树跟随
 *     agent 产出的真实落点），getGroup 失败才回落 null；
 *   - 群聊 onTurnSettled → refreshKey 递增下发给 NeoHost；
 *   - 子组件全部 stub（NeoRail 提供导航驱动钮），只验证 NeoApp 自己的接线。
 */
import { render, screen, fireEvent, waitFor, act } from '../../test/utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({
  hostProps: null as Record<string, unknown> | null,
  groupChatProps: null as Record<string, unknown> | null,
  getGroupMock: vi.fn(),
}));

vi.mock('../NeoRail', () => ({
  NeoRail: (props: { onNavigate: (nav: unknown) => void }) => (
    <div data-testid="rail-stub">
      <button
        data-testid="rail-open-dm"
        onClick={() => props.onNavigate({ view: 'conversation', groupId: 'g-dm' })}
      />
    </div>
  ),
}));
vi.mock('../NeoChat', () => ({ NeoChat: () => <div data-testid="chat-stub" /> }));
vi.mock('../NeoHost', () => ({
  NeoHost: (props: Record<string, unknown>) => {
    h.hostProps = props;
    return <div data-testid="host-stub" />;
  },
}));
vi.mock('../NeoGroupChat', () => ({
  NeoGroupChat: (props: Record<string, unknown>) => {
    h.groupChatProps = props;
    return <div data-testid="group-chat-stub" />;
  },
}));
vi.mock('../NeoAgentSoul', () => ({ NeoAgentSoul: () => null }));
vi.mock('../NeoRunHistory', () => ({ NeoRunHistory: () => null }));
vi.mock('../NeoOnboardingModal', () => ({
  NeoOnboardingModal: () => null,
  ONBOARDING_DONE_KEY: 'sf.neo.onboarding.done',
}));
vi.mock('../useOnboardingGate', () => ({
  useOnboardingGate: () => ({ open: false, close: vi.fn() }),
}));
vi.mock('../../pages/KnowledgePage', () => ({
  default: () => null,
  parseSourceId: () => undefined,
}));
vi.mock('../../pages/DashboardPage', () => ({ default: () => null }));
vi.mock('../../pages/SchedulesPage', () => ({ default: () => null }));
vi.mock('../../pages/clawhub/ClawHubPage', () => ({ default: () => null }));
vi.mock('../../core/hooks/usePythonBackendStatus', () => ({
  usePythonBackendStatus: () => ({ available: true, recheck: vi.fn() }),
}));

const inboxState = {
  agentDMs: [{ group_id: 'g-dm', agentId: 'a1', agentName: '读读' }],
  groups: [],
  fetchWorkspaceInbox: vi.fn(),
};
vi.mock('../../core/store/useInboxStore', () => {
  const useInboxStore = (sel: (s: typeof inboxState) => unknown) => sel(inboxState);
  useInboxStore.getState = () => inboxState;
  return { useInboxStore };
});
vi.mock('../../store/workspaceStore', () => ({
  useWorkspaceStore: { getState: () => ({ currentId: 'ws1' }) },
}));
vi.mock('../../api/groupApi', () => ({
  getGroup: (...args: unknown[]) => h.getGroupMock(...args),
  resolveDmConversation: vi.fn(() => Promise.resolve(null)),
  resolveTeamGroup: vi.fn(() => Promise.resolve(null)),
  ensureGroupTeam: vi.fn(() => Promise.resolve(null)),
  postGroupMessage: vi.fn(() => Promise.resolve({})),
}));

import { NeoApp } from '../NeoApp';

const DM_GROUP = {
  group_id: 'g-dm',
  name: '读读',
  kind: 'dm',
  agent_ids: ['a1'],
  messages: [],
  workspace_dir: '/tmp/ws',
};

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/neo']}>
      <NeoApp />
    </MemoryRouter>,
  );
}

/** 左栏点会话 → 进 DM 会话视图。 */
function openDm() {
  fireEvent.click(screen.getByTestId('rail-open-dm'));
}

beforeEach(() => {
  vi.clearAllMocks();
  h.hostProps = null;
  h.groupChatProps = null;
  h.getGroupMock.mockReset().mockResolvedValue(DM_GROUP);
});

describe('NeoApp — DM 会话也跟工作目录（2026-11-19）', () => {
  it('inbox 命中仍调 getGroup：NeoHost 收到真实 workspace_dir', async () => {
    renderApp();
    openDm();
    await waitFor(() => {
      expect(h.hostProps?.conversation).toBeTruthy();
    });
    const conv = h.hostProps!.conversation as { kind: string; workspaceDir: string | null };
    expect(conv.kind).toBe('dm');
    expect(conv.workspaceDir).toBe('/tmp/ws');
    expect(h.getGroupMock).toHaveBeenCalledWith('g-dm');
    // inbox 提前定下的 convAgent 不被 getGroup 覆盖（灵魂 tab 仍指向对面 agent）
    expect(h.hostProps!.soulAgent).toEqual({ id: 'a1', name: '读读' });
  });

  it('getGroup 失败 → workspaceDir 回落 null（convAgent 保留，聊天不受影响）', async () => {
    h.getGroupMock.mockRejectedValue(new Error('boom'));
    renderApp();
    openDm();
    await waitFor(() => {
      expect(h.hostProps?.conversation).toBeTruthy();
    });
    const conv = h.hostProps!.conversation as { kind: string; workspaceDir: string | null };
    expect(conv.kind).toBe('dm');
    expect(conv.workspaceDir).toBeNull();
    expect(h.hostProps!.soulAgent).toEqual({ id: 'a1', name: '读读' });
  });
});

describe('NeoApp — 回合结束刷新右栏树接线（2026-11-19）', () => {
  it('onTurnSettled → refreshKey 递增下发给 NeoHost', async () => {
    renderApp();
    openDm();
    await waitFor(() => expect(h.hostProps?.refreshKey).toBe(0));
    act(() => {
      (h.groupChatProps!.onTurnSettled as () => void)();
    });
    await waitFor(() => expect(h.hostProps?.refreshKey).toBe(1));
    act(() => {
      (h.groupChatProps!.onTurnSettled as () => void)();
    });
    await waitFor(() => expect(h.hostProps?.refreshKey).toBe(2));
  });
});
