/**
 * ProjectsPage.test.tsx — Story 15.24
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '../test/utils';
import ProjectsPage from './ProjectsPage';
import type { ProjectRecord } from '../api/projects';

const originalFetch = global.fetch;

const SAMPLE: ProjectRecord[] = [
  {
    project_id: 'pid-a',
    name: 'Alpha',
    workspace_path: '/tmp/alpha',
    skill_id: null,
    design_system_id: null,
    created_at: '2026-05-10T00:00:00.000Z',
    updated_at: '2026-05-10T00:00:00.000Z',
  },
];

function setupFetch() {
  global.fetch = vi.fn(async (url: string | URL | Request) => {
    const u = String(url);
    if (u.endsWith('/api/projects')) {
      return { ok: true, status: 200, json: async () => SAMPLE } as Response;
    }
    if (u.includes('/api/projects/pid-a/conversations')) {
      return { ok: true, status: 200, json: async () => [] } as Response;
    }
    if (u.endsWith('/api/projects/pid-a')) {
      return { ok: true, status: 200, json: async () => SAMPLE[0] } as Response;
    }
    return { ok: true, status: 200, json: async () => [] } as Response;
  }) as unknown as typeof fetch;
}

describe('ProjectsPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    try {
      localStorage.removeItem('sf.lastProject');
    } catch {
      // ignore
    }
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('shows empty meta when no project is selected', async () => {
    setupFetch();
    render(
      <MemoryRouter>
        <ProjectsPage />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('projects-page-empty-meta')).toBeInTheDocument();
    });
  });

  it('selecting a project loads meta and shows conversations panel', async () => {
    setupFetch();
    render(
      <MemoryRouter>
        <ProjectsPage />
      </MemoryRouter>,
    );
    await waitFor(() => screen.getByText('Alpha'));
    await userEvent.click(screen.getByTestId('project-row-pid-a'));
    await waitFor(() => {
      expect(screen.getByTestId('project-meta-name')).toHaveTextContent('Alpha');
      expect(screen.getByTestId('conversation-history-panel')).toBeInTheDocument();
    });
    // localStorage written
    expect(localStorage.getItem('sf.lastProject')).toBe('pid-a');
  });

  it('honors localStorage sf.lastProject on initial render', async () => {
    try {
      localStorage.setItem('sf.lastProject', 'pid-a');
    } catch {
      // ignore
    }
    setupFetch();
    render(
      <MemoryRouter>
        <ProjectsPage />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('project-meta-name')).toHaveTextContent('Alpha');
    });
  });
});
