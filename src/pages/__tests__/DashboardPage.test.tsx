/**
 * DashboardPage.test.tsx — 产品盈利看板页测试（2026-11-07 重构）。
 * 覆盖：五张大卡与分项口径渲染、每卖 100 元去向条、每日盈利柱状图、
 * 商品/销售两表、窗口切换、空数据态、上架/记销售/演示数据三个写入口、加载失败态。
 *
 * mock ../../api/craftProfit（页面只做展示与录入，口径在后端）。
 */
import { render, screen, fireEvent, waitFor, within } from '../../test/utils';
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../api/craftProfit', () => ({
  fetchCraftOverview: vi.fn(),
  fetchCraftTimeseries: vi.fn(),
  fetchCraftProducts: vi.fn(),
  fetchCraftSales: vi.fn(),
  createCraftProduct: vi.fn(),
  createCraftSale: vi.fn(),
  seedCraftDemo: vi.fn(),
}));

import DashboardPage from '../../pages/DashboardPage';
import {
  fetchCraftOverview,
  fetchCraftTimeseries,
  fetchCraftProducts,
  fetchCraftSales,
  createCraftProduct,
  createCraftSale,
  seedCraftDemo,
} from '../../api/craftProfit';

const OVERVIEW = {
  days: 30,
  window: { from: 0, to: 1 },
  sales_count: 4,
  units: 10,
  revenue_cents: 8900,
  artisan_cents: 4200,
  shipping_cents: 800,
  marketing_cents: 600,
  cost_cents: 5600,
  profit_cents: 3300,
  margin_pct: 37.1,
  per100: { artisan: 47.2, shipping: 9, marketing: 6.7, profit: 37.1 },
  delta_pct: { profit: null, revenue: 12.5, units: -3 },
};

const SERIES = {
  days: 30,
  series: [
    { day: 1730000000000, units: 1, revenue_cents: 1000, profit_cents: 1000 },
    { day: 1730086400000, units: 0, revenue_cents: 0, profit_cents: -500 },
    { day: 1730172800000, units: 2, revenue_cents: 3000, profit_cents: 2000 },
  ],
};

const PRODUCTS = {
  items: [
    {
      id: 'p1',
      name: '手工编织收纳篮',
      price_cents: 8900,
      artisan_cents: 4200,
      shipping_cents: 800,
      marketing_cents: 600,
      profit_per_unit_cents: 3300,
      created_at: 1730000000000,
      sold_units: 5,
      revenue_cents: 44500,
      profit_cents: 16500,
    },
  ],
};

const SALES = {
  items: [
    {
      id: 's1',
      product_id: 'p1',
      product_name: '手工编织收纳篮',
      qty: 2,
      price_cents: 8900,
      artisan_cents: 4200,
      shipping_cents: 800,
      marketing_cents: 600,
      profit_cents: 6600,
      created_at: 1730172800000,
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchCraftOverview).mockResolvedValue(OVERVIEW);
  vi.mocked(fetchCraftTimeseries).mockResolvedValue(SERIES);
  vi.mocked(fetchCraftProducts).mockResolvedValue(PRODUCTS);
  vi.mocked(fetchCraftSales).mockResolvedValue(SALES);
  vi.mocked(createCraftProduct).mockResolvedValue(PRODUCTS.items[0]);
  vi.mocked(createCraftSale).mockResolvedValue(SALES.items[0]);
  vi.mocked(seedCraftDemo).mockResolvedValue({ seeded: true, products: 8, sales: 40 });
});

