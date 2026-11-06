/**
 * NeoRail 定时任务分区测试 — 2026-11-06 GrokBot/OpenBot /routines 对齐批。
 * 覆盖：
 *  - 一级导航「定时任务」行常驻，点击 → onNavigate({view:'schedules'})
 *  - schedules 列表区：loading 骨架 / 空态 / 计划行（停用徽标）/「管理全部…」
 *  - 加载失败 → 错误条 + 重试钮
 */
import { render, screen, fireEvent, waitFor } from '../../test/utils';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../api/agents', () => ({
  listAgents: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../api/teams', () => ({
  listTeams: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../api/groupApi', () => ({
  resolveDmConversation: vi.fn().mockResolvedValue(null),
  resolveTeamGroup: vi.fn().mockResolvedValue(null),
}));
vi.mock('../../api/projects', () => ({
  listProjectsWithSessions: vi.fn().mockResolvedValue([]),
  createProject: vi.fn().mockResolvedValue({ project_id: 'p1', name: 'x' }),
}));
vi.mock('../../api/knowledge', () => ({
  listPacks: vi.fn().mockResolvedValue({ data: { packs: [] } }),
}));
vi.mock('../../api/knowledgeVaults', () => ({
  listVaults: vi.fn().mockResolvedValue({ data: { vaults: [] } }),
}));
vi.mock('../../api/memoryEntries', () => ({
  listMemoryEntries: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../api/schedules', () => ({
  listSchedules: vi.fn(),
  patchSchedule: vi.fn().mockResolvedValue({}),
  deleteSchedule: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../core/auth/AuthContext', () => ({
  useAuth: () => ({ user: null }),
}));

import { NeoRail } from '../NeoRail';
import { listSchedules } from '../../api/schedules';
import type { NeoNav, RailSection } from '../types';

const mockListSchedules = vi.mocked(listSchedules);

function renderRail(nav: NeoNav, section: RailSection) {
  const onNavigate = vi.fn();
  const onNewTask = vi.fn();
  render(
    <MemoryRouter>
      <NeoRail
        nav={nav}
        section={section}
        onNavigate={onNavigate}
        onNewTask={onNewTask}
        collapsed={false}
        onToggleCollapsed={vi.fn()}
      />
    </MemoryRouter>,
  );
  return { onNavigate };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockListSchedules.mockResolvedValue([]);
});

describe('定时任务导航行', () => {
  it('一级导航渲染「定时任务」行，点击上报 schedules 视图', () => {
    const { onNavigate } = renderRail({ view: 'home' }, 'home');
    const btn = screen.getByTestId('neo-nav-schedules');
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(onNavigate).toHaveBeenCalledWith({ view: 'schedules' });
  });

  it('nav.view=schedules 时导航行高亮', () => {
    renderRail({ view: 'schedules' }, 'schedules');
    expect(screen.getByTestId('neo-nav-schedules').className).toContain('on');
  });
});

describe('schedules 列表区', () => {
  it('空态：无计划显示引导文案', async () => {
    mockListSchedules.mockResolvedValue([]);
    renderRail({ view: 'schedules' }, 'schedules');
    await waitFor(() => {
      expect(screen.getByTestId('neo-rail-schedules-empty')).toBeTruthy();
    });
  });

  it('计划行渲染：任务摘要 + 停用徽标 + 管理全部入口', async () => {
    mockListSchedules.mockResolvedValue([
      {
        schedule_id: 's1',
        group_id: 'g1',
        cron_expression: '0 9 * * *',
        start_at: null,
        agent_id: 'a1',
        task_description: '每天早报',
        duration_min: 30,
        created_at: '2026-11-05T00:00:00Z',
        next_run_time: '2026-11-07T01:00:00Z',
        completed: false,
        enabled: true,
        runs: [],
      },
      {
        schedule_id: 's2',
        group_id: 'g1',
        cron_expression: null,
        start_at: '2026-11-06T12:00:00Z',
        agent_id: null,
        task_description: '一次性提醒',
        duration_min: 30,
        created_at: '2026-11-05T00:00:00Z',
        next_run_time: null,
        completed: true,
        enabled: false,
        runs: [],
      },
    ]);
    renderRail({ view: 'schedules' }, 'schedules');
    await waitFor(() => {
      expect(screen.getAllByTestId('neo-rail-schedule-row').length).toBeGreaterThan(0);
    });
    const rows = screen.getAllByTestId('neo-rail-schedule-row');
    expect(rows).toHaveLength(2);
    expect(screen.getByText('每天早报')).toBeTruthy();
    expect(screen.getByText('一次性提醒')).toBeTruthy();
    // 停用徽标（仅停用行有）
    expect(screen.getByText('停用')).toBeTruthy();
    // 管理全部入口
    expect(screen.getByTestId('neo-rail-schedules-manage')).toBeTruthy();
  });

  it('加载失败：错误条 + 重试钮', async () => {
    mockListSchedules.mockRejectedValue(new Error('py down'));
    renderRail({ view: 'schedules' }, 'schedules');
    await waitFor(() => {
      expect(screen.getAllByText(/加载失败|失败/).length).toBeGreaterThan(0);
    });
    expect(screen.getByRole('button', { name: /重试/ })).toBeTruthy();
  });
});
