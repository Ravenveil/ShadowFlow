/**
 * SchedulesPage 测试 — 2026-11-06 /routines 对齐批。
 * 覆盖：加载/空态/计划行（启停 toggle、删除确认、agent 徽标）/操作失败红条。
 */
import { render, screen, fireEvent, waitFor } from '../test/utils';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../api/agents', () => ({
  listAgents: vi.fn().mockResolvedValue([
    { agent_id: 'a1', name: '早报助手', avatar_style: null, avatar_seed: null, avatar_image: null, avatar_color: null, status: 'idle' },
  ]),
}));
vi.mock('../api/schedules', () => ({
  listSchedules: vi.fn(),
  patchSchedule: vi.fn(),
  deleteSchedule: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../neo/NeoConfirmModal', () => ({
  NeoConfirmModal: (props: {
    title: string;
    onConfirm: () => void;
    onClose: () => void;
    busy?: boolean;
  }) => (
    <div data-testid="confirm-modal">
      <span>{props.title}</span>
      <button onClick={props.onConfirm} data-testid="confirm-ok" disabled={props.busy}>
        ok
      </button>
      <button onClick={props.onClose} data-testid="confirm-cancel">
        cancel
      </button>
    </div>
  ),
}));

import { SchedulesPage } from './SchedulesPage';
import { listSchedules, patchSchedule, deleteSchedule } from '../api/schedules';
import type { ScheduleRecord } from '../api/schedules';

const mockList = vi.mocked(listSchedules);
const mockPatch = vi.mocked(patchSchedule);
const mockDelete = vi.mocked(deleteSchedule);

function sched(overrides: Partial<ScheduleRecord> = {}): ScheduleRecord {
  return {
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
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockList.mockResolvedValue([]);
});

describe('SchedulesPage', () => {
  it('空态渲染引导文案', async () => {
    render(
      <MemoryRouter>
        <SchedulesPage embedded />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('neo-schedules-empty')).toBeTruthy();
    });
  });

  it('计划行渲染：摘要 + cron + agent 徽标 + 启停/删除钮', async () => {
    mockList.mockResolvedValue([sched()]);
    render(
      <MemoryRouter>
        <SchedulesPage embedded />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('neo-schedules-row')).toBeTruthy();
    });
    expect(screen.getByText('每天早报')).toBeTruthy();
    expect(screen.getByText('0 9 * * *')).toBeTruthy();
    // agent 徽标（被动展示归属）
    expect(screen.getByTestId('neo-schedules-agent-badge').textContent).toBe('早报助手');
    expect(screen.getByTestId('neo-schedules-toggle')).toBeTruthy();
    expect(screen.getByTestId('neo-schedules-delete')).toBeTruthy();
  });

  it('启停 toggle：点击调 PATCH 并刷新列表', async () => {
    mockList.mockResolvedValue([sched()]);
    mockPatch.mockResolvedValue(sched({ enabled: false }));
    render(
      <MemoryRouter>
        <SchedulesPage embedded />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('neo-schedules-toggle')).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId('neo-schedules-toggle'));
    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith('s1', { enabled: false });
    });
    // 刷新后重新拉列表
    await waitFor(() => {
      expect(mockList).toHaveBeenCalledTimes(2);
    });
  });

  it('删除走二次确认弹窗', async () => {
    mockList.mockResolvedValue([sched()]);
    render(
      <MemoryRouter>
        <SchedulesPage embedded />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('neo-schedules-delete')).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId('neo-schedules-delete'));
    expect(screen.getByTestId('confirm-modal')).toBeTruthy();
    fireEvent.click(screen.getByTestId('confirm-ok'));
    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith('s1');
    });
  });

  it('加载失败显示错误条', async () => {
    mockList.mockRejectedValue(new Error('py down'));
    render(
      <MemoryRouter>
        <SchedulesPage embedded />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText(/加载失败/)).toBeTruthy();
    });
  });
});
