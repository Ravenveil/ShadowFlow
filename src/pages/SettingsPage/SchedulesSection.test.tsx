/**
 * SchedulesSection — 定时任务管理面板行为测试。
 *
 * mock fetch 按 URL 路由到 schedules / teams / agents 三个真实端点形状，
 * 验证：列表渲染、空态、启用/停用 PATCH、删除（二次确认）、runs 展开。
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render as rawRender, screen, fireEvent, waitFor } from '@testing-library/react';
import { I18nProvider } from '../../common/i18n';
import { SchedulesSection } from './SchedulesSection';

const render: typeof rawRender = (ui, options) =>
  rawRender(<I18nProvider defaultLanguage="zh">{ui}</I18nProvider>, options);

const SCHEDULE = {
  schedule_id: 'sch-1',
  group_id: 'team-1',
  cron_expression: '0 9 * * *',
  start_at: null,
  agent_id: 'agent-1',
  task_description: '每天扫商机',
  duration_min: 30,
  created_at: '2026-08-23T00:00:00+00:00',
  next_run_time: '2026-08-24T09:00:00+00:00',
  completed: false,
  enabled: true,
  runs: [],
};

interface MockOpts {
  schedules?: unknown[];
  teams?: Array<{ team_id: string; name: string }>;
  agents?: Array<{ agent_id: string; name: string }>;
  runs?: unknown[];
  schedulesFail?: boolean;
}

function mockFetch(opts: MockOpts, spy?: ReturnType<typeof vi.fn>) {
  const fn = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const json = (body: unknown, status = 200) =>
      Promise.resolve({ ok: status < 300, status, json: () => Promise.resolve(body), text: () => Promise.resolve(JSON.stringify(body)) } as Response);
    if (spy) spy(input, init);
    if (url.includes('/api/schedules') && init?.method === 'POST') {
      return json({ data: { ...SCHEDULE, task_description: '新建的任务' }, meta: {} }, 201);
    }
    if (url.includes('/api/schedules') && init?.method === 'PATCH') {
      return json({ data: { ...SCHEDULE, enabled: false, next_run_time: null }, meta: {} });
    }
    if (url.includes('/api/schedules') && init?.method === 'DELETE') {
      return Promise.resolve({ ok: true, status: 204, text: () => Promise.resolve('') } as Response);
    }
    if (url.match(/\/api\/schedules\/[^/]+\/runs/)) {
      return json({ data: opts.runs ?? [], meta: {} });
    }
    if (url.includes('/api/schedules')) {
      if (opts.schedulesFail) return json({ detail: 'boom' }, 500);
      return json({ data: opts.schedules ?? [SCHEDULE], meta: {} });
    }
    if (url.includes('/api/teams')) {
      return json({
        data: (opts.teams ?? [{ team_id: 'team-1', name: '获客小队' }]).map((tm) => ({
          description: '', workspace_id: '', agent_ids: [], created_at: '', updated_at: '', ...tm,
        })),
        meta: {},
      });
    }
    if (url.includes('/api/agents')) {
      return json({
        data: (opts.agents ?? [{ agent_id: 'agent-1', name: '小猎' }]).map((a) => ({
          soul: '', workspace_id: '', blueprint: {}, status: 'idle', source: 'quick_hire', created_at: '', ...a,
        })),
        meta: {},
      });
    }
    return json({ detail: 'unhandled' }, 404);
  });
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('SchedulesSection', () => {
  it('渲染计划列表并解析 team/agent 名称', async () => {
    vi.stubGlobal('fetch', mockFetch({}));
    render(<SchedulesSection />);
    expect(await screen.findByText('每天扫商机')).toBeTruthy();
    expect(screen.getByText('0 9 * * *')).toBeTruthy();
    expect(screen.getByText(/获客小队/)).toBeTruthy();
    expect(screen.getByText(/小猎/)).toBeTruthy();
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true');
  });

  it('无计划时展示空态', async () => {
    vi.stubGlobal('fetch', mockFetch({ schedules: [] }));
    render(<SchedulesSection />);
    expect(await screen.findByText(/还没有定时任务/)).toBeTruthy();
  });

  it('列表加载失败展示错误', async () => {
    vi.stubGlobal('fetch', mockFetch({ schedulesFail: true }));
    render(<SchedulesSection />);
    expect(await screen.findByText(/加载失败/)).toBeTruthy();
  });

  it('点击开关调用 PATCH 切换启用态', async () => {
    const spy = vi.fn();
    vi.stubGlobal('fetch', mockFetch({}, spy));
    render(<SchedulesSection />);
    const toggle = await screen.findByRole('switch');
    fireEvent.click(toggle);
    await waitFor(() => {
      const patchCall = spy.mock.calls.find(
        ([url, init]) => String(url).includes('/api/schedules/sch-1') && (init as RequestInit)?.method === 'PATCH',
      );
      expect(patchCall).toBeTruthy();
      expect(JSON.parse(String((patchCall![1] as RequestInit).body))).toEqual({ enabled: false });
    });
  });

  it('删除需二次确认（NeoConfirmModal 弹窗），确认后调用 DELETE', async () => {
    const spy = vi.fn();
    vi.stubGlobal('fetch', mockFetch({}, spy));
    render(<SchedulesSection />);
    const delBtn = await screen.findByTitle('删除');
    // 弹窗出现 → 点确认 → DELETE 发出。
    fireEvent.click(delBtn);
    const modal = await screen.findByTestId('neo-confirm-modal');
    expect(modal).toHaveTextContent('删除后不再触发');
    fireEvent.click(screen.getByTestId('neo-confirm-confirm'));
    await waitFor(() => {
      expect(
        spy.mock.calls.some(
          ([url, init]) => String(url).includes('/api/schedules/sch-1') && (init as RequestInit)?.method === 'DELETE',
        ),
      ).toBe(true);
    });
  });

  it('取消确认弹窗则不调用 DELETE', async () => {
    const spy = vi.fn();
    vi.stubGlobal('fetch', mockFetch({}, spy));
    render(<SchedulesSection />);
    const delBtn = await screen.findByTitle('删除');
    fireEvent.click(delBtn);
    await screen.findByTestId('neo-confirm-modal');
    fireEvent.click(screen.getByTestId('neo-confirm-cancel'));
    expect(
      spy.mock.calls.some(([, init]) => (init as RequestInit)?.method === 'DELETE'),
    ).toBe(false);
  });

  it('展开触发记录展示 runs，空时给空态', async () => {
    vi.stubGlobal('fetch', mockFetch({
      runs: [{ run_id: 'r1', triggered_at: '2026-08-23T09:00:00+00:00', status: 'succeeded' }],
    }));
    render(<SchedulesSection />);
    const expandBtn = await screen.findByTitle('触发记录');
    fireEvent.click(expandBtn);
    expect(await screen.findByText('succeeded')).toBeTruthy();
  });

  it('新建表单提交调用 POST /api/schedules', async () => {
    const spy = vi.fn();
    vi.stubGlobal('fetch', mockFetch({}, spy));
    render(<SchedulesSection />);
    fireEvent.click(await screen.findByText('新建计划'));
    // teams 异步加载——先等 option 出现再改 select，否则 value 不落上
    await screen.findByRole('option', { name: '获客小队' });
    fireEvent.change(screen.getByLabelText('目标团队'), { target: { value: 'team-1' } });
    fireEvent.change(screen.getByPlaceholderText(/扫描今天的新商机/), { target: { value: '每天早上扫一遍商机' } });
    fireEvent.click(screen.getByText('创建计划'));
    await waitFor(() => {
      const postCall = spy.mock.calls.find(
        ([url, init]) => String(url).endsWith('/api/schedules') && (init as RequestInit)?.method === 'POST',
      );
      expect(postCall).toBeTruthy();
      const body = JSON.parse(String((postCall![1] as RequestInit).body));
      expect(body.group_id).toBe('team-1');
      expect(body.cron_expression).toBe('0 9 * * *');
      expect(body.task_description).toBe('每天早上扫一遍商机');
    });
  });
});
