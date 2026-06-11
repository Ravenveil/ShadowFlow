import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '../../test/utils';

const sendMock = vi.fn();
const resolveDmMock = vi.fn().mockResolvedValue('dm-g1');
vi.mock('../../api/agents', () => ({
  listAgents: vi.fn().mockResolvedValue([
    { agent_id: 'a1', name: '写写', soul: '写手', avatar_color: '#888' },
  ]),
}));
vi.mock('../../api/groupApi', () => ({
  resolveDmConversation: (...args: unknown[]) => resolveDmMock(...args),
}));
vi.mock('../../core/hooks/useChatStream', () => ({
  useChatStream: vi.fn(() => ({
    messages: [
      { id: 'm1', role: 'user', content: '你好' },
      { id: 'm2', role: 'agent', content: '收到' },
      { id: 'm3', role: 'system', content: '[chat] 出错：403' }, // 网关失败反馈 → raw 卡(可见)
      { id: 'm4', role: 'agent', content: '' }, // tool_call 占位空消息 → 过滤
    ],
    send: sendMock,
    error: null,
  })),
}));
// Timeline 重(CSS module+registry),stub 成 kind 列表以断言适配层
vi.mock('../../components/run-session/timeline/Timeline', () => ({
  Timeline: ({ messages }: { messages: Array<{ kind: string }> }) => (
    <div data-testid="timeline" data-kinds={messages.map((m) => m.kind).join(',')} />
  ),
}));
// 「新员工」现在弹出原 /agents 页面（PagePeekOverlay）——stub 成可关闭的占位
vi.mock('../chat-home/PagePeekOverlay', () => ({
  PagePeekOverlay: ({ target, onClose }: { target: string; onClose: () => void }) => (
    <div data-testid="peek-overlay" data-target={target}>
      <button data-testid="peek-close" onClick={onClose} />
    </div>
  ),
}));
vi.mock('../chat-home/PersonalRightPane', () => ({
  PersonalRightPane: ({ groupId }: { groupId: string }) => <div data-testid="right-pane" data-gid={groupId} />,
}));

import { MemoryRouter } from 'react-router-dom';
import { useChatStream } from '../../core/hooks/useChatStream';
import { PersonalChatView } from '../chat-home/PersonalChatView';

const click = (el: HTMLElement) => act(() => { el.click(); });
// M3b — ChatRailChrome(个人/团队切换+底部导航)用了 useNavigate/Link,需要 Router 上下文
const view = () => <MemoryRouter initialEntries={['/chat?view=personal']}><PersonalChatView /></MemoryRouter>;

describe('PersonalChatView (融合M1)', () => {
  beforeEach(() => { sendMock.mockClear(); resolveDmMock.mockClear(); });

  it('选中助手 → resolveDmConversation 被调 + useChatStream 走 group 模式吃 dmGroupId', async () => {
    render(view());
    click(await screen.findByText('写写'));
    await waitFor(() => expect(resolveDmMock).toHaveBeenCalledWith('a1', undefined));
    await waitFor(() => {
      const calls = (useChatStream as unknown as ReturnType<typeof vi.fn>).mock.calls;
      const last = calls[calls.length - 1][0];
      expect(last.mode).toBe('group');
      expect(last.targetId).toBe('dm-g1');
    });
  });

  it('消息流经适配层进 Timeline:user_turn + assistant_text', async () => {
    render(view());
    click(await screen.findByText('写写'));
    await waitFor(() => {
      // system → raw 卡(失败反馈必须可见);空 content 消息被过滤
      expect(screen.getByTestId('timeline').getAttribute('data-kinds')).toBe('user_turn,assistant_text,raw');
    });
  });

  it('右栏渲染且拿到 dm groupId', async () => {
    render(view());
    click(await screen.findByText('写写'));
    await waitFor(() => expect(screen.getByTestId('right-pane').getAttribute('data-gid')).toBe('dm-g1'));
  });

  it('「+ 新员工」→ 弹出原 /agents 页面(PagePeekOverlay)，关闭后刷新助手列表', async () => {
    render(view());
    await screen.findByText('写写');
    click(screen.getByRole('button', { name: '+ 新员工' }));
    expect(screen.getByTestId('peek-overlay').getAttribute('data-target')).toBe('agents');
    const { listAgents } = await import('../../api/agents');
    const callsBefore = (listAgents as unknown as ReturnType<typeof vi.fn>).mock.calls.length;
    click(screen.getByTestId('peek-close'));
    await waitFor(() => {
      expect(screen.queryByTestId('peek-overlay')).not.toBeInTheDocument();
      expect((listAgents as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });

  it('未选助手 = Cherry Studio 式空态引导(无发起框)', async () => {
    render(view());
    await screen.findByText('写写');
    expect(screen.getByText('选择一个助手开始单聊，或创建一位新员工')).toBeInTheDocument();
  });
});
