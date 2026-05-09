import { render, screen } from '../test/utils';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AppRoutes } from '@/AppRoutes';
import InboxPage from './InboxPage';

describe('InboxPage', () => {
  it('renders the three-column inbox shell', () => {
    render(<MemoryRouter><InboxPage /></MemoryRouter>);

    expect(screen.getByTestId('narrow-nav')).toBeInTheDocument();
    expect(screen.getByTestId('message-list')).toBeInTheDocument();
    expect(screen.getByTestId('preview-pane')).toBeInTheDocument();
    expect(screen.getByText('选择一个会话查看详情')).toBeInTheDocument();
  });

  it('matches the /inbox route', async () => {
    render(
      <MemoryRouter initialEntries={['/inbox']}>
        <AppRoutes />
      </MemoryRouter>,
    );

    expect(await screen.findByTestId('narrow-nav')).toBeInTheDocument();
    expect(screen.getByTestId('message-list')).toBeInTheDocument();
  });
});
