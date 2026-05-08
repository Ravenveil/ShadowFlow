/**
 * TabTeams 测试 — M2: 接真实后端
 *
 * mock fetch 模拟后端响应，用和 TabAgents.test.tsx 相同的 vi.stubGlobal 模式。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import { TabTeams } from '../../../components/workspace/TabTeams';

const mockTeams = [
  {
    team_id: 'team-001',
    name: '论文深读小队',
    description: 'RUNNING · #042',
    workspace_id: 'default',
    agent_ids: ['a1', 'a2', 'a3', 'a4', 'a5'],
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-01T00:00:00Z',
  },
  {
    team_id: 'team-002',
    name: '文献综述',
    description: '暂停',
    workspace_id: 'default',
    agent_ids: ['a1', 'a2', 'a3', 'a4'],
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-01T00:00:00Z',
  },
];

const envelope = (data: unknown) => ({ data, meta: {} });

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
    if (init?.method && init.method !== 'GET') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(envelope({})) } as Response);
    }
    if (typeof url === 'string' && url.includes('/workflow')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(envelope({ nodes: [], edges: [] })) } as Response);
    }
    if (typeof url === 'string' && (url.includes('/policy') || url.includes('/agents'))) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(envelope([])) } as Response);
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve(envelope(mockTeams)) } as Response);
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('TabTeams', () => {
  it('shows loading then renders teams from listTeams()', async () => {
    const { container } = render(<TabTeams />);
    // loading 文字
    expect(container.textContent).toContain('加载 Teams 中');
    // 等异步完成
    await waitFor(() => {
      expect(container.textContent).toContain('论文深读小队');
    });
    expect(container.textContent).toContain('文献综述');
  });

  it('defaults to 论文深读小队 in canvas header', async () => {
    const { container } = render(<TabTeams />);
    await waitFor(() => expect(container.textContent).toContain('论文深读小队'));
    // canvas header 里应出现来自第一个 team 的名称
    // 两处均含该名（列表 + canvas header）
    const matches = container.textContent?.split('论文深读小队').length ?? 0;
    expect(matches).toBeGreaterThanOrEqual(2);
  });

  it('clicking 文献综述 switches canvas header title', async () => {
    const { container, getAllByText } = render(<TabTeams />);
    await waitFor(() => expect(container.textContent).toContain('文献综述'));

    const targets = getAllByText('文献综述');
    fireEvent.click(targets[0]);

    // canvas header 应显示 文献综述 的 status
    await waitFor(() => {
      expect(container.textContent).toContain('暂停');
    });
  });

  it('shows empty state when backend returns []', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve(envelope([])),
    } as Response)));

    const { getByTestId } = render(<TabTeams />);
    await waitFor(() => expect(getByTestId('teams-empty')).toBeInTheDocument());
    expect(getByTestId('teams-empty').textContent).toContain('还没有 Team');
  });

  it('opens Create Team modal on + click', async () => {
    const { getByTestId, container } = render(<TabTeams />);
    await waitFor(() => expect(container.textContent).toContain('论文深读小队'));

    fireEvent.click(getByTestId('open-create-team'));
    expect(getByTestId('create-team-modal')).toBeInTheDocument();
    expect(getByTestId('ct-name')).toBeInTheDocument();
    expect(getByTestId('ct-desc')).toBeInTheDocument();
    expect(getByTestId('ct-agents')).toBeInTheDocument();
    expect(getByTestId('ct-submit')).toBeInTheDocument();
  });

  it('Create Team submit calls createTeam and refreshes list', async () => {
    const newTeam = {
      team_id: 'team-003',
      name: '新测试队',
      description: '测试',
      workspace_id: 'default',
      agent_ids: ['a1'],
      created_at: '2026-05-02T00:00:00Z',
      updated_at: '2026-05-02T00:00:00Z',
    };

    let teamsListCallCount = 0;
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(envelope(newTeam)) } as Response);
      }
      // Workflow and policy sub-resources → return empty but valid shapes
      if (typeof url === 'string' && url.includes('/workflow')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(envelope({ nodes: [], edges: [] })) } as Response);
      }
      if (typeof url === 'string' && (url.includes('/policy') || url.includes('/agents'))) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(envelope([])) } as Response);
      }
      // /api/teams list: first call → mockTeams; second (after POST refresh) → mockTeams + newTeam
      teamsListCallCount++;
      const list = teamsListCallCount > 1 ? [...mockTeams, newTeam] : mockTeams;
      return Promise.resolve({ ok: true, json: () => Promise.resolve(envelope(list)) } as Response);
    }));

    const { getByTestId, container } = render(<TabTeams />);
    await waitFor(() => expect(container.textContent).toContain('论文深读小队'));

    fireEvent.click(getByTestId('open-create-team'));
    fireEvent.change(getByTestId('ct-name') as HTMLInputElement, { target: { value: '新测试队' } });
    fireEvent.change(getByTestId('ct-desc') as HTMLTextAreaElement, { target: { value: '测试' } });
    fireEvent.change(getByTestId('ct-agents') as HTMLInputElement, { target: { value: 'a1' } });
    fireEvent.click(getByTestId('ct-submit'));

    await waitFor(() => expect(container.textContent).toContain('新测试队'));
  });
});
