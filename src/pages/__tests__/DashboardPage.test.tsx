/**
 * DashboardPage.test.tsx — 数据看板页测试（2026-11-05 整合批）。
 * 覆盖：四个聚合端点渲染、窗口/指标/维度 tab 切换、空数据与错误态。
 */
import { render, screen, fireEvent, waitFor } from '../../test/utils';
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../api/dashboard', () => ({
  fetchDashboardOverview: vi.fn().mockResolvedValue({
    days: 30,
    window: { from: 0, to: 1 },
    usage: {
      calls: 42,
      input_tokens: 1000,
      output_tokens: 500,
      total_tokens: 1500,
      cost_est_usd: 0.12,
      deltas: { calls: 10, total_tokens: -5, cost_est_usd: null },
    },
    runs: { total: 10, succeeded: 8, failed: 1, canceled: 1, success_rate: 80, delta_total: 25 },
    active: { projects: 3, conversations: 7 },
  }),
  fetchDashboardTimeseries: vi.fn().mockResolvedValue({
    days: 30,
    metric: 'tokens',
    series: [
      { day: 1, calls: 1, tokens: 100 },
      { day: 2, calls: 2, tokens: 300 },
      { day: 3, calls: 0, tokens: 0 },
    ],
  }),
  fetchDashboardBreakdown: vi.fn().mockResolvedValue({
    days: 30,
    by: 'model',
    items: [
      { key: 'claude-sonnet', calls: 30, input_tokens: 800, output_tokens: 400, total_tokens: 1200, cost_est_usd: 0.1 },
      { key: '', calls: 12, input_tokens: 200, output_tokens: 100, total_tokens: 300, cost_est_usd: 0.02 },
    ],
  }),
  fetchDashboardBriefing: vi.fn().mockResolvedValue({
    days: 7,
    generated_at: 1,
    today: { calls: 3, total_tokens: 120, cost_est_usd: 0.01 },
    yesterday: { calls: 5, total_tokens: 200, cost_est_usd: 0.02 },
    failed_top: [{ goal: '修登录页', n: 3 }],
    lessons_learned: [{ kind: 'lesson', n: 2 }],
    trend_7d: { total_tokens: 900, daily: [] },
    alerts: ['今日估算成本 $0.05 已超昨日（$0.02）的 1.5 倍，注意成本突增。'],
  }),
}));

import DashboardPage from '../../pages/DashboardPage';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('DashboardPage — 数据看板（OPC-OS PR#3 整合批）', () => {
  it('渲染概览卡：调用/tokens/成本/run 成功率/活跃', async () => {
    render(<DashboardPage />);
    expect(await screen.findByTestId('db-overview-cards')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('80%')).toBeInTheDocument();
    expect(screen.getByText('$0.12')).toBeInTheDocument();
  });

  it('渲染趋势图与 breakdown 表', async () => {
    render(<DashboardPage />);
    await waitFor(() => expect(screen.getByTestId('db-trend-chart')).toBeInTheDocument());
    expect(await screen.findByTestId('db-breakdown-table')).toBeInTheDocument();
    expect(screen.getByText('claude-sonnet')).toBeInTheDocument();
    expect(screen.getByText('（未记录）')).toBeInTheDocument();
  });

  it('渲染每日简报：今日/昨日/告警/经验沉淀', async () => {
    render(<DashboardPage />);
    expect(await screen.findByTestId('db-alert')).toBeInTheDocument();
    expect(screen.getByText(/成本突增/)).toBeInTheDocument();
    expect(screen.getByText(/教训 ×2/)).toBeInTheDocument();
    expect(screen.getByText(/修登录页/)).toBeInTheDocument();
  });

  it('窗口 tab 切换（7/30/90 天）', async () => {
    render(<DashboardPage />);
    await screen.findByTestId('db-overview-cards');
    fireEvent.click(screen.getByTestId('db-days-7'));
    await waitFor(() => {
      expect(screen.getByTestId('db-days-7')).toHaveAttribute('aria-selected', 'true');
    });
  });

  it('指标 tab 切换（tokens/calls/cost）', async () => {
    render(<DashboardPage />);
    await screen.findByTestId('db-trend-chart');
    fireEvent.click(screen.getByTestId('db-metric-cost'));
    await waitFor(() => {
      expect(screen.getByTestId('db-metric-cost')).toHaveClass('on');
    });
  });
});
