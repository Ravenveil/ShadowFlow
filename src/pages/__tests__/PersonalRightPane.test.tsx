import { describe, it, expect, vi } from 'vitest';
import { act, render, screen } from '../../test/utils';

vi.mock('../../core/components/inbox/ApprovalGatePanel', () => ({
  ApprovalGatePanel: ({ groupId }: { groupId: string }) => <div data-testid="approval-panel" data-gid={groupId} />,
}));
vi.mock('../../core/components/inbox/BriefBoardView', () => ({
  BriefBoardView: ({ groupId }: { groupId: string }) => <div data-testid="brief-panel" data-gid={groupId} />,
}));

import { PersonalRightPane } from '../chat-home/PersonalRightPane';

const AGENT = { agent_id: 'a1', name: '写写', soul: '写手\n负责文案', avatar_color: '#888' } as never;
const click = (el: HTMLElement) => act(() => { el.click(); });

describe('PersonalRightPane', () => {
  it('默认显示「员工」标签 = 员工卡(名字+soul 首行)', () => {
    render(<PersonalRightPane agent={AGENT} groupId="g1" />);
    expect(screen.getByRole('tab', { name: '员工' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('写写')).toBeInTheDocument();
    expect(screen.getByText('写手')).toBeInTheDocument();
  });

  it('切「任务」→ ApprovalGatePanel(带 dm groupId);切「Brief」→ BriefBoardView', () => {
    render(<PersonalRightPane agent={AGENT} groupId="g1" />);
    click(screen.getByRole('tab', { name: '任务' }));
    expect(screen.getByTestId('approval-panel').getAttribute('data-gid')).toBe('g1');
    click(screen.getByRole('tab', { name: 'Brief' }));
    expect(screen.getByTestId('brief-panel').getAttribute('data-gid')).toBe('g1');
  });

  it('点收起按钮 → 面板收起(标签内容不渲染),再点展开', () => {
    render(<PersonalRightPane agent={AGENT} groupId="g1" />);
    click(screen.getByRole('button', { name: '收起右栏' }));
    expect(screen.queryByRole('tab', { name: '员工' })).not.toBeInTheDocument();
    click(screen.getByRole('button', { name: '展开右栏' }));
    expect(screen.getByRole('tab', { name: '员工' })).toBeInTheDocument();
  });
});
