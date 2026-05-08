import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

vi.mock('./pages/ChatPage', () => ({
  default: () => <div data-testid="chat-page">ChatPage</div>,
}));
vi.mock('./pages/AgentDMPage', () => ({
  default: () => <div data-testid="agent-dm-page">AgentDMPage</div>,
}));
vi.mock('./pages/LandingPage', () => ({
  default: () => <div>LandingPage</div>,
}));
vi.mock('./pages/InboxPage', () => ({
  default: () => <div>InboxPage</div>,
}));
vi.mock('./pages/EditorPage', () => ({
  default: () => <div>EditorPage</div>,
}));
vi.mock('./pages/TemplatesPage', () => ({
  default: () => <div>TemplatesPage</div>,
}));
vi.mock('./pages/ImportPage', () => ({
  default: () => <div>ImportPage</div>,
}));
vi.mock('./pages/AboutPage', () => ({
  default: () => <div>AboutPage</div>,
}));

import { AppRoutes } from './AppRoutes';

describe('AppRoutes — new routes', () => {
  it('/chat/:groupId renders ChatPage', async () => {
    render(
      <MemoryRouter initialEntries={['/chat/test-id']}>
        <AppRoutes />
      </MemoryRouter>
    );
    expect(await screen.findByTestId('chat-page')).toBeInTheDocument();
  });

  it('/agent-dm/:agentId renders AgentDMPage', async () => {
    render(
      <MemoryRouter initialEntries={['/agent-dm/agent-123']}>
        <AppRoutes />
      </MemoryRouter>
    );
    expect(await screen.findByTestId('agent-dm-page')).toBeInTheDocument();
  });
});
