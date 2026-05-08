import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ScheduleDrawer, describeSchedule } from './ScheduleDrawer';
import type { Schedule } from '../../api/schedules';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../api/schedules', () => ({
  listSchedules: vi.fn(),
  createSchedule: vi.fn(),
  deleteSchedule: vi.fn(),
  getScheduleRuns: vi.fn(),
  ScheduleApiError: class ScheduleApiError extends Error {
    constructor(public status: number, public detail: unknown) {
      super(`Schedule API error ${status}`);
    }
  },
}));

import * as schedulesApi from '../../api/schedules';
const mockList = schedulesApi.listSchedules as ReturnType<typeof vi.fn>;
const mockCreate = schedulesApi.createSchedule as ReturnType<typeof vi.fn>;
const mockDelete = schedulesApi.deleteSchedule as ReturnType<typeof vi.fn>;
const mockRuns = schedulesApi.getScheduleRuns as ReturnType<typeof vi.fn>;

function makeSchedule(overrides: Partial<Schedule> = {}): Schedule {
  return {
    schedule_id: 'sch-001',
    group_id: 'grp-test',
    cron_expression: '0 8 * * *',
    agent_id: 'agent-1',
    task_description: 'Daily brief',
    created_at: '2026-05-04T00:00:00Z',
    next_run_time: '2026-05-05T08:00:00Z',
    runs: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockList.mockResolvedValue({ data: [], meta: {} });
  mockCreate.mockResolvedValue({ data: makeSchedule(), meta: {} });
  mockDelete.mockResolvedValue(undefined);
  mockRuns.mockResolvedValue({ data: [], meta: {} });
});

// ---------------------------------------------------------------------------
// describeSchedule helper
// ---------------------------------------------------------------------------

describe('describeSchedule', () => {
  it('formats daily cron', () => {
    expect(describeSchedule(makeSchedule({ cron_expression: '0 8 * * *' }))).toBe('Daily 08:00 ✓');
  });

  it('formats weekly cron', () => {
    expect(describeSchedule(makeSchedule({ cron_expression: '30 9 * * 1' }))).toBe('Weekly Mon 09:30 ✓');
  });

  it('formats custom cron', () => {
    expect(describeSchedule(makeSchedule({ cron_expression: '0 8 1 * *' }))).toBe('Custom ✓');
  });
});

// ---------------------------------------------------------------------------
// ScheduleDrawer rendering
// ---------------------------------------------------------------------------

describe('ScheduleDrawer', () => {
  it('renders the drawer header', async () => {
    render(<ScheduleDrawer groupId="grp-test" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    expect(screen.getByText('Schedule')).toBeInTheDocument();
  });

  it('shows close button and calls onClose on click', async () => {
    const onClose = vi.fn();
    render(<ScheduleDrawer groupId="grp-test" onClose={onClose} />);
    await waitFor(() => expect(screen.getByLabelText('关闭 Schedule Drawer')).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText('关闭 Schedule Drawer'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose on ESC keydown', async () => {
    const onClose = vi.fn();
    render(<ScheduleDrawer groupId="grp-test" onClose={onClose} />);
    const dialog = await screen.findByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('shows "No runs yet" when schedule has no history', async () => {
    mockList.mockResolvedValue({ data: [makeSchedule()], meta: {} });
    mockRuns.mockResolvedValue({ data: [], meta: {} });
    render(<ScheduleDrawer groupId="grp-test" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('No runs yet')).toBeInTheDocument());
  });

  it('shows run history dots', async () => {
    mockList.mockResolvedValue({ data: [makeSchedule()], meta: {} });
    mockRuns.mockResolvedValue({
      data: [
        { run_id: 'r1', triggered_at: '2026-05-04T08:00:00Z', status: 'succeeded' },
        { run_id: 'r2', triggered_at: '2026-05-03T08:00:00Z', status: 'failed' },
      ],
      meta: {},
    });
    render(<ScheduleDrawer groupId="grp-test" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('succeeded')).toBeInTheDocument());
    expect(screen.getByText('failed')).toBeInTheDocument();
  });

  it('saves a new schedule on save click', async () => {
    render(<ScheduleDrawer groupId="grp-test" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('保存')).toBeInTheDocument());
    await act(async () => { fireEvent.click(screen.getByText('保存')); });
    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ group_id: 'grp-test' }));
  });

  it('shows Saved flash after successful save', async () => {
    render(<ScheduleDrawer groupId="grp-test" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('保存')).toBeInTheDocument());
    await act(async () => { fireEvent.click(screen.getByText('保存')); });
    await waitFor(() => expect(screen.getByText('Saved ✓')).toBeInTheDocument());
  });

  it('shows delete button when existing schedule loaded', async () => {
    mockList.mockResolvedValue({ data: [makeSchedule()], meta: {} });
    render(<ScheduleDrawer groupId="grp-test" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('删除')).toBeInTheDocument());
  });

  it('calls deleteSchedule on delete click', async () => {
    mockList.mockResolvedValue({ data: [makeSchedule()], meta: {} });
    render(<ScheduleDrawer groupId="grp-test" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('删除')).toBeInTheDocument());
    await act(async () => { fireEvent.click(screen.getByText('删除')); });
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('sch-001'));
  });
});
