import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '../../test/utils';

// 隔离重依赖子视图，只验证 ChatHomePage 按 ?view= 的分发逻辑
vi.mock('../ChatPage', () => ({ default: () => <div data-testid="team-view" /> }));
vi.mock('../chat-home/PersonalChatView', () => ({ PersonalChatView: () => <div data-testid="personal-view" /> }));
// WorkspaceSelector 有 store/网络依赖，stub 掉
vi.mock('../../components/workspace/WorkspaceStrip', () => ({ WorkspaceSelector: () => <div data-testid="workspace-selector" /> }));

import ChatHomePage from '../ChatHomePage';

function wrap(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <ChatHomePage />
    </MemoryRouter>,
  );
}

describe('ChatHomePage', () => {
  it('默认（无 ?view）渲染团队视图 + 顶部工作区选择器', () => {
    wrap('/chat');
    expect(screen.getByTestId('team-view')).toBeInTheDocument();
    expect(screen.getByTestId('workspace-selector')).toBeInTheDocument();
    expect(screen.queryByTestId('personal-view')).not.toBeInTheDocument();
  });

  it('?view=personal 渲染个人视图（团队视图不渲染）', () => {
    wrap('/chat?view=personal');
    expect(screen.getByTestId('personal-view')).toBeInTheDocument();
    expect(screen.queryByTestId('team-view')).not.toBeInTheDocument();
  });

  it('?view=team 显式回到团队视图', () => {
    wrap('/chat?view=team');
    expect(screen.getByTestId('team-view')).toBeInTheDocument();
    expect(screen.queryByTestId('personal-view')).not.toBeInTheDocument();
  });
});
