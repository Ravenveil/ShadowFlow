import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '../../test/utils';

// 隔离网络 + 流式 hook
const sendMock = vi.fn();
vi.mock('../../api/agents', () => ({
  listAgents: vi.fn().mockResolvedValue([
    { agent_id: 'a1', name: '写写', soul: '写手', avatar_color: '#888' },
    { agent_id: 'a2', name: '查查', soul: '研究员', avatar_color: '#777' },
  ]),
}));
vi.mock('../../core/hooks/useChatStream', () => ({
  useChatStream: () => ({ messages: [], send: sendMock, error: null }),
}));

import { PersonalChatView } from '../chat-home/PersonalChatView';

describe('PersonalChatView', () => {
  beforeEach(() => { sendMock.mockClear(); });

  it('加载后渲染 agent 列表', async () => {
    render(<PersonalChatView />);
    expect(await screen.findByText('写写')).toBeInTheDocument();
    expect(screen.getByText('查查')).toBeInTheDocument();
  });

  it('未选助手时显示空态', async () => {
    render(<PersonalChatView />);
    await screen.findByText('写写');
    expect(screen.getByText('选择一个助手，开始一对一聊')).toBeInTheDocument();
  });

  it('选中助手后显示其名字头（顶栏）', async () => {
    render(<PersonalChatView />);
    (await screen.findByText('写写')).click();
    await waitFor(() => {
      // 顶栏 + 列表都含「写写」→ 至少 2 处
      expect(screen.getAllByText('写写').length).toBeGreaterThanOrEqual(2);
    });
  });
});
