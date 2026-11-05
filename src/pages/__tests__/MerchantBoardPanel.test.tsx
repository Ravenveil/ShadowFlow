/**
 * MerchantBoardPanel.test.tsx — 功能线① 前端契约测试（2026-11-05）。
 *
 * 覆盖：KPI 与对账标记、分时图零值桶、切换粒度重新取数、客流渠道表、
 * 第一单五步链路与按 trace 查询、后端失败只降级不崩。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { I18nProvider } from '../../common/i18n';
import * as api from '../../api/merchantBoard';
import MerchantBoardPanel from '../MerchantBoardPanel';

vi.mock('../../api/merchantBoard', () => ({
  fetchMerchantOverview: vi.fn(),
  fetchOrderTimeseries: vi.fn(),
  fetchTrafficCurve: vi.fn(),
  fetchReconcile: vi.fn(),
  fetchFirstOrderChain: vi.fn(),
}));

const overview: api.MerchantOverview = {
  revenue_cents: 19900,
  cost_cents: 4300,
  gross_profit_cents: 15600,
  gross_margin_pct: 78.4,
  orders_total: 1,
  paid_orders: 1,
  refunded_orders: 0,
  transacted_orders: 1,
  avg_order_cents: 19900,
  first_order: { id: 'o1', trace_id: 't1', paid_at: 1700000000000 },
};

const flow: api.OrderTimeseries = {
  granularity: 'day',
  from: 1700000000000,
  to: 1700086400000,
  series: [
    { ts: 1700000000000, orders: 2, paid_orders: 1, amount_cents: 19900, avg_order_cents: 19900 },
    { ts: 1700086400000, orders: 0, paid_orders: 0, amount_cents: 0, avg_order_cents: 0 },
  ],
  total: { orders: 2, paid_orders: 1, amount_cents: 19900 },
  peak: { ts: 1700000000000, orders: 2, paid_orders: 1, amount_cents: 19900, avg_order_cents: 19900 },
};

const traffic: api.TrafficCurve = {
  granularity: 'day',
  from: 1700000000000,
  to: 1700086400000,
  series: [{ ts: 1700000000000, pv: 3, uv: 2, converted_visits: 1, conversion_rate: 50 }],
  channels: [
    { channel: 'wechat', ts: 1700000000000, pv: 1, uv: 1, converted_visits: 1, conversion_rate: 100 },
    { channel: 'douyin', ts: 1700000000000, pv: 2, uv: 2, converted_visits: 0, conversion_rate: 0 },
  ],
  total: { pv: 3, uv: 2, converted_visits: 1, conversion_rate: 50 },
};

const chain: api.FirstOrderChain = {
  complete: true,
  trace_id: 't1',
  order_id: 'o1',
  steps: [
    { step: 'visit_landed', ok: true },
    { step: 'order_created', ok: true },
    { step: 'order_paid', ok: true },
    { step: 'ledger_income', ok: true },
    { step: 'dashboard_visible', ok: true },
  ],
};

const reconcile: api.ReconcileResult = {
  ledger: { income: 19900, refund: 0, expense: 4300 },
  orders: { amount: 19900, cost: 4300 },
  diffs: { income_cents: 0, expense_cents: 0, refund_cents: 0, refund_rows: 0 },
  balanced: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.fetchMerchantOverview).mockResolvedValue(overview);
  vi.mocked(api.fetchOrderTimeseries).mockResolvedValue(flow);
  vi.mocked(api.fetchTrafficCurve).mockResolvedValue(traffic);
  vi.mocked(api.fetchReconcile).mockResolvedValue(reconcile);
  vi.mocked(api.fetchFirstOrderChain).mockResolvedValue(chain);
});

function renderPanel() {
  return render(
    <I18nProvider>
      <MerchantBoardPanel />
    </I18nProvider>,
  );
}

describe('MerchantBoardPanel', () => {
  it('渲染四个 KPI 与账实一致标记', async () => {
    renderPanel();
    await waitFor(() => expect(screen.getByTestId('merchant-revenue')).toHaveTextContent('¥199'));
    expect(screen.getByTestId('merchant-cost')).toHaveTextContent('¥43');
    expect(screen.getByTestId('merchant-gross')).toHaveTextContent('78.4%');
    expect(screen.getByTestId('merchant-aov')).toHaveTextContent('¥199');
    expect(screen.getByTestId('merchant-reconcile-chip')).toHaveTextContent('账实一致');
  });

  it('分时图画出零值桶，切换粒度会重新按新粒度取数', async () => {
    renderPanel();
    await waitFor(() => expect(screen.getByTestId('merchant-flow-chart')).toBeInTheDocument());
    expect(screen.getByTestId('merchant-bar-1')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('merchant-granularity-hour'));
    await waitFor(() =>
      expect(api.fetchOrderTimeseries).toHaveBeenCalledWith(expect.objectContaining({ granularity: 'hour' })),
    );
  });

  it('客流展示 PV/UV/转化率与分渠道明细', async () => {
    renderPanel();
    await waitFor(() => expect(screen.getByTestId('merchant-channel-table')).toBeInTheDocument());
    expect(screen.getByText('wechat')).toBeInTheDocument();
    expect(screen.getByText('douyin')).toBeInTheDocument();
    expect(screen.getByTestId('merchant-traffic')).toHaveTextContent('PV 3');
    expect(screen.getByTestId('merchant-traffic')).toHaveTextContent('UV 2');
  });

  it('第一单五步全部显示为通过，按 trace 查询走新请求', async () => {
    renderPanel();
    await waitFor(() => expect(screen.getByTestId('merchant-chain-steps')).toBeInTheDocument());
    for (const step of ['visit_landed', 'order_created', 'order_paid', 'ledger_income', 'dashboard_visible']) {
      expect(screen.getByTestId(`merchant-step-${step}`)).toHaveTextContent('✓');
    }
    expect(screen.getByTestId('merchant-chain-state')).toHaveTextContent('五步全通');

    fireEvent.change(screen.getByTestId('merchant-trace-input'), { target: { value: 't-trace-9' } });
    fireEvent.click(screen.getByTestId('merchant-trace-load'));
    await waitFor(() => expect(api.fetchFirstOrderChain).toHaveBeenCalledWith('t-trace-9'));
  });

  it('后端不可用时只显示错误条，不抛异常也不清空页面', async () => {
    vi.mocked(api.fetchMerchantOverview).mockRejectedValue(new Error('boom'));
    renderPanel();
    await waitFor(() => expect(screen.getByTestId('merchant-error')).toHaveTextContent('boom'));
    expect(screen.getByTestId('merchant-board-panel')).toBeInTheDocument();
  });
});
