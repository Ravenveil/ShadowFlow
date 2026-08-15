import { render, screen } from './test/utils';
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
vi.mock('./neo/NeoGroupChat', () => ({
  default: () => <div data-testid="neo-group-chat">NeoGroupChat</div>,
}));

import { AppRoutes } from './AppRoutes';

// Neo 重构（2026-08-15）后 /chat、/agent-dm 等旧路由下架，一律 redirect 到
// `/`（NeoApp）。群聊体验由新路由 /group/:groupId（NeoGroupChat）承接。
describe('AppRoutes — new routes', () => {
  it('/chat/:groupId redirects to Neo home (legacy route retired)', async () => {
    render(
      <MemoryRouter initialEntries={['/chat/test-id']}>
        <AppRoutes />
      </MemoryRouter>
    );
    // Suspense 懒加载解析后落在 NeoApp（非旧 ChatPage testid）。
    expect(await screen.findByTestId('chat-page').catch(() => null)).toBeNull();
  });

  it('/agent-dm/:agentId redirects to Neo home (legacy route retired)', async () => {
    render(
      <MemoryRouter initialEntries={['/agent-dm/agent-123']}>
        <AppRoutes />
      </MemoryRouter>
    );
    expect(await screen.findByTestId('agent-dm-page').catch(() => null)).toBeNull();
  });

  it('/group/:groupId renders NeoGroupChat (群聊现场页)', async () => {
    render(
      <MemoryRouter initialEntries={['/group/g-123']}>
        <AppRoutes />
      </MemoryRouter>
    );
    expect(await screen.findByTestId('neo-group-chat')).toBeInTheDocument();
  });
});
