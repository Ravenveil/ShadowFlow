/**
 * DashboardPage — 产品盈利看板（2026-11-07 重构）。
 *
 * 业务：手艺人在平台自产自销手工艺品，平台团队负责营销、联系快递员寄出。
 * 盈利 = 售价 − 成本 − 快递费（2026-11-07 二次定版：原「给手艺人」改叫
 * 「成本」，「营销分摊」整项删除；记销售时按当时价格快照进流水，后端算好
 * 口径，前端只展示）。
 *
 * 页面只回答三个问题：赚了多少、钱花在哪儿、随手记一笔。
 * 旧版 AI 用量统计（token/调用/成本/run）与商家明细面板（MerchantBoardPanel）
 * 已从页面移除；代码保留在 src/api/dashboard.ts 与 MerchantBoardPanel.tsx。
 *
 * 金额一律整数分存储；表单输入用「元」，换算只发生在提交/展示两头。
 * 双形态：路由 /dashboard 全页；NeoApp 中栏 <DashboardPage embedded />。
 *
 * 数据源：src/api/craftProfit.ts → GET/POST /api/craft-profit/*（Node）。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useI18n } from '../common/i18n';
import OpsPanel from './OpsPanel';
import {
  fetchCraftOverview,
  fetchCraftTimeseries,
  fetchCraftProducts,
  fetchCraftSales,
  createCraftProduct,
  createCraftSale,
  seedCraftDemo,
  fetchAgentEvents,
  fetchAgentStatus,
  runAgentRound,
  setAgentAuto,
  type CraftOverview,
  type CraftDayPoint,
  type CraftProductRow,
  type CraftSale,
  type CraftAgentEvent,
  type CraftAgentStatus,
} from '../api/craftProfit';
import './dashboard-neo.css';

const DAY_WINDOWS = [7, 30, 90] as const;
type DayWindow = (typeof DAY_WINDOWS)[number];

function fmtInt(n: number): string {
  return new Intl.NumberFormat('zh-CN').format(Math.round(n));
}

/** 分 → ¥ 千分位两位小数。只在展示两头换算，存储/计算全程整数分。 */
function fmtYuan(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}¥${new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(abs / 100)}`;
}

function fmtDay(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtTime(ts: number): string {
  const d = new Date(ts);
  return `${fmtDay(ts)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 轻量 SVG 每日盈利柱状图（自绘，无依赖）：赚钱红柱、亏钱绿柱。 */
function ProfitBars({ series }: { series: CraftDayPoint[] }) {
  const W = 640;
  const H = 150;
  const PAD = 8;
  const values = series.map((d) => d.profit_cents);
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const y0 = H - PAD - ((0 - min) / span) * (H - PAD * 2);
  const step = series.length > 0 ? (W - PAD * 2) / series.length : 0;
  const barW = Math.max(2, Math.min(28, step * 0.55));
  return (
    <svg
      className="neo-db-chart-svg"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="daily profit chart"
      data-testid="cp-bars"
    >
      <line className="neo-dash-bar-zero" x1={PAD} y1={y0} x2={W - PAD} y2={y0} />
      {series.map((d, i) => {
        const x = PAD + i * step + (step - barW) / 2;
        const v = d.profit_cents;
        const h = Math.abs(v / span) * (H - PAD * 2);
        const y = v >= 0 ? y0 - h : y0;
        return (
          <rect
            key={d.day}
            className={v >= 0 ? 'neo-dash-bar up' : 'neo-dash-bar down'}
            x={x}
            y={y}
            width={barW}
            height={Math.max(v === 0 ? 0 : 1.5, h)}
          >
            <title>{`${fmtDay(d.day)} ${fmtYuan(v)}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

type LoadStatus = 'idle' | 'loading' | 'success' | 'error';

/** 累计盈利曲线（SVG 自绘）：从窗口起点累计净利，赚钱就上扬。 */
function ProfitCurve({ series }: { series: CraftDayPoint[] }) {
  const W = 640;
  const H = 150;
  const PAD = 8;
  let acc = 0;
  const values = series.map((d) => (acc += d.profit_cents));
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const step = series.length > 1 ? (W - PAD * 2) / (series.length - 1) : 0;
  const pt = (v: number, i: number): [number, number] => [
    PAD + i * step,
    H - PAD - ((v - min) / span) * (H - PAD * 2),
  ];
  const points = values.map((v, i) => pt(v, i));
  const path = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area =
    points.length > 1
      ? `${path} L${points[points.length - 1][0].toFixed(1)},${H - PAD} L${points[0][0].toFixed(1)},${H - PAD} Z`
      : '';
  const last = points[points.length - 1];
  return (
    <svg
      className="neo-db-chart-svg"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="cumulative profit curve"
      data-testid="cp-curve"
    >
      {area && <path className="neo-dash-curve-area" d={area} />}
      {points.length > 1 && <path className="neo-dash-curve-line" d={path} />}
      {last && <circle className="neo-dash-curve-dot" cx={last[0]} cy={last[1]} r={3} />}
    </svg>
  );
}

interface ProductFormState {
  name: string;
  price: string;
  cost: string;
  shipping: string;
}

const EMPTY_PRODUCT_FORM: ProductFormState = { name: '', price: '', cost: '', shipping: '' };

export default function DashboardPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { t, language } = useI18n();
  const L = (zh: string, en: string) => (language === 'zh' ? zh : en);

  const [days, setDays] = useState<DayWindow>(30);
  const [overview, setOverview] = useState<CraftOverview | null>(null);
  const [series, setSeries] = useState<CraftDayPoint[]>([]);
  const [products, setProducts] = useState<CraftProductRow[]>([]);
  const [sales, setSales] = useState<CraftSale[]>([]);
  const [status, setStatus] = useState<LoadStatus>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const [productForm, setProductForm] = useState<ProductFormState>(EMPTY_PRODUCT_FORM);
  const [saleProductId, setSaleProductId] = useState('');
  const [saleQty, setSaleQty] = useState('1');
  const [formError, setFormError] = useState('');
  const [formBusy, setFormBusy] = useState(false);
  const [agentStatus, setAgentStatus] = useState<CraftAgentStatus | null>(null);
  const [agentEvents, setAgentEvents] = useState<CraftAgentEvent[]>([]);

  const refresh = useCallback(async () => {
    setStatus('loading');
    setErrorMsg('');
    try {
      const [ov, ts, pr, sa] = await Promise.all([
        fetchCraftOverview(days),
        fetchCraftTimeseries(days),
        fetchCraftProducts(days),
        fetchCraftSales(20),
      ]);
      setOverview(ov);
      setSeries(ts.series);
      setProducts(pr.items);
      setSales(sa.items);
      setStatus('success');
    } catch (err) {
      setStatus('error');
      setErrorMsg(
        t('cp.loadFailed', {
          defaultValue:
            language === 'zh'
              ? `看板加载失败：${err instanceof Error ? err.message : String(err)}`
              : `Failed to load dashboard: ${err instanceof Error ? err.message : String(err)}`,
        }),
      );
    }
    // 智能体运营面板单独降级：接口缺失/失败不拖垮主看板。
    try {
      const [st, evs] = await Promise.all([fetchAgentStatus(), fetchAgentEvents(8)]);
      setAgentStatus(st);
      setAgentEvents(evs.items);
    } catch {
      setAgentStatus(null);
      setAgentEvents([]);
    }
  }, [days, t, language]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /** 元字符串 → 整数分；非法输入返回 null。 */
  const toCents = (s: string): number | null => {
    const n = Number.parseFloat(s);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.round(n * 100);
  };

  /** 每件盈利实时预览（只算当前表单，不落库）。 */
  const profitPreview = useMemo(() => {
    const price = Number.parseFloat(productForm.price);
    const cost =
      (Number.parseFloat(productForm.cost) || 0) +
      (Number.parseFloat(productForm.shipping) || 0);
    if (!Number.isFinite(price)) return null;
    return Math.round((price - cost) * 100);
  }, [productForm]);

  const handleCreateProduct = async () => {
    const price = toCents(productForm.price);
    const cost = toCents(productForm.cost || '0');
    const shipping = toCents(productForm.shipping || '0');
    if (!productForm.name.trim()) {
      setFormError(L('请先写商品名称', 'Please enter the product name'));
      return;
    }
    if (price === null || price <= 0 || cost === null || shipping === null) {
      setFormError(L('金额填「元」，写 0 或正数就行', 'Amounts are in yuan — use 0 or a positive number'));
      return;
    }
    setFormBusy(true);
    setFormError('');
    try {
      await createCraftProduct({
        name: productForm.name.trim(),
        price_cents: price,
        cost_cents: cost,
        shipping_cents: shipping,
      });
      setProductForm(EMPTY_PRODUCT_FORM);
      await refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setFormBusy(false);
    }
  };

  const handleCreateSale = async () => {
    const qty = Number.parseInt(saleQty, 10);
    if (!saleProductId) {
      setFormError(L('先选一个商品', 'Pick a product first'));
      return;
    }
    if (!Number.isInteger(qty) || qty < 1 || qty > 999) {
      setFormError(L('件数填 1 到 999 的整数', 'Quantity must be an integer from 1 to 999'));
      return;
    }
    setFormBusy(true);
    setFormError('');
    try {
      await createCraftSale(saleProductId, qty);
      await refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setFormBusy(false);
    }
  };

  const handleSeedDemo = async () => {
    setFormBusy(true);
    setFormError('');
    try {
      await seedCraftDemo();
      await refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setFormBusy(false);
    }
  };

  /** 让智能体跑一轮：营销 → 出单记账 → 联系快递员寄出。 */
  const handleRunRound = async () => {
    setFormBusy(true);
    setFormError('');
    try {
      await runAgentRound();
      await refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setFormBusy(false);
    }
  };

  /** 自动运营开关：开着时服务端到点自己跑，看板自动更新。 */
  const handleToggleAuto = async () => {
    setFormBusy(true);
    setFormError('');
    try {
      await setAgentAuto(!(agentStatus?.enabled ?? false), agentStatus?.interval_min ?? 30);
      await refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setFormBusy(false);
    }
  };

  /** 环比：本期为 0 → 「—」；上期为 0 → 「新增」；无变化 → 「持平」；否则 ±%。 */
  const fmtDelta = (pct: number | null, value: number): string => {
    if (value === 0) return '—';
    if (pct === null) return L('新增', 'New');
    if (pct === 0) return L('持平', 'Flat');
    const sign = pct > 0 ? '+' : '';
    return `${sign}${pct}%`;
  };

  return (
    <div className={`neo-db neo-cp${embedded ? ' embedded' : ''}`} data-testid="dashboard-page">
      <div className="neo-db-header">
        <div>
          <p className="neo-db-eyebrow">CRAFT PROFIT</p>
          <h1 className="neo-db-title">{L('产品盈利', 'Product Profit')}</h1>
        </div>
        <button
          type="button"
          className="neo-db-refresh"
          onClick={refresh}
          disabled={status === 'loading'}
          data-testid="db-refresh"
        >
          {status === 'loading' ? L('加载中…', 'Loading…') : L('刷新', 'Refresh')}
        </button>
      </div>

      <div className="neo-db-tabs" role="tablist" aria-label={L('统计窗口', 'Window')}>
        {DAY_WINDOWS.map((d) => (
          <button
            key={d}
            type="button"
            role="tab"
            className={`neo-db-tab${days === d ? ' on' : ''}`}
            aria-selected={days === d}
            onClick={() => setDays(d)}
            data-testid={`db-days-${d}`}
          >
            {L(`近 ${d} 天`, `${d}d`)}
          </button>
        ))}
      </div>

      {status === 'error' && (
        <p className="neo-db-status neo-db-status--error" role="alert" data-testid="db-error">
          {errorMsg}
        </p>
      )}

      {overview && (
        <div className="neo-dash-hero-cards" data-testid="cp-overview-cards">
          <div className="neo-db-card neo-dash-card--hero">
            <p className="neo-db-card-label">{L('赚了（净利）', 'Profit (net)')}</p>
            <div
              className={`neo-dash-hero-value${
                overview.profit_cents > 0 ? '' : overview.profit_cents < 0 ? ' neg' : ' zero'
              }`}
            >
              {fmtYuan(overview.profit_cents)}
            </div>
            <p className="neo-db-card-delta">{fmtDelta(overview.delta_pct.profit, overview.profit_cents)}</p>
            <p className="neo-db-card-hint">
              {L('利润率', 'Margin')} {overview.margin_pct === null ? '—' : `${overview.margin_pct}%`}
            </p>
          </div>
          <div className="neo-db-card">
            <p className="neo-db-card-label">{L('卖了多少钱', 'Revenue')}</p>
            <div className="neo-db-card-value">{fmtYuan(overview.revenue_cents)}</div>
            <p className="neo-db-card-delta">{fmtDelta(overview.delta_pct.revenue, overview.revenue_cents)}</p>
          </div>
          <div className="neo-db-card">
            <p className="neo-db-card-label">{L('成本', 'Cost')}</p>
            <div className="neo-db-card-value">{fmtYuan(overview.cost_cents)}</div>
            <p className="neo-db-card-hint">{L('材料 + 制作', 'Materials + making')}</p>
          </div>
          <div className="neo-db-card">
            <p className="neo-db-card-label">{L('快递费', 'Shipping')}</p>
            <div className="neo-db-card-value">{fmtYuan(overview.shipping_cents)}</div>
          </div>
          <div className="neo-db-card">
            <p className="neo-db-card-label">{L('卖出件数', 'Units sold')}</p>
            <div className="neo-db-card-value">{fmtInt(overview.units)}</div>
            <p className="neo-db-card-delta">{fmtDelta(overview.delta_pct.units, overview.units)}</p>
            <p className="neo-db-card-hint">
              {fmtInt(overview.sales_count)} {L('笔生意', 'orders')}
            </p>
          </div>
        </div>
      )}

      {overview && (
        <div className="neo-dash-grid2">
          <section className="neo-db-section">
            <div className="neo-db-panel">
              <div className="neo-dash-panel-head">
                <h2 className="neo-dash-panel-title">{L('每卖 100 元，钱花在哪儿', 'Where every ¥100 goes')}</h2>
                <span className="neo-dash-panel-note">{L(`近 ${days} 天`, `Last ${days}d`)}</span>
              </div>
              {overview.revenue_cents > 0 ? (
                <div className="neo-dash-per100" data-testid="cp-per100">
                  <div className="neo-dash-per100-track">
                    <span
                      className="neo-dash-seg seg-cost"
                      style={{ width: `${overview.per100.cost}%` }}
                      title={`${L('成本', 'Cost')} ${overview.per100.cost}%`}
                    />
                    <span
                      className="neo-dash-seg seg-shipping"
                      style={{ width: `${overview.per100.shipping}%` }}
                      title={`${L('快递', 'Shipping')} ${overview.per100.shipping}%`}
                    />
                    <span
                      className="neo-dash-seg seg-profit"
                      style={{ width: `${overview.per100.profit}%` }}
                      title={`${L('净赚', 'Profit')} ${overview.per100.profit}%`}
                    />
                  </div>
                  <div className="neo-dash-per100-legend">
                    <span><i className="neo-dash-dot seg-cost" />{L('成本', 'Cost')} {overview.per100.cost}%</span>
                    <span><i className="neo-dash-dot seg-shipping" />{L('快递', 'Shipping')} {overview.per100.shipping}%</span>
                    <span><i className="neo-dash-dot seg-profit" />{L('净赚', 'Profit')} {overview.per100.profit}%</span>
                  </div>
                </div>
              ) : (
                <div className="neo-dash-per100" data-testid="cp-per100">
                  <div className="neo-dash-per100-track empty" />
                  <p className="neo-dash-empty-inline">
                    {L('还没生意。卖了第一单，这里就显示钱花在哪儿。', 'No sales yet — the first order fills this bar.')}
                  </p>
                </div>
              )}
            </div>
          </section>

          <section className="neo-db-section">
            <div className="neo-db-panel">
              <div className="neo-dash-panel-head">
                <h2 className="neo-dash-panel-title">{L('每天赚多少', 'Profit by day')}</h2>
                <span className="neo-dash-panel-note">
                  <i className="neo-dash-dot seg-profit" /> {L('赚', 'Profit')}
                  <i className="neo-dash-dot seg-neg" style={{ marginLeft: 10 }} /> {L('亏', 'Loss')}
                </span>
              </div>
              {series.some((d) => d.profit_cents !== 0) ? (
                <ProfitBars series={series} />
              ) : (
                <div className="neo-dash-empty-chart" data-testid="cp-bars-empty">
                  <p>{L('窗口内还没生意', 'No sales in this window')}</p>
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      <div className="neo-dash-grid2">
        <section className="neo-db-section">
          <div className="neo-db-panel">
            <div className="neo-dash-panel-head">
              <h2 className="neo-dash-panel-title">{L('盈利曲线', 'Profit curve')}</h2>
              <span className="neo-dash-panel-note">
                {L('累计净利', 'Cumulative')} {series.length > 0 ? fmtYuan(series.reduce((a, d) => a + d.profit_cents, 0)) : '—'}
              </span>
            </div>
            {series.some((d) => d.profit_cents !== 0) ? (
              <ProfitCurve series={series} />
            ) : (
              <div className="neo-dash-empty-chart" data-testid="cp-curve-empty">
                <p>{L('还没生意，卖了第一单曲线就往上走。', 'No sales yet — the first order starts the curve.')}</p>
              </div>
            )}
          </div>
        </section>

        <section className="neo-db-section">
          <div className="neo-db-panel" data-testid="cp-agent-panel">
            <div className="neo-dash-panel-head">
              <h2 className="neo-dash-panel-title">{L('智能体运营', 'Agent operations')}</h2>
              <span className="neo-dash-panel-note">
                <i className={`neo-dash-dot ${agentStatus?.enabled ? 'seg-profit' : 'seg-off'}`} />
                {agentStatus?.enabled
                  ? L(`自动运营中 · 每 ${agentStatus.interval_min} 分钟`, `Auto · every ${agentStatus.interval_min}m`)
                  : L('手动模式', 'Manual')}
                {agentStatus ? ` · ${L(`已跑 ${agentStatus.rounds} 轮`, `${agentStatus.rounds} rounds`)}` : ''}
              </span>
            </div>
            <div className="neo-dash-agent-row">
              <button
                type="button"
                className="neo-dash-submit neo-dash-submit--inline"
                onClick={handleRunRound}
                disabled={formBusy}
                data-testid="cp-agent-run"
              >
                {L('让智能体跑一轮', 'Run one round')}
              </button>
              <button
                type="button"
                className="neo-db-refresh"
                onClick={handleToggleAuto}
                disabled={formBusy || !agentStatus}
                data-testid="cp-agent-auto"
              >
                {agentStatus?.enabled ? L('暂停自动运营', 'Pause auto') : L('开启自动运营', 'Enable auto')}
              </button>
              <span className="neo-dash-demo-hint">
                {L('智能体自动营销、出单记账、联系快递员寄出', 'The agent markets, records sales & arranges shipping')}
              </span>
            </div>
            <ul className="neo-dash-agent-feed" data-testid="cp-agent-feed">
              {agentEvents.length === 0 ? (
                <li className="neo-dash-empty">
                  {L('还没有运营动态。点「让智能体跑一轮」试试。', 'No activity yet — run one round to see it work.')}
                </li>
              ) : (
                agentEvents.map((ev) => (
                  <li key={ev.id}>
                    <i className={`neo-dash-dot kind-${ev.kind}`} />
                    <span className="neo-dash-feed-ts">{fmtTime(ev.ts)}</span>
                    {ev.text}
                  </li>
                ))
              )}
            </ul>
          </div>
        </section>
      </div>

      <div className="neo-dash-grid2">
        <section className="neo-db-section">
          <div className="neo-db-panel">
            <div className="neo-dash-panel-head">
              <h2 className="neo-dash-panel-title">{L('哪个商品最赚钱', 'Best-selling products')}</h2>
              <span className="neo-dash-panel-note">{L(`近 ${days} 天`, `Last ${days}d`)}</span>
            </div>
            {products.length === 0 ? (
              <p className="neo-dash-empty">
                {L('还没上架商品。下面「记一笔」就能上架。', 'No products yet — add one in the entry section below.')}
              </p>
            ) : (
              <table className="neo-db-table" data-testid="cp-products-table">
                <thead>
                  <tr>
                    <th>{L('商品', 'Product')}</th>
                    <th className="neo-db-table-num">{L('卖出', 'Sold')}</th>
                    <th className="neo-db-table-num">{L('卖了多少钱', 'Revenue')}</th>
                    <th className="neo-db-table-num">{L('赚了', 'Profit')}</th>
                    <th className="neo-db-table-num">{L('每件赚', 'Per unit')}</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => (
                    <tr key={p.id}>
                      <td>{p.name}</td>
                      <td className="neo-db-table-num">{fmtInt(p.sold_units)}</td>
                      <td className="neo-db-table-num">{fmtYuan(p.revenue_cents)}</td>
                      <td className="neo-db-table-num">{fmtYuan(p.profit_cents)}</td>
                      <td className="neo-db-table-num">{fmtYuan(p.profit_per_unit_cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        <section className="neo-db-section">
          <div className="neo-db-panel">
            <div className="neo-dash-panel-head">
              <h2 className="neo-dash-panel-title">{L('最近的生意', 'Recent sales')}</h2>
              <span className="neo-dash-panel-note">{L('最新 20 笔', 'Last 20')}</span>
            </div>
            {sales.length === 0 ? (
              <p className="neo-dash-empty">{L('还没记过销售。', 'No sales recorded yet.')}</p>
            ) : (
              <table className="neo-db-table" data-testid="cp-sales-table">
                <thead>
                  <tr>
                    <th>{L('时间', 'Time')}</th>
                    <th>{L('商品', 'Product')}</th>
                    <th className="neo-db-table-num">{L('件数', 'Qty')}</th>
                    <th className="neo-db-table-num">{L('卖了', 'Revenue')}</th>
                    <th className="neo-db-table-num">{L('赚了', 'Profit')}</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map((s) => (
                    <tr key={s.id}>
                      <td>{fmtTime(s.created_at)}</td>
                      <td>{s.product_name}</td>
                      <td className="neo-db-table-num">{fmtInt(s.qty)}</td>
                      <td className="neo-db-table-num">{fmtYuan(s.price_cents * s.qty)}</td>
                      <td className="neo-db-table-num">{fmtYuan(s.profit_cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>

      {/* ── 录入区：上架商品 / 记一笔销售 / 演示数据 ───────────────────── */}
      <section className="neo-db-section">
        <div className="neo-dash-panel-head">
          <h2 className="neo-dash-panel-title">{L('记一笔', 'Record')}</h2>
          <span className="neo-dash-panel-note">{L('上架商品 / 记一笔销售', 'List a product / Record a sale')}</span>
        </div>
        <div className="neo-dash-form-grid">
          <form
            className="neo-db-panel neo-dash-form"
            data-testid="cp-product-form"
            onSubmit={(e) => {
              e.preventDefault();
              handleCreateProduct();
            }}
          >
            <p className="neo-dash-form-title">{L('上架商品', 'List a product')}</p>
            <label className="neo-dash-field">
              <span>{L('商品名称', 'Name')}</span>
              <input
                value={productForm.name}
                onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                placeholder={L('例：手工编织收纳篮', 'e.g. Woven storage basket')}
              />
            </label>
            <div className="neo-dash-field-row">
              <label className="neo-dash-field">
                <span>{L('售价（元）', 'Price (yuan)')}</span>
                <input
                  inputMode="decimal"
                  value={productForm.price}
                  onChange={(e) => setProductForm({ ...productForm, price: e.target.value })}
                  placeholder="89"
                />
              </label>
              <label className="neo-dash-field">
                <span>{L('成本（元）', 'Cost (yuan)')}</span>
                <input
                  inputMode="decimal"
                  value={productForm.cost}
                  onChange={(e) => setProductForm({ ...productForm, cost: e.target.value })}
                  placeholder="42"
                />
              </label>
            </div>
            <div className="neo-dash-field-row">
              <label className="neo-dash-field">
                <span>{L('快递费（元）', 'Shipping (yuan)')}</span>
                <input
                  inputMode="decimal"
                  value={productForm.shipping}
                  onChange={(e) => setProductForm({ ...productForm, shipping: e.target.value })}
                  placeholder="8"
                />
              </label>
            </div>
            <p className="neo-dash-preview" data-testid="cp-profit-preview">
              {profitPreview === null ? (
                L('填好售价就能算每件赚多少', 'Fill in the price to see profit per unit')
              ) : profitPreview < 0 ? (
                <span className="neg">{L(`这样卖每件亏 ${fmtYuan(-profitPreview)}`, `Each sale loses ${fmtYuan(-profitPreview)}`)}</span>
              ) : (
                L(`每件赚 ${fmtYuan(profitPreview)}`, `Earn ${fmtYuan(profitPreview)} per unit`)
              )}
            </p>
            <button type="submit" className="neo-dash-submit" disabled={formBusy} data-testid="cp-product-submit">
              {L('上架', 'List product')}
            </button>
          </form>

          <form
            className="neo-db-panel neo-dash-form"
            data-testid="cp-sale-form"
            onSubmit={(e) => {
              e.preventDefault();
              handleCreateSale();
            }}
          >
            <p className="neo-dash-form-title">{L('记一笔销售', 'Record a sale')}</p>
            <label className="neo-dash-field">
              <span>{L('商品', 'Product')}</span>
              <select
                value={saleProductId}
                onChange={(e) => setSaleProductId(e.target.value)}
                data-testid="cp-sale-product"
              >
                <option value="">{L('选一个商品…', 'Pick a product…')}</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}（{fmtYuan(p.price_cents)}）
                  </option>
                ))}
              </select>
            </label>
            <label className="neo-dash-field">
              <span>{L('件数', 'Quantity')}</span>
              <input
                inputMode="numeric"
                value={saleQty}
                onChange={(e) => setSaleQty(e.target.value)}
                data-testid="cp-sale-qty"
              />
            </label>
            <p className="neo-dash-preview">
              {L('按上架价记账，之后改价不影响这笔。', 'Priced at listing; later edits never rewrite history.')}
            </p>
            <button type="submit" className="neo-dash-submit" disabled={formBusy} data-testid="cp-sale-submit">
              {L('记一笔', 'Record sale')}
            </button>
          </form>
        </div>

        {formError && (
          <p className="neo-db-status neo-db-status--error" role="alert" data-testid="cp-form-error">
            {formError}
          </p>
        )}

        <div className="neo-dash-demo-row">
          <button
            type="button"
            className="neo-db-refresh"
            onClick={handleSeedDemo}
            disabled={formBusy}
            data-testid="cp-demo-seed"
          >
            {L('填一批手工艺品演示数据', 'Load demo craft data')}
          </button>
          <span className="neo-dash-demo-hint">
            {L('8 件手工艺品 + 近 30 天的销售，方便先看效果。', '8 handmade products + ~30 days of sales to try it out.')}
          </span>
        </div>
      </section>

      {/* 代运营看板（main #51）：四步进度 + 一键分发 + 运单履约，数据走 /api/ops
          （overview 直出）。失败只降级，不拖垮整页。
          注：商家明细面板（MerchantBoardPanel）按本页重构决策不挂页（2026-11-07
          重构，代码保留在 MerchantBoardPanel.tsx），故此处只接 OpsPanel。 */}
      <OpsPanel />
    </div>
  );
}
