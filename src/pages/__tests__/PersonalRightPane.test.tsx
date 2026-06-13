import { describe, it, expect, vi } from 'vitest';
import { act, render, screen } from '../../test/utils';

vi.mock('../../core/components/inbox/ApprovalGatePanel', () => ({
  ApprovalGatePanel: ({ groupId }: { groupId: string }) => <div data-testid="approval-panel" data-gid={groupId} />,
}));
vi.mock('../../core/components/inbox/BriefBoardView', () => ({
  BriefBoardView: ({ groupId }: { groupId: string }) => <div data-testid="brief-panel" data-gid={groupId} />,
}));
// RunWorkPane 有路由+网络依赖，stub 掉只断言挂载与 groupId 透传
vi.mock('../chat-home/RunWorkPane', () => ({
  RunWorkPane: ({ groupId }: { groupId?: string | null }) => <div data-testid="work-pane" data-gid={groupId ?? ''} />,
}));

import { PersonalRightPane } from '../chat-home/PersonalRightPane';

const AGENT = { agent_id: 'a1', name: '写写', soul: '写手\n负责文案', avatar_color: '#888' } as never;
const click = (el: HTMLElement) => act(() => { el.click(); });

describe('PersonalRightPane', () => {
  it('选中助手默认显示「员工」标签 = 该 agent 资料卡(1:1 语境)', () => {
    render(<PersonalRightPane agent={AGENT} groupId="g1" />);
    expect(screen.getByRole('tab', { name: '员工' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('写写')).toBeInTheDocument();
  });

  it('切「工作区」→ RunWorkPane;切「任务」→ ApprovalGatePanel;切「Brief」→ BriefBoardView', () => {
    render(<PersonalRightPane agent={AGENT} groupId="g1" />);
    click(screen.getByRole('tab', { name: '工作区' }));
    expect(screen.getByTestId('work-pane').getAttribute('data-gid')).toBe('g1');
    click(screen.getByRole('tab', { name: '任务' }));
    expect(screen.getByTestId('approval-panel').getAttribute('data-gid')).toBe('g1');
    click(screen.getByRole('tab', { name: 'Brief' }));
    expect(screen.getByTestId('brief-panel').getAttribute('data-gid')).toBe('g1');
  });

  it('未选助手(无 agent/groupId)第三栏仍常驻:工作区在,员工 tab 显示引导', () => {
    render(<PersonalRightPane />);
    expect(screen.getByTestId('work-pane')).toBeInTheDocument();
    click(screen.getByRole('tab', { name: '员工' }));
    expect(screen.getByText('选择一个助手后这里显示 TA 的资料与任务')).toBeInTheDocument();
  });

  it('点收起按钮 → 面板收起(标签内容不渲染),再点展开', () => {
    render(<PersonalRightPane agent={AGENT} groupId="g1" />);
    click(screen.getByRole('button', { name: '收起右栏' }));
    expect(screen.queryByRole('tab', { name: '工作区' })).not.toBeInTheDocument();
    click(screen.getByRole('button', { name: '展开右栏' }));
    expect(screen.getByRole('tab', { name: '工作区' })).toBeInTheDocument();
  });
});