describe('DashboardPage — 产品盈利看板（2026-11-07 重构）', () => {
  it('渲染五张大卡：赚了/卖了多少钱/给手艺人/快递+营销/卖出件数', async () => {
    render(<DashboardPage />);
    const cards = await screen.findByTestId('cp-overview-cards');
    // 赚了 ¥33.00（净利 3300 分）+ 环比「新增」（上期为 0）
    expect(within(cards).getByText('¥33.00')).toBeInTheDocument();
    expect(within(cards).getByText('新增')).toBeInTheDocument();
    expect(within(cards).getByText('¥89.00')).toBeInTheDocument(); // 卖了多少钱
    expect(within(cards).getByText('¥42.00')).toBeInTheDocument(); // 给手艺人
    expect(within(cards).getByText('¥14.00')).toBeInTheDocument(); // 快递 8 + 营销 6
    expect(within(cards).getByText('10')).toBeInTheDocument(); // 卖出件数
  });

  it('每卖 100 元去向条：四个分段百分比', async () => {
    render(<DashboardPage />);
    expect(await screen.findByTestId('cp-per100')).toBeInTheDocument();
    expect(screen.getByText(/给手艺人 47\.2%/)).toBeInTheDocument();
    expect(screen.getByText(/快递 9%/)).toBeInTheDocument();
    expect(screen.getByText(/营销 6\.7%/)).toBeInTheDocument();
    expect(screen.getByText(/净赚 37\.1%/)).toBeInTheDocument();
  });

  it('每天赚多少柱状图 + 商品排行 + 最近的生意', async () => {
    render(<DashboardPage />);
    expect(await screen.findByTestId('cp-bars')).toBeInTheDocument();
    const productTable = await screen.findByTestId('cp-products-table');
    expect(within(productTable).getByText('手工编织收纳篮')).toBeInTheDocument();
    expect(within(productTable).getByText('¥165.00')).toBeInTheDocument(); // 商品总盈利
    const salesTable = await screen.findByTestId('cp-sales-table');
    expect(within(salesTable).getByText('手工编织收纳篮')).toBeInTheDocument();
    expect(within(salesTable).getByText('¥178.00')).toBeInTheDocument(); // 2 件 × ¥89
    expect(within(salesTable).getByText('¥66.00')).toBeInTheDocument(); // 2 件 × 每件赚 ¥33
  });

  it('窗口 tab 切换（7/30/90 天）触发重新拉取', async () => {
    render(<DashboardPage />);
    await screen.findByTestId('cp-overview-cards');
    vi.mocked(fetchCraftOverview).mockClear();
    fireEvent.click(screen.getByTestId('db-days-7'));
    await waitFor(() => {
      expect(screen.getByTestId('db-days-7')).toHaveAttribute('aria-selected', 'true');
    });
    await waitFor(() => {
      expect(vi.mocked(fetchCraftOverview)).toHaveBeenCalledWith(7);
    });
  });

  it('上架商品表单：每件盈利实时预览 + 提交金额换算成分', async () => {
    render(<DashboardPage />);
    await screen.findByTestId('cp-product-form');
    fireEvent.change(screen.getByPlaceholderText('例：手工编织收纳篮'), {
      target: { value: '手工编织收纳篮' },
    });
    fireEvent.change(screen.getByPlaceholderText('89'), { target: { value: '89' } });
    fireEvent.change(screen.getByPlaceholderText('42'), { target: { value: '42' } });
    fireEvent.change(screen.getByPlaceholderText('8'), { target: { value: '8' } });
    fireEvent.change(screen.getByPlaceholderText('6'), { target: { value: '6' } });
    expect(screen.getByTestId('cp-profit-preview')).toHaveTextContent('每件赚 ¥33.00');
    fireEvent.click(screen.getByTestId('cp-product-submit'));
    await waitFor(() => {
      expect(createCraftProduct).toHaveBeenCalledWith({
        name: '手工编织收纳篮',
        price_cents: 8900,
        artisan_cents: 4200,
        shipping_cents: 800,
        marketing_cents: 600,
      });
    });
  });

  it('上架表单校验：不写名称 / 售价非法时给出错误提示且不发请求', async () => {
    render(<DashboardPage />);
    await screen.findByTestId('cp-product-form');
    fireEvent.click(screen.getByTestId('cp-product-submit'));
    expect(await screen.findByTestId('cp-form-error')).toHaveTextContent('请先写商品名称');
    expect(createCraftProduct).not.toHaveBeenCalled();
  });

  it('记一笔销售：选商品 + 件数提交；缺商品时拦截', async () => {
    render(<DashboardPage />);
    await screen.findByTestId('cp-sale-form');
    fireEvent.click(screen.getByTestId('cp-sale-submit'));
    expect(await screen.findByTestId('cp-form-error')).toHaveTextContent('先选一个商品');
    expect(createCraftSale).not.toHaveBeenCalled();
    fireEvent.change(screen.getByTestId('cp-sale-product'), { target: { value: 'p1' } });
    fireEvent.change(screen.getByTestId('cp-sale-qty'), { target: { value: '2' } });
    fireEvent.click(screen.getByTestId('cp-sale-submit'));
    await waitFor(() => {
      expect(createCraftSale).toHaveBeenCalledWith('p1', 2);
    });
  });

  it('演示数据按钮：调用 demo-seed 并刷新', async () => {
    render(<DashboardPage />);
    await screen.findByTestId('cp-demo-seed');
    fireEvent.click(screen.getByTestId('cp-demo-seed'));
    await waitFor(() => {
      expect(seedCraftDemo).toHaveBeenCalledTimes(1);
    });
  });

  it('空数据态：没商品没销售时给大白话引导', async () => {
    vi.mocked(fetchCraftProducts).mockResolvedValue({ items: [] });
    vi.mocked(fetchCraftSales).mockResolvedValue({ items: [] });
    vi.mocked(fetchCraftTimeseries).mockResolvedValue({ days: 30, series: [] });
    render(<DashboardPage />);
    // 先等 bars 空态渲染（依赖 overview 就绪 = refresh 完成），避免拿到加载前的初始空态
    expect(await screen.findByText(/窗口内还没生意/)).toBeInTheDocument();
    expect(screen.getByText(/还没上架商品/)).toBeInTheDocument();
    expect(screen.getByText(/还没记过销售/)).toBeInTheDocument();
  });

  it('加载失败：显示错误条', async () => {
    vi.mocked(fetchCraftOverview).mockRejectedValue(new Error('boom'));
    render(<DashboardPage />);
    expect(await screen.findByTestId('db-error')).toHaveTextContent(/boom/);
  });
});
