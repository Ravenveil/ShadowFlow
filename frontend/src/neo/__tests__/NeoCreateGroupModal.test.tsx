/**
 * NeoCreateGroupModal 测试（2026-11-06 选人式重做）。
 * 覆盖：勾选成员 → chips 出现 + 主钮计数；全选团队 roster → createGroup 带
 * team_id；自由勾选 → 无 team_id；群名留空回退成员名拼接；搜索过滤；无
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
    { agent_id: 'a1', name: '甲', soul: '研究员', workspace_id: 'ws1', blueprint: {}, status: 'idle', source: 'quick_hire', created_at: '' },
    { agent_id: 'a2', name: '乙', soul: '设计师', workspace_id: 'ws1', blueprint: {}, status: 'idle', source: 'quick_hire', created_at: '' },
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

/** 勾选一个成员行（按 agent_id）。 */
function pick(agentId: string) {
  fireEvent.click(screen.getByTestId('neo-new-group-agent-row').closest('[data-agent-id]') ?? screen.getAllByTestId('neo-new-group-agent-row')[0]);
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
    { agent_id: 'a1', name: '甲', soul: '研究员', workspace_id: 'ws1', blueprint: {}, status: 'idle', source: 'quick_hire', created_at: '' },
    { agent_id: 'a2', name: '乙', soul: '设计师', workspace_id: 'ws1', blueprint: {}, status: 'idle', source: 'quick_hire', created_at: '' },
  ]);
});

describe('NeoCreateGroupModal — 选人式交互', () => {
  it('勾选成员 → chip 出现 + 主钮带计数；提交不带 team_id（自由群）', async () => {
    const { onCreated } = renderModal();
    await waitFor(() => {
      expect(screen.getAllByTestId('neo-new-group-agent-row')).toHaveLength(2);
    });
    // 勾选「甲」
    fireEvent.click(screen.getAllByTestId('neo-new-group-agent-row')[0]);
    expect(screen.getAllByTestId('neo-new-group-chip')).toHaveLength(1);
    expect(screen.getByTestId('neo-create-group-submit').textContent).toContain('(1)');
    fireEvent.click(screen.getByTestId('neo-create-group-submit'));
    await waitFor(() => {
      expect(createGroupMock).toHaveBeenCalledTimes(1);
    });
    const arg = createGroupMock.mock.calls[0][0];
    expect(arg.agentIds).toEqual(['a1']);
    expect(arg.teamId).toBeUndefined();
    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledWith({ groupId: 'g-new-1', name: expect.any(String) });
    });
  });

  it('全选（恰好等于团队 roster）→ createGroup 带 team_id；群名留空回退团队名', async () => {
    const { onCreated } = renderModal();
    await waitFor(() => {
      expect(screen.getAllByTestId('neo-new-group-agent-row')).toHaveLength(2);
    });
    fireEvent.click(screen.getByTestId('neo-new-group-select-all'));
    // 团队匹配标签出现
    expect(screen.getByTestId('neo-new-group-team-tag')).toBeTruthy();
    // 群名留空 → placeholder 即回退名（成员名拼接，微信式）
    expect(
      (screen.getByTestId('neo-new-group-name') as HTMLInputElement).placeholder,
    ).toBe('甲、乙');
    fireEvent.click(screen.getByTestId('neo-create-group-submit'));
    await waitFor(() => {
      expect(createGroupMock).toHaveBeenCalledTimes(1);
    });
    const arg = createGroupMock.mock.calls[0][0];
    expect(arg.agentIds).toEqual(['a1', 'a2']);
    expect(arg.teamId).toBe('t1');
    expect(arg.name).toBe('甲、乙'); // 群名留空 → 成员名拼接回退
    await waitFor(() => {
      expect(onCreated).toHaveBeenCalled();
    });
  });

  it('搜索过滤成员列表', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getAllByTestId('neo-new-group-agent-row')).toHaveLength(2);
    });
    fireEvent.change(screen.getByTestId('neo-new-group-search'), { target: { value: '甲' } });
    const rows = screen.getAllByTestId('neo-new-group-agent-row');
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('甲');
  });

  it('无 Agent → 空态提示 + 提交禁用', async () => {
    listAgentsMock.mockResolvedValue([]);
    renderModal();
    await waitFor(() => {
      expect(screen.getByTestId('neo-create-group-empty')).toBeTruthy();
    });
    expect(screen.getByTestId('neo-create-group-submit')).toBeDisabled();
  });

  it('createGroup 失败 → 模态内红条展示真实错误，不假成功', async () => {
    createGroupMock.mockRejectedValue(new Error('后端 500'));
    const { onCreated } = renderModal();
    await waitFor(() => {
      expect(screen.getAllByTestId('neo-new-group-agent-row')).toHaveLength(2);
    });
    fireEvent.click(screen.getAllByTestId('neo-new-group-agent-row')[0]);
    fireEvent.click(screen.getByTestId('neo-create-group-submit'));
    await waitFor(() => {
      expect(screen.getByTestId('neo-create-group-error').textContent).toContain('后端 500');
    });
    expect(onCreated).not.toHaveBeenCalled();
  });
});
