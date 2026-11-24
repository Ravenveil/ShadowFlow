/**
 * CreateTeamModal 成功态引导测试（2026-08-22 第二轮缺口 A）。
 *
 * 覆盖：创建成功 → 模态进入成功态（「团队已创建」+「去运行」CTA），
 * 不静默关窗（onCreated 尚未回调）；点「去运行」→ finish() 统一回调
 * onCreated（父级据此追加列表 + 选为 currentTeam + 关窗）。
 */
import { render, screen, fireEvent, waitFor } from '../../../test/utils';
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../../api/teams', () => ({
  createTeam: vi.fn(),
  TeamApiError: class TeamApiError extends Error {
    constructor(message: string, public detail?: unknown) {
      super(message);
    }
  },
}));
vi.mock('../../../api/agents', () => ({
  listAgents: vi.fn().mockResolvedValue([
    { agent_id: 'a1', name: '获客分析师' },
    { agent_id: 'a2', name: '内容策划' },
  ]),
}));

import { createTeam } from '../../../api/teams';
import { CreateTeamModal } from '../CreateTeamModal';

const CREATED = {
  team_id: 'team-9',
  name: '氢能获客小队',
  description: '',
  agent_ids: ['a1'],
  workspace_id: 'ws-1',
  created_at: '',
  updated_at: '',
};

beforeEach(() => {
  vi.mocked(createTeam).mockReset().mockResolvedValue(CREATED);
});

/** 填名 + 选一个成员 + 提交。 */
async function submitForm() {
  fireEvent.change(screen.getByTestId('create-team-name'), { target: { value: '氢能获客小队' } });
  await waitFor(() => screen.getByTestId('create-team-member-a1'));
  fireEvent.click(screen.getByTestId('create-team-member-a1'));
  fireEvent.click(screen.getByTestId('create-team-submit'));
}

describe('CreateTeamModal 成功态引导', () => {
  it('创建成功 → 成功态内嵌引导，onCreated 暂不回调（不静默关窗）', async () => {
    const onCreated = vi.fn();
    render(<CreateTeamModal workspaceId="ws-1" onClose={() => {}} onCreated={onCreated} />);
    await submitForm();
    await waitFor(() => screen.getByTestId('create-team-success-title'));
    // 成功态内容：标题 + 引导正文（含团队名）+ 去运行 CTA
    expect(screen.getByTestId('create-team-success-body').textContent).toContain('氢能获客小队');
    expect(screen.getByTestId('create-team-go-run')).toBeTruthy();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('点「去运行」→ onCreated 回调一次（父级选中 + 关窗语义）', async () => {
    const onCreated = vi.fn();
    render(<CreateTeamModal workspaceId="ws-1" onClose={() => {}} onCreated={onCreated} />);
    await submitForm();
    await waitFor(() => screen.getByTestId('create-team-go-run'));
    fireEvent.click(screen.getByTestId('create-team-go-run'));
    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(onCreated).toHaveBeenCalledWith(CREATED);
  });

  it('成功态按 Esc → 同样经 finish() 回调 onCreated（选中语义不丢）', async () => {
    const onCreated = vi.fn();
    const onClose = vi.fn();
    render(<CreateTeamModal workspaceId="ws-1" onClose={onClose} onCreated={onCreated} />);
    await submitForm();
    await waitFor(() => screen.getByTestId('create-team-go-run'));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('创建失败 → 保持表单态红条，不进成功态', async () => {
    vi.mocked(createTeam).mockRejectedValue(new Error('HTTP 500'));
    const onCreated = vi.fn();
    render(<CreateTeamModal workspaceId="ws-1" onClose={() => {}} onCreated={onCreated} />);
    await submitForm();
    await waitFor(() => screen.getByTestId('create-team-error'));
    expect(screen.queryByTestId('create-team-success-title')).toBeNull();
    expect(onCreated).not.toHaveBeenCalled();
  });
});
