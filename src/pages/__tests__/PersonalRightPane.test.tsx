import { describe, it, expect, vi } from 'vitest';
import { act, render, screen } from '../../test/utils';

// AgentWorkspacePane 有路由+网络依赖，stub 掉只断言挂载与 groupId 透传；
// 渲染 trailing（收起按钮由 PersonalRightPane 经 trailing 注入）。
vi.mock('../chat-home/AgentWorkspacePane', () => ({
  AgentWorkspacePane: ({ groupId, trailing }: { groupId?: string | null; trailing?: React.ReactNode }) => (
    <div data-testid="work-pane" data-gid={groupId ?? ''}>{trailing}</div>
  ),
}));

import { PersonalRightPane } from '../chat-home/PersonalRightPane';

const click = (el: HTMLElement) => act(() => { el.click(); });

describe('PersonalRightPane', () => {
  it('拍平后右栏 = 单排工作台(AgentWorkspacePane)，透传 groupId', () => {
    render(<PersonalRightPane groupId="g1" />);
    expect(screen.getByTestId('work-pane').getAttribute('data-gid')).toBe('g1');
    // 拍平后不再有外层「设定/工作区」tab
    expect(screen.queryByRole('tab', { name: '设定' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: '工作区' })).not.toBeInTheDocument();
  });

  it('点收起 → 工作台不渲染；再展开 → 回来', () => {
    render(<PersonalRightPane groupId="g1" />);
    click(screen.getByRole('button', { name: '收起右栏' }));
    expect(screen.queryByTestId('work-pane')).not.toBeInTheDocument();
    click(screen.getByRole('button', { name: '展开右栏' }));
    expect(screen.getByTestId('work-pane')).toBeInTheDocument();
  });
});
