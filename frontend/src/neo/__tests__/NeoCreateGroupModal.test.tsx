/**
 * NeoCreateGroupModal 测试（2026-11-06 选人式重做；2026-11-20 加推荐团队）。
 * 覆盖：勾选成员 → chips 出现 + 主钮计数；全选团队 roster → createGroup 带
 * team_id；自由勾选 → 无 team_id；群名留空回退成员名拼接；搜索过滤；无
 * Agent → 空态 + 提交禁用；createGroup 失败 → 模态内红条。
 * 新增：推荐团队一键 fork（论文专家团置顶 + 默认标 + 一次点击落 agent/team
 * 并建群）、fork 失败显示真实原因、无模板时不出区块、零 agent 时仍可见。
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
vi.mock('../../api/catalog', () => ({
  listCatalogApps: vi.fn(),
  forkCatalogApp: vi.fn(),
}));
vi.mock('../../api/cli', () => ({
  listDetectedClis: vi.fn(),
}));

import { createGroup } from '../../api/groupApi';
import { listTeams } from '../../api/teams';
import { listAgents } from '../../api/agents';
import { listCatalogApps, forkCatalogApp } from '../../api/catalog';
import { listDetectedClis } from '../../api/cli';
import { NeoCreateGroupModal, GROUP_EXECUTOR_KEY_PREFIX } from '../NeoCreateGroupModal';

const createGroupMock = vi.mocked(createGroup);
const listTeamsMock = vi.mocked(listTeams);
const listAgentsMock = vi.mocked(listAgents);
const listCatalogMock = vi.mocked(listCatalogApps);
const forkMock = vi.mocked(forkCatalogApp);
const detectMock = vi.mocked(listDetectedClis);

const ARC_APP = {
  app_id: 'app-auto-research-cloud',
  name: '论文专家团 · Auto Research Cloud',
  goal: '从选题到投稿全流程：检索、实验、写作、审稿回炉',
  kit_type: 'team',
  author: 'shadowflow',
  published_at: '',
  fork_count: 0,
  mode: 'team',
};
const T04_APP = {
  app_id: 'app-t04-hydrogen-team',
  name: '氢能获客团队',
  goal: '六角色 DAG',
  kit_type: 'team',
  author: 'shadowflow',
  published_at: '',
  fork_count: 0,
  mode: 'team',
};
const SINGLE_APP = {
  app_id: 'app-single', name: '单角色模板', goal: '', kit_type: 'solo',
  author: '', published_at: '', fork_count: 0, mode: 'single',
};

const ARC_TEAM = {
  team_id: 't-arc',
  name: '论文专家团',
  description: '',
  workspace_id: 'ws1',
  agent_ids: ['arc1', 'arc2', 'arc3'],
  created_at: '',
  updated_at: '',
};

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
  listCatalogMock.mockResolvedValue([T04_APP, ARC_APP, SINGLE_APP]);
  forkMock.mockResolvedValue({ blueprint_id: 'bp1', forked_from: 'app-auto-research-cloud', team: ARC_TEAM });
  detectMock.mockResolvedValue({
    scanned_at: '',
    items: [{
      id: 'autoresearchclaw', installed: true, path: '/usr/bin/researchclaw',
      version: '0.3.1', env_set: true, install_cmd: '', stream_format: 'plain-line',
    }],
  });
  try { localStorage.clear(); } catch { /* jsdom 下正常可用 */ }
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

