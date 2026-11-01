/**
 * NeoCreateGroupModal 测试（2026-08-22 第二轮 GAP D）。
 * 覆盖：团队模式默认选中首团队（空名回退团队名）→ createGroup 带 team_id +
 * roster；Agent 模式勾选 → createGroup 带 agent_ids 无 team_id；无团队无
 * Agent → 空态 + 提交禁用；createGroup 失败 → 模态内红条。
 */
import { render, screen, fireEvent, waitFor } from '../../test/utils';
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../api/groupApi', () => ({
  createGroup: vi.fn().mockResolvedValue({
    groupId: 'g-new-1',
    name: '测试团队',
    templateId: 'new-task',
    createdAt: '',
    agents: ['a1', 'a2'],
  }),
}));
vi.mock('../../api/teams', () => ({
  listTeams: vi.fn().mockResolvedValue([
    { team_id: 't1', name: '测试团队', description: '', workspace_id: 'ws1', agent_ids: ['a1', 'a2'], created_at: '', updated_at: '' },
  ]),
}));
vi.mock('../../api/agents', () => ({
  listAgents: vi.fn().mockResolvedValue([
    { agent_id: 'a1', name: '甲', soul: '', workspace_id: 'ws1', blueprint: {}, status: 'idle', source: 'quick_hire', created_at: '' },
    { agent_id: 'a2', name: '乙', soul: '', workspace_id: 'ws1', blueprint: {}, status: 'idle', source: 'quick_hire', created_at: '' },
  ]),
}));

import { createGroup } from '../../api/groupApi';
import { listTeams } from '../../api/teams';
import { listAgents } from '../../api/agents';
import { NeoCreateGroupModal } from '../NeoCreateGroupModal';

const createGroupMock = vi.mocked(createGroup);
const listTeamsMock = vi.mocked(listTeams);
const listAgentsMock = vi.mocked(listAgents);

function renderModal(onCreated = vi.fn(), onClose = vi.fn()) {
  return {
    onCreated,
    onClose,
    ...render(
      <NeoCreateGroupModal workspaceId="ws1" onClose={onClose} onCreated={onCreated} />,
    ),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  createGroupMock.mockResolvedValue({
    groupId: 'g-new-1',
    name: '测试团队',
    templateId: 'new-task',
    createdAt: '',
    agents: ['a1', 'a2'],
  });
  listTeamsMock.mockResolvedValue([
    { team_id: 't1', name: '测试团队', description: '', workspace_id: 'ws1', agent_ids: ['a1', 'a2'], created_at: '', updated_at: '' },
  ]);
  listAgentsMock.mockResolvedValue([
    { agent_id: 'a1', name: '甲', soul: '', workspace_id: 'ws1', blueprint: {}, status: 'idle', source: 'quick_hire', created_at: '' },
    { agent_id: 'a2', name: '乙', soul: '', workspace_id: 'ws1', blueprint: {}, status: 'idle', source: 'quick_hire', created_at: '' },
  ]);
});

describe('NeoCreateGroupModal — 团队模式', () => {
  it('默认选中首团队，空名称回退团队名，提交带 team_id + roster', async () => {
    const { onCreated } = renderModal();
    const submit = await screen.findByTestId('neo-create-group-submit');
    await waitFor(() => expect(submit).toBeEnabled());

    fireEvent.click(submit);
    await waitFor(() => {
      expect(createGroupMock).toHaveBeenCalledWith(
        expect.objectContaining({
          name: '测试团队',
          agentIds: ['a1', 'a2'],
          teamId: 't1',
          workspaceId: 'ws1',
        }),
      );
    });
    expect(onCreated).toHaveBeenCalledWith({ groupId: 'g-new-1', name: '测试团队' });
  });

  it('自定义名称优先于回退名', async () => {
    renderModal();
    const input = await screen.findByLabelText('群名称');
    fireEvent.change(input, { target: { value: '氢能获客作战室' } });
    fireEvent.click(screen.getByTestId('neo-create-group-submit'));
    await waitFor(() => {
      expect(createGroupMock).toHaveBeenCalledWith(
        expect.objectContaining({ name: '氢能获客作战室' }),
      );
    });
  });
});

describe('NeoCreateGroupModal — Agent 模式', () => {
  it('勾选 Agent → createGroup 带 agent_ids、无 team_id', async () => {
    const { onCreated } = renderModal();
    fireEvent.click(await screen.findByTestId('neo-new-group-mode-agents'));
    // 未勾选时提交禁用 + 提示
    expect(screen.getByTestId('neo-create-group-submit')).toBeDisabled();
    expect(screen.getByTestId('neo-new-group-pick-hint')).toBeInTheDocument();

    fireEvent.click(screen.getByText('甲'));
    fireEvent.click(screen.getByText('乙'));
    const submit = screen.getByTestId('neo-create-group-submit');
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    await waitFor(() => {
      expect(createGroupMock).toHaveBeenCalledWith(
        expect.objectContaining({ agentIds: ['a1', 'a2'], teamId: undefined }),
      );
    });
    expect(onCreated).toHaveBeenCalledWith({ groupId: 'g-new-1', name: '测试团队' });
  });
});

describe('NeoCreateGroupModal — 空态与失败', () => {
  it('无团队且无 Agent → 明确空态提示，提交禁用', async () => {
    listTeamsMock.mockResolvedValue([]);
    listAgentsMock.mockResolvedValue([]);
    renderModal();
    expect(await screen.findByTestId('neo-create-group-empty')).toBeInTheDocument();
    expect(screen.getByTestId('neo-create-group-submit')).toBeDisabled();
    expect(createGroupMock).not.toHaveBeenCalled();
  });

  it('createGroup 失败 → 模态内红条展示真实错误，不假成功', async () => {
    createGroupMock.mockRejectedValue(new Error('后端 503'));
    const { onCreated } = renderModal();
    const submit = await screen.findByTestId('neo-create-group-submit');
    await waitFor(() => expect(submit).toBeEnabled());
    fireEvent.click(submit);
    expect(await screen.findByTestId('neo-create-group-error')).toHaveTextContent('后端 503');
    expect(onCreated).not.toHaveBeenCalled();
  });
});
