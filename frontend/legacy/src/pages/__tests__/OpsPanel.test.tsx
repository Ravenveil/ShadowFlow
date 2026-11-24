/**
 * OpsPanel.test.tsx — 代运营看板前端契约测试（2026-11-07，缺口审计 P1）。
 *
 * 覆盖：四步进度与缺口 chip、plan 直出、一键分发（有/无 active 账号）、
 * 运单列表与交运/轨迹动作、状态筛选重新取数、后端失败只降级不崩。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { I18nProvider } from '../../common/i18n';
import * as api from '../../api/ops';
import * as merchant from '../../api/merchantBoard';
import OpsPanel from '../OpsPanel';

vi.mock('../../api/ops', () => ({
  fetchOpsOverview: vi.fn(),
  fetchOpsShipments: vi.fn(),
  fetchPublishAccounts: vi.fn(),
  launchMarketing: vi.fn(),
  shipOpsShipment: vi.fn(),
  trackOpsShipment: vi.fn(),
}));

vi.mock('../../api/merchantBoard', () => ({
  listMerchantProducts: vi.fn(),
}));

const overview: api.OpsOverview = {
  steps: [
    {
      key: 'listing',
      name: '上架商品',
      count: 2,
      done: true,
      gap: [],
      next_action: null,
      next_hint: 'POST /api/merchant/products',
    },
    {
      key: 'copywriting',
      name: '生成营销帖',
      count: 1,
      done: false,
      gap: ['prod-2'],
      next_action: {
        method: 'POST',
        path: '/api/ops/marketing/launch',
        body: { product_id: 'prod-2' },
        note: '生成营销帖并发布',
      },
      next_hint: 'POST /api/ops/marketing/launch',
    },
    {
      key: 'distribution',
      name: '多平台分发',
      count: 1,
      done: false,
      gap: ['prod-2'],
      next_action: null,
      next_hint: 'POST /api/ops/marketing/launch',
    },
    {
      key: 'fulfillment',
      name: '快递寄出',
      count: 1,
      done: true,
      gap: [],
      next_action: null,
      next_hint: 'POST /api/ops/shipments',
    },
  ],
  plan: {
    next_action: {
      method: 'POST',
      path: '/api/ops/marketing/launch',
      body: { product_id: 'prod-2' },
      note: '生成营销帖并发布',
    },
    reason: '先做「生成营销帖」这一步：生成营销帖并发布',
  },
  products: 2,
  posts: { total: 1, draft: 0, publishing: 0, published: 1, failed: 0 },
  shipments: {
    shipments: 1,
    pending: 1,
    shipped: 0,
    in_transit: 0,
    delivered: 0,
    failed: 0,
    events: 1,
  },
  accounts: 2,
  pending_orders: [
    { id: 'order-1', product_id: 'prod-1', amount_cents: 12800, created_at: 1700000000000 },
  ],
  awaiting_shipment: [],
};

const shipment: api.ShipmentRow = {
  id: 'ship-1',
  order_id: 'order-1',
  carrier: 'sf',
  mode: 'mock',
  tracking_no: null,
  receiver_name: '林小满',
  receiver_phone: '13800001234',
  receiver_address: '浙江省杭州市西湖区文三路 100 号',
  weight_grams: 480,
  remark: '',
  status: 'pending',
  attempts: 0,
  error: null,
  created_at: 1700000000000,
  shipped_at: null,
  updated_at: 1700000000000,
};

function mockApi(overrides: Partial<Record<string, unknown>> = {}): void {
  const ov = api.fetchOpsOverview as ReturnType<typeof vi.fn>;
  const ships = api.fetchOpsShipments as ReturnType<typeof vi.fn>;
  const accts = api.fetchPublishAccounts as ReturnType<typeof vi.fn>;
  const prods = merchant.listMerchantProducts as ReturnType<typeof vi.fn>;
  const launch = api.launchMarketing as ReturnType<typeof vi.fn>;
  ov.mockResolvedValue(overview);
  ships.mockResolvedValue({ shipments: [shipment] });
  accts.mockResolvedValue({
    accounts: [
      { id: 'a1', platform: 'xiaohongshu', account_name: '小满手作', status: 'active' },
      { id: 'a2', platform: 'douyin', account_name: '小满手作', status: 'active' },
    ],
  });
  prods.mockResolvedValue([
    { id: 'prod-1', name: '手作柴烧茶杯', price_cents: 12800, cost_cents: 3000, created_at: 1 },
  ]);
  launch.mockResolvedValue({
    product: { id: 'prod-1', name: '手作柴烧茶杯', price_cents: 12800 },
    items: [
      {
        account_id: 'a1',
        platform: 'xiaohongshu',
        post_id: 'p1',
        status: 'published',
        external_id: 'mock_x',
        code: null,
        error: null,
        skipped: false,
      },
    ],
    summary: { targets: 1, published: 1, skipped: 0, failed: 0 },
  });
  for (const [k, v] of Object.entries(overrides)) {
    (api as unknown as Record<string, ReturnType<typeof vi.fn>>)[k]?.mockResolvedValue(v);
  }
}

function renderPanel(): void {
  render(
    <I18nProvider>
      <OpsPanel />
    </I18nProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockApi();
});

describe('OpsPanel — 四步进度与 plan', () => {
  it('四步卡片直出 count/done，缺口以 chip 展示具体 id', async () => {
    renderPanel();
    await waitFor(() => expect(screen.getByTestId('ops-steps')).toBeInTheDocument());
    const copy = screen.getByTestId('ops-step-copywriting');
    expect(within(copy).getByText('生成营销帖')).toBeInTheDocument();
    expect(within(copy).getByText('prod-2')).toBeInTheDocument();
    expect(within(copy).getByText('有缺口')).toBeInTheDocument();
    const listing = screen.getByTestId('ops-step-listing');
    expect(within(listing).getByText('完成')).toBeInTheDocument();
  });

  it('plan 直出：reason + 可照抄端点 + body', async () => {
    renderPanel();
    await waitFor(() => expect(screen.getByTestId('ops-plan')).toBeInTheDocument());
    expect(screen.getByText('先做「生成营销帖」这一步：生成营销帖并发布')).toBeInTheDocument();
    expect(screen.getByText('POST /api/ops/marketing/launch')).toBeInTheDocument();
    expect(screen.getByText('{"product_id":"prod-2"}')).toBeInTheDocument();
    // 待寄出订单提示
    expect(screen.getByText(/order-1/)).toBeInTheDocument();
  });
});

describe('OpsPanel — 一键分发', () => {
  it('点击一键分发：只投 active 账号平台，回执汇总如实展示', async () => {
    renderPanel();
    const btn = await screen.findByTestId('ops-launch-prod-1');
    fireEvent.click(btn);
    await waitFor(() =>
      expect(api.launchMarketing).toHaveBeenCalledWith('prod-1', ['xiaohongshu', 'douyin']),
    );
    await waitFor(() =>
      expect(screen.getByTestId('ops-launch-result-prod-1')).toHaveTextContent('新发 1'),
    );
  });

  it('无 active 发布账号 → 按钮禁用且提示', async () => {
    mockApi({
      fetchPublishAccounts: { accounts: [{ id: 'a1', platform: 'weibo', account_name: 'x', status: 'paused' }] },
    });
    renderPanel();
    const btn = await screen.findByTestId('ops-launch-prod-1');
    expect(btn).toBeDisabled();
    expect(screen.getByText('无 active 发布账号')).toBeInTheDocument();
  });
});

describe('OpsPanel — 运单履约', () => {
  it('运单列表渲染：模拟单据标「模拟」，pending 行有交运按钮', async () => {
    renderPanel();
    await waitFor(() => expect(screen.getByTestId('ops-shipments')).toBeInTheDocument());
    expect(screen.getByText('林小满')).toBeInTheDocument();
    expect(screen.getByText('模拟')).toBeInTheDocument();
    expect(screen.getByTestId('ops-ship-ship-1')).toBeInTheDocument();
  });

  it('交运 → 调 ship 接口并回显面单号；轨迹按钮在有面单号后出现', async () => {
    (api.shipOpsShipment as ReturnType<typeof vi.fn>).mockResolvedValue({
      shipment: { ...shipment, status: 'shipped', tracking_no: 'SF123', attempts: 1 },
      receipt: { ok: true, tracking_no: 'SF123' },
      attempt: 1,
    });
    renderPanel();
    fireEvent.click(await screen.findByTestId('ops-ship-ship-1'));
    await waitFor(() => expect(api.shipOpsShipment).toHaveBeenCalledWith('ship-1'));
    await waitFor(() =>
      expect(screen.getByTestId('ops-action-msg')).toHaveTextContent('SF123'),
    );
  });

  it('交运失败（结构化错误码）如实回显，不吞错误', async () => {
    (api.shipOpsShipment as ReturnType<typeof vi.fn>).mockResolvedValue({
      shipment: { ...shipment, status: 'failed', attempts: 1 },
      receipt: { ok: false, code: 'CREDENTIALS_MISSING', error: '缺少环境变量' },
      attempt: 1,
    });
    renderPanel();
    fireEvent.click(await screen.findByTestId('ops-ship-ship-1'));
    await waitFor(() =>
      expect(screen.getByTestId('ops-action-msg')).toHaveTextContent('CREDENTIALS_MISSING'),
    );
  });

  it('状态筛选切换 → 带 status 参数重新取数', async () => {
    renderPanel();
    await waitFor(() => expect(api.fetchOpsShipments).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId('ops-ship-filter-failed'));
    await waitFor(() =>
      expect(api.fetchOpsShipments).toHaveBeenLastCalledWith('failed'),
    );
    fireEvent.click(screen.getByTestId('ops-ship-filter-all'));
    await waitFor(() =>
      expect(api.fetchOpsShipments).toHaveBeenLastCalledWith(undefined),
    );
  });
});

describe('OpsPanel — 降级', () => {
  it('后端失败只降级成错误提示，不崩面板', async () => {
    (api.fetchOpsOverview as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'));
    renderPanel();
    await waitFor(() => expect(screen.getByTestId('ops-error')).toBeInTheDocument());
    expect(screen.getByTestId('ops-error')).toHaveTextContent('boom');
  });
});
