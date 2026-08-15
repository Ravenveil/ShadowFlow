import { render, screen } from '../test/utils';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AppRoutes } from '@/AppRoutes';
import InboxPage from './InboxPage';

// UI5.0 更新断言：2026-06-24 起收件箱并入统一 ChatRail 布局，自带的 NarrowNav
// 与 PreviewPane（占位 mock）已被删除，页面 = 一列 MessageList 会话列表。
// 旧断言（narrow-nav / preview-pane / 「选择一个会话查看详情」）对应已移除结构。
describe('InboxPage', () => {
  it('renders the message-list inbox shell (no duplicate narrow nav / preview pane)', () => {
    render(<MemoryRouter><InboxPage /></MemoryRouter>);

    expect(screen.getByTestId('message-list')).toBeInTheDocument();
    // NarrowNav 与全局左栏导航重复、PreviewPane 是占位 mock —— 均不应再出现
    expect(screen.queryByTestId('narrow-nav')).not.toBeInTheDocument();
    expect(screen.queryByTestId('preview-pane')).not.toBeInTheDocument();
  });

  it('matches the /inbox route', async () => {
    render(
      <MemoryRouter initialEntries={['/inbox']}>
        <AppRoutes />
      </MemoryRouter>,
    );

    expect(await screen.findByTestId('message-list')).toBeInTheDocument();
    expect(screen.queryByTestId('narrow-nav')).not.toBeInTheDocument();
  });
});