describe('NeoCreateGroupModal — 推荐团队一键使用（2026-11-20）', () => {
  it('论文专家团置顶并带「默认」标；单角色模板不混进来', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getAllByTestId('neo-ng-template-row').length).toBe(2);
    });
    const rows = screen.getAllByTestId('neo-ng-template-row');
    // 置顶：ARC 排第一，即使 mock 返回里 T04 在前
    expect(rows[0].getAttribute('data-app-id')).toBe('app-auto-research-cloud');
    expect(rows[0].textContent).toContain('论文专家团');
    expect(screen.getByTestId('neo-ng-template-default-badge')).toBeTruthy();
    // mode=single 的模板不出现
    expect(screen.queryByText('单角色模板')).toBeNull();
  });

  it('点「一键使用」→ fork + 建群绑 team_id，agent 取自 fork 结果', async () => {
    const { onCreated } = renderModal();
    await waitFor(() => {
      expect(screen.getAllByTestId('neo-ng-template-row').length).toBe(2);
    });
    fireEvent.click(screen.getAllByTestId('neo-ng-template-use')[0]);

    await waitFor(() => expect(forkMock).toHaveBeenCalledWith('app-auto-research-cloud', 'ws1'));
    await waitFor(() => expect(createGroupMock).toHaveBeenCalledTimes(1));
    const arg = createGroupMock.mock.calls[0][0];
    expect(arg.teamId).toBe('t-arc');
    expect(arg.agentIds).toEqual(['arc1', 'arc2', 'arc3']);
    expect(arg.name).toBe('论文专家团');
    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledWith({ groupId: 'g-new-1', name: expect.any(String) });
    });
  });

  it('fork 没返回 team → 明确报错，不进群', async () => {
    forkMock.mockResolvedValue({ blueprint_id: 'bp', forked_from: 'app-t04-hydrogen-team' });
    const { onCreated } = renderModal();
    await waitFor(() => {
      expect(screen.getAllByTestId('neo-ng-template-row').length).toBe(2);
    });
    fireEvent.click(screen.getAllByTestId('neo-ng-template-use')[0]);

    await waitFor(() => {
      expect(screen.getByTestId('neo-create-group-error').textContent).toContain('没返回团队记录');
    });
    expect(createGroupMock).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('fork 失败 → 红条显示后端真实原因（不是 HTTP 状态码）', async () => {
    const err = Object.assign(new Error('Catalog API error 400'), {
      status: 400,
      detail: { error: { code: 'INVALID_BLUEPRINT', message: '蓝图快照缺 role_profiles' } },
    });
    forkMock.mockRejectedValue(err);
    renderModal();
    await waitFor(() => {
      expect(screen.getAllByTestId('neo-ng-template-row').length).toBe(2);
    });
    fireEvent.click(screen.getAllByTestId('neo-ng-template-use')[0]);

    await waitFor(() => {
      expect(screen.getByTestId('neo-create-group-error').textContent).toContain('蓝图快照缺 role_profiles');
    });
  });

  it('零 agent 也能看到推荐团队（新用户不必先手工建 9 个 agent）', async () => {
    listAgentsMock.mockResolvedValue([]);
    renderModal();
    await waitFor(() => {
      expect(screen.getByTestId('neo-create-group-empty')).toBeTruthy();
    });
    expect(screen.getAllByTestId('neo-ng-template-row').length).toBe(2);
  });

  it('Catalog 为空 → 不渲染模板区，原有选人流程不受影响', async () => {
    listCatalogMock.mockResolvedValue([]);
    renderModal();
    await waitFor(() => {
      expect(screen.getAllByTestId('neo-new-group-agent-row')).toHaveLength(2);
    });
    expect(screen.queryByTestId('neo-ng-templates')).toBeNull();
  });
});

describe('NeoCreateGroupModal — 论文专家团（真管线，2026-11-20）', () => {
  it('卡片常驻（即便 Catalog 为空）', async () => {
    listCatalogMock.mockResolvedValue([]);
    renderModal();
    await waitFor(() => expect(screen.getByTestId('neo-ng-arc-card')).toBeTruthy());
    expect(screen.getByTestId('neo-ng-arc-start')).toBeTruthy();
  });

  it('researchclaw 已装 → 一键开始：fork + 单角色建群 + 群 executor 钉成该 CLI', async () => {
    const { onCreated } = renderModal();
    await waitFor(() => expect(screen.getByTestId('neo-ng-arc-card')).toBeTruthy());
    await waitFor(() => expect(detectMock).toHaveBeenCalled());

    fireEvent.click(screen.getByTestId('neo-ng-arc-start'));

    await waitFor(() => expect(forkMock).toHaveBeenCalledWith('app-auto-research-cloud', 'ws1'));
    await waitFor(() => expect(createGroupMock).toHaveBeenCalledTimes(1));
    const arg = createGroupMock.mock.calls[0][0];
    // 只拉主控进群：CLI 管线本身跑完全流程，不需要 9 个 LLM 角色各跑一遍
    expect(arg.agentIds).toEqual(['arc1']);
    expect(arg.teamId).toBeUndefined();
    expect(arg.name).toContain('论文专家团');
    // 群级 executor 落盘 → NeoGroupChat 发送时优先读它
    expect(localStorage.getItem(`${GROUP_EXECUTOR_KEY_PREFIX}g-new-1`)).toBe('cli:autoresearchclaw');
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
  });

  it('researchclaw 未装 → 按钮禁用 + 提示去 ClawHub 安装', async () => {
    detectMock.mockResolvedValue({
      scanned_at: '',
      items: [{
        id: 'autoresearchclaw', installed: false, path: null, version: null,
        env_set: false, install_cmd: 'git clone ...', stream_format: 'plain-line',
      }],
    });
    renderModal();
    await waitFor(() => expect(screen.getByTestId('neo-ng-arc-missing')).toBeTruthy());
    expect(screen.getByTestId('neo-ng-arc-start')).toBeDisabled();
  });

  it('CLI 检测失败 → 按未安装处理，不炸整个模态', async () => {
    detectMock.mockRejectedValue(new Error('detect 500'));
    renderModal();
    await waitFor(() => expect(screen.getByTestId('neo-ng-arc-missing')).toBeTruthy());
    // 选人流程照常可用
    expect(screen.getAllByTestId('neo-new-group-agent-row')).toHaveLength(2);
  });

  it('论文群与普通群的 executor 互不串台', async () => {
    renderModal();
    await waitFor(() => expect(screen.getByTestId('neo-ng-arc-card')).toBeTruthy());
    await waitFor(() => expect(detectMock).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId('neo-ng-arc-start'));
    await waitFor(() => expect(createGroupMock).toHaveBeenCalled());

    // 另一个群没有该键 → NeoGroupChat 回落到 sf.defaultExecutor
    expect(localStorage.getItem(`${GROUP_EXECUTOR_KEY_PREFIX}g-other`)).toBeNull();
  });
});
