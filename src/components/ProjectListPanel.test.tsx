/**
 * ProjectListPanel.test.tsx — Story 15.24
 *
 * Vitest + @testing-library/react. Mirrors the ConversationPicker test pattern
 * (global fetch mock + I18nProvider wrapper via test/utils render).
 *
 * Covers:
 *  - empty state rendering
 *  - list rendering after fetch
 *  - "+ New project" → modal validation → POST → list refresh
 *  - row delete with retype-name confirm → DELETE
 *  - localStorage write on row click
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '../test/utils';
import { ProjectListPanel } from './ProjectListPanel';
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
  {
    project_id: 'pid-b',
    name: 'Beta',
    workspace_path: '/tmp/beta',
    skill_id: null,
    design_system_id: null,
    created_at: '2026-05-09T00:00:00.000Z',
    updated_at: '2026-05-09T00:00:00.000Z',
  },
];

function mockFetchOk<T>(data: T) {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => data,
  })) as unknown as typeof fetch;
}

describe('ProjectListPanel', () => {
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

  it('renders empty-state when fetch returns []', async () => {
    global.fetch = mockFetchOk([] as ProjectRecord[]);
    render(<ProjectListPanel selectedId={null} onSelect={() => undefined} />);
    await waitFor(() => {
      expect(screen.getByTestId('project-list-empty')).toBeInTheDocument();
    });
  });

  it('renders list rows after fetch and writes localStorage on click', async () => {
    global.fetch = mockFetchOk(SAMPLE);
    const onSelect = vi.fn();
    render(<ProjectListPanel selectedId={null} onSelect={onSelect} />);
    await waitFor(() => {
      expect(screen.getByText('Alpha')).toBeInTheDocument();
      expect(screen.getByText('Beta')).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId('project-row-pid-a'));
    expect(onSelect).toHaveBeenCalledWith('pid-a');
    expect(localStorage.getItem('sf.lastProject')).toBe('pid-a');
  });

  it('opens create modal, posts on submit, auto-selects new project', async () => {
    const newProject: ProjectRecord = {
      project_id: 'pid-new',
      name: 'Gamma',
      workspace_path: '/tmp/gamma',
      skill_id: null,
      design_system_id: null,
      created_at: '2026-05-10T12:00:00.000Z',
      updated_at: '2026-05-10T12:00:00.000Z',
    };
    let calls = 0;
    global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls += 1;
      const u = String(url);
      if (calls === 1) {
        // initial listProjects
        return { ok: true, status: 200, json: async () => SAMPLE } as Response;
      }
      if (u.endsWith('/api/skills')) {
        return { ok: true, status: 200, json: async () => [] } as Response;
      }
      // POST createProject
      expect(init?.method).toBe('POST');
      const body = JSON.parse((init!.body as string) ?? '{}');
      expect(body.name).toBe('Gamma');
      return { ok: true, status: 201, json: async () => newProject } as Response;
    }) as unknown as typeof fetch;

    const onSelect = vi.fn();
    render(<ProjectListPanel selectedId={null} onSelect={onSelect} />);
    await waitFor(() => screen.getByText('Alpha'));

    await userEvent.click(screen.getByTestId('project-list-new-btn'));
    expect(screen.getByTestId('project-create-modal')).toBeInTheDocument();

    const input = screen.getByTestId('project-create-name');
    await userEvent.type(input, 'Gamma');
    await userEvent.click(screen.getByTestId('project-create-submit'));

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith('pid-new');
    });
    expect(localStorage.getItem('sf.lastProject')).toBe('pid-new');
  });

  it('delete flow requires re-typing project name to enable DELETE', async () => {
    const fetchSpy = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      if (init?.method === 'DELETE') {
        return { ok: true, status: 204, json: async () => ({}) } as Response;
      }
      if (u.includes('/api/projects')) {
        return { ok: true, status: 200, json: async () => SAMPLE } as Response;
      }
      return { ok: true, status: 200, json: async () => [] } as Response;
    });
    global.fetch = fetchSpy as unknown as typeof fetch;

    const onDeleted = vi.fn();
    render(
      <ProjectListPanel
        selectedId="pid-a"
        onSelect={() => undefined}
        onDeleted={onDeleted}
      />,
    );
    await waitFor(() => screen.getByText('Alpha'));
    await userEvent.click(screen.getByTestId('project-row-delete-pid-a'));
    expect(screen.getByTestId('project-delete-modal')).toBeInTheDocument();
    const submit = screen.getByTestId('project-delete-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    await userEvent.type(
      screen.getByTestId('project-delete-confirm-input'),
      'Alpha',
    );
    expect(submit.disabled).toBe(false);
    await userEvent.click(submit);
    await waitFor(() => {
      expect(onDeleted).toHaveBeenCalledWith('pid-a');
    });
    // Verify the DELETE call actually happened
    const deleteCall = fetchSpy.mock.calls.find((c) => {
      const init = c[1] as RequestInit | undefined;
      return init?.method === 'DELETE';
    });
    expect(deleteCall).toBeDefined();
  });
});
