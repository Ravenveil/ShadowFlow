import { describe, it, expect, vi } from 'vitest';
import { act, render, screen } from '../../test/utils';

const click = (el: HTMLElement) => act(() => { el.click(); });

// 隔离两个子视图重依赖，只验证入口分发逻辑
vi.mock('../ChatPage', () => ({ default: () => <div data-testid="team-view" /> }));
vi.mock('../chat-home/PersonalChatView', () => ({ PersonalChatView: () => <div data-testid="personal-view" /> }));

import ChatHomePage from '../ChatHomePage';

describe('ChatHomePage', () => {
  it('默认渲染团队视图(ChatPage)', () => {
    render(<ChatHomePage />);
    expect(screen.getByTestId('team-view')).toBeInTheDocument();
    expect(screen.queryByTestId('personal-view')).not.toBeInTheDocument();
  });

  it('点「个人」切到个人视图', () => {
    render(<ChatHomePage />);
    click(screen.getByRole('button', { name: '个人' }));
    expect(screen.getByTestId('personal-view')).toBeInTheDocument();
    expect(screen.queryByTestId('team-view')).not.toBeInTheDocument();
  });

  it('个人→团队 可切回', () => {
    render(<ChatHomePage />);
    click(screen.getByRole('button', { name: '个人' }));
    click(screen.getByRole('button', { name: '团队' }));
    expect(screen.getByTestId('team-view')).toBeInTheDocument();
  });
});
