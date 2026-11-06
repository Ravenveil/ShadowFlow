/**
 * MerchantBoardPanel — 功能线①「商家数据看板」面板（2026-11-05）。
 *
 * 沿用数据看板页的 neo-db-* 视觉体系与 i18n defaultValue 兜底，不引新依赖、
 * 不另建页面：由 DashboardPage 一行挂载，数据全部走 /api/merchant。
 * 与同页的 AI 用量看板（tokens/calls/cost）并存互不影响 —— 那边看「花了多少」，
 * 这边看「挣了多少」。
 *
 * 三块能力（对应评审要补的三个缺口）：
 *   1. 订单流水分时（15m / 小时 / 日，零值补齐）+ 营收/成本/毛利/客单价 KPI；
 *   2. 客流曲线（PV / UV / 转化率 / 分渠道）；
 *   3. 第一单五步链路（访客 → 下单 → 支付 → 入账 → 看板）+ 账实对账。
 *   4. 演示证据包：把 ①③ 的已落库留痕导成可下载的答辩材料（只读）。
 *
 * 口径全部由后端算好，这里只做展示与单位换算，不在前端重复计算。
 */
import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '../common/i18n';
import {
  downloadEvidence,
  fetchEvidence,
  fetchFirstOrderChain,
  fetchMerchantOrders,
  fetchMerchantOverview,
  fetchOrderTimeseries,
  fetchReconcile,
  fetchTrafficCurve,
  type EvidenceSummary,
  type FirstOrderChain,
  type Granularity,
  type MerchantOrderPage,
  type MerchantOrderRow,
  type MerchantOverview,
  type OrderTimeseries,
  type ReconcileResult,
  type TrafficCurve,
} from '../api/merchantBoard';
import './dashboard-neo.css';
import './merchant-board.css';

/** 分 → ¥，千分位。金额一律整数分，前端只做展示换算。 */
function fmtYuan(cents: number): string {
  const yuan = cents / 100;
  const fixed = Math.abs(yuan) >= 1000 ? yuan.toFixed(0) : yuan.toFixed(2);
  return `¥${Number(fixed).toLocaleString('zh-CN', {
    minimumFractionDigits: fixed.includes('.') ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

/** 订单时间：月-日 时:分，够看且不占宽度。 */
function fmtTime(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 订单状态机三态。created 是「已下单未支付」，对业务说人话叫「待支付」。 */
const ORDER_STATUS_LABEL: Record<MerchantOrderRow['status'], string> = {
  created: '待支付',
  paid: '已支付',
  refunded: '已退款',
};

function fmtPct(v: number | null): string {
  return v === null ? '—' : `${v}%`;
}

function bucketLabel(ts: number, g: Granularity): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  if (g === 'day') return `${d.getMonth() + 1}/${d.getDate()}`;
  if (g === 'hour') return `${hh}:00`;
  return `${hh}:${mm}`;
}

/** 看板默认看「近 7 天」：只取今天的话，多数时候图里就一根柱子，看不出趋势。
 *  小时 / 15 分钟粒度仍只看今天，避免桶数过多。 */
function windowStart(g: Granularity): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (g === 'day') d.setDate(d.getDate() - 6);
  return d.toISOString();
}

/** 订单列表一页多少条。50 条在 1280 宽下不滚太久，翻页按钮也不会太快点到底。 */
const ORDER_PAGE_SIZE = 50;

/**
 * 概览区间 → 查询参数。全量不传参（保持老口径），其余从本地零点算起。
 * 非全量才要环比：全量没有「上一等长区间」可言，传了后端也只回 null。
 * 同一份参数同时喂给概览和订单列表 —— 切到「今天」时，KPI 是今天的、
 * 下面的订单明细却还列着三个月前的单，业务一眼就会看出不对。
 */
function kpiWindow(range: 'all' | '7d' | 'today'): { start?: string; compare?: boolean } {
  if (range === 'all') return {};
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (range === '7d') d.setDate(d.getDate() - 6);
  return { start: d.toISOString(), compare: true };
}

const STEP_LABEL: Record<string, string> = {
  visit_landed: '落地页到访',
  order_created: '下单',
  order_paid: '支付成功',
  ledger_income: '记入流水',
  dashboard_visible: '看板可见',
};

/** 轻量 SVG 柱状图（自绘，无依赖）。零值桶也占位，曲线不跳轴。 */
function FlowChart({ data, granularity }: { data: OrderTimeseries; granularity: Granularity }) {
  const values = data.series.map((b) => b.amount_cents);
  const max = Math.max(...values, 1);
  const W = 640;
  const H = 140;
  const PAD = 6;
  const AXIS_H = 20; // 底部留标签位
  const plotH = H - PAD - AXIS_H;
  const n = Math.max(data.series.length, 1);
  const slot = (W - PAD * 2) / n;
  const barW = Math.max(Math.min(slot * 0.6, 26), 2);
  // 桶太多时标签会糊成一片，只标首尾。
  const labelEvery = n <= 10 ? 1 : Math.ceil(n / 6);
  return (
    <svg
      className="neo-mb-chart"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="merchant flow chart"
      data-testid="merchant-flow-chart"
    >
      <line className="neo-mb-axis" x1={PAD} y1={H - AXIS_H} x2={W - PAD} y2={H - AXIS_H} />
      {data.series.map((b, i) => {
        const h = (b.amount_cents / max) * plotH;
        const x = PAD + i * slot + (slot - barW) / 2;
        const showLabel = i % labelEvery === 0 || i === n - 1;
        return (
          <g key={b.ts}>
            <rect
              className={b.amount_cents > 0 ? 'neo-mb-bar' : 'neo-mb-bar neo-mb-bar--zero'}
              x={x}
              y={H - AXIS_H - h}
              width={barW}
              height={b.amount_cents > 0 ? Math.max(h, 2) : 0}
              rx={2}
              data-testid={`merchant-bar-${i}`}
            >
              <title>{`${bucketLabel(b.ts, granularity)} · ${fmtYuan(b.amount_cents)} · ${b.paid_orders} 单`}</title>
            </rect>
            {showLabel && (
              <text className="neo-mb-axis-label" x={x + barW / 2} y={H - 6} textAnchor="middle">
                {bucketLabel(b.ts, granularity)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** 环比变化：涨红跌绿（国内习惯）。上期为 0 时显示「新增」，不编造 ∞% 增长率。 */
function Delta({ label, value }: { label: string; value: number | null }) {
  const tone = value === null || value > 0 ? 'up' : value < 0 ? 'down' : 'flat';
  const text = value === null
    ? '新增'
    : `${value > 0 ? '↑' : value < 0 ? '↓' : '→'}${Math.abs(value)}%`;
  return (
    <span className="neo-mb-compare-item">
      {label} <span className={`neo-mb-delta neo-mb-delta--${tone}`}>{text}</span>
    </span>
  );
}

export default function MerchantBoardPanel() {
  const { t } = useI18n();
  const [granularity, setGranularity] = useState<Granularity>('day');
  const [overview, setOverview] = useState<MerchantOverview | null>(null);
  const [flow, setFlow] = useState<OrderTimeseries | null>(null);
  const [traffic, setTraffic] = useState<TrafficCurve | null>(null);
  const [chain, setChain] = useState<FirstOrderChain | null>(null);
  const [reconcile, setReconcile] = useState<ReconcileResult | null>(null);
  const [orderPage, setOrderPage] = useState<MerchantOrderPage | null>(null);
  /** 概览区间：默认全量（和以前一致），切到「近 7 天 / 今天」就只看这段 */
  const [kpiRange, setKpiRange] = useState<'all' | '7d' | 'today'>('all');
  const [loadingMore, setLoadingMore] = useState(false);
  const [orderFilter, setOrderFilter] = useState<'' | 'created' | 'paid' | 'refunded'>('');
  const [traceId, setTraceId] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [busy, setBusy] = useState(false);
  /** 演示证据包：摘要单独拉，失败只降级成卡片里一行提示，不拖垮整页看板。 */
  const [evidence, setEvidence] = useState<EvidenceSummary | null>(null);
  const [evidenceBusy, setEvidenceBusy] = useState(false);
  const [exportMsg, setExportMsg] = useState('');

  const msg = (err: unknown) => (err instanceof Error ? err.message : String(err));
  const orders = orderPage?.items ?? [];

  const refresh = useCallback(async () => {
    setBusy(true);
    setErrorMsg('');
    try {
      const win = kpiWindow(kpiRange);
      const [ov, ts, tc, rec, ch, od, ev] = await Promise.all([
        fetchMerchantOverview(win),
        fetchOrderTimeseries({ granularity, start: windowStart(granularity) }),
        fetchTrafficCurve({ granularity, start: windowStart(granularity) }),
        fetchReconcile(),
        fetchFirstOrderChain(''),
        fetchMerchantOrders({ limit: ORDER_PAGE_SIZE, status: orderFilter, start: win.start }),
        // 证据摘要单独降级：它只是附加材料，挂了不能让整页看板变空白。
        // 失败时置 null，用户可点「重新扫描留痕」单独重试并看到错误原因。
        fetchEvidence(win).catch(() => null),
      ]);
      setOverview(ov);
      setFlow(ts);
      setTraffic(tc);
      setReconcile(rec);
      setChain(ch);
      setOrderPage(od);
      setEvidence(ev);
    } catch (err) {
      // 后端未起 / 网关未挂时只降级成一条错误提示，不拖垮整页数据看板。
      setErrorMsg(
        t('neo.merchant.loadFailed', {
          defaultValue: `商家看板加载失败：${msg(err)}`,
        }),
      );
    } finally {
      setBusy(false);
    }
  }, [granularity, kpiRange, orderFilter, t]);

  /** 翻页：把新一页追加在后面，total 不变，has_more 由后端给。 */
  const loadMore = useCallback(async () => {
    if (!orderPage?.has_more || loadingMore) return;
    setLoadingMore(true);
    try {
      const next = await fetchMerchantOrders({
        limit: ORDER_PAGE_SIZE,
        offset: orderPage.items.length,
        status: orderFilter,
        start: kpiWindow(kpiRange).start,
      });
      setOrderPage({
        ...next,
        items: [...orderPage.items, ...next.items],
        offset: 0,
      });
    } catch (err) {
      setErrorMsg(`加载更多订单失败：${msg(err)}`);
    } finally {
      setLoadingMore(false);
    }
  }, [orderPage, loadingMore, orderFilter, kpiRange]);

  const loadChain = useCallback(async () => {
    try {
      setChain(await fetchFirstOrderChain(traceId.trim()));
    } catch (err) {
      setErrorMsg(`链路查询失败：${msg(err)}`);
    }
  }, [traceId]);

  /**
   * 证据摘要与导出都用 kpiWindow(kpiRange)：切到「今天」，附件里也只能是今天的单。
   * 页面一个数字、附件另一个数字，是演示现场最容易露馅的地方。
   */
  const loadEvidence = useCallback(async () => {
    setEvidenceBusy(true);
    setExportMsg('');
    try {
      setEvidence(await fetchEvidence(kpiWindow(kpiRange)));
    } catch (err) {
      setExportMsg(`证据摘要加载失败：${msg(err)}`);
    } finally {
      setEvidenceBusy(false);
    }
  }, [kpiRange]);

  const exportFile = useCallback(async (kind: 'md' | 'csv') => {
    setExportMsg('');
    try {
      await downloadEvidence(kind, kpiWindow(kpiRange));
      setExportMsg(kind === 'md' ? 'Markdown 报告已导出' : '订单 CSV 已导出');
    } catch (err) {
      setExportMsg(`导出失败：${msg(err)}`);
    }
  }, [kpiRange]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <section className="neo-db-section" data-testid="merchant-board-panel">
      <h2 className="neo-db-section-title">
        {t('neo.merchant.title', { defaultValue: '商家数据看板' })}
        {reconcile && (
          <span
            className="neo-db-lesson-chip"
            style={{ marginLeft: 10 }}
            data-testid="merchant-reconcile-chip"
          >
            {reconcile.balanced
              ? t('neo.merchant.balanced', { defaultValue: '账实一致' })
              : t('neo.merchant.unbalanced', { defaultValue: '账实有差额' })}
          </span>
        )}
      </h2>
      <p className="neo-db-sub" style={{ marginTop: -6, marginBottom: 12 }}>
        {t('neo.merchant.sub', {
          defaultValue:
            '订单流水 · 客流转化 · 第一单链路。KPI 与订单明细按所选区间（默认全部），流水与客流按所选粒度；口径由后端算好，营收已扣退款。',
        })}
      </p>

      {reconcile && !reconcile.balanced && reconcile.issues.length > 0 && (
        <ul className="neo-mb-issues" role="alert" data-testid="merchant-reconcile-issues">
          {reconcile.issues.map((issue) => <li key={issue}>{issue}</li>)}
        </ul>
      )}

      {errorMsg && (
        <p className="neo-db-status neo-db-status--error" role="alert" data-testid="merchant-error">
          {errorMsg}
        </p>
      )}

      {/* ── KPI 区间 ── */}
      <div className="neo-db-tabs" style={{ marginBottom: 10 }} role="tablist">
        {([
          ['all', t('neo.merchant.rangeAll', { defaultValue: '全部' })],
          ['7d', t('neo.merchant.range7d', { defaultValue: '近 7 天' })],
          ['today', t('neo.merchant.rangeToday', { defaultValue: '今天' })],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={`neo-db-tab${kpiRange === value ? ' on' : ''}`}
            onClick={() => setKpiRange(value)}
            data-testid={`merchant-kpi-range-${value}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── KPI ── */}
      <div className="neo-db-cards" data-testid="merchant-kpi">
        <div className="neo-db-card">
          <p className="neo-db-card-label">{t('neo.merchant.revenue', { defaultValue: '营收' })}</p>
          <div className="neo-db-card-value" data-testid="merchant-revenue">
            {overview ? fmtYuan(overview.revenue_cents) : '—'}
          </div>
          <p className="neo-db-card-hint">
            {overview
              ? t('neo.merchant.revenueHint', {
                  defaultValue: `成交 ${overview.paid_orders} 单 · 退款 ${overview.refunded_orders} 单`,
                })
              : ''}
          </p>
        </div>
        <div className="neo-db-card">
          <p className="neo-db-card-label">{t('neo.merchant.cost', { defaultValue: '成本' })}</p>
          <div className="neo-db-card-value" data-testid="merchant-cost">
            {overview ? fmtYuan(overview.cost_cents) : '—'}
          </div>
          <p className="neo-db-card-hint">
            {t('neo.merchant.costHint', { defaultValue: '按订单成本归集' })}
          </p>
        </div>
        <div className="neo-db-card">
          <p className="neo-db-card-label">{t('neo.merchant.gross', { defaultValue: '毛利 / 毛利率' })}</p>
          <div className="neo-db-card-value" data-testid="merchant-gross">
            {overview ? `${fmtYuan(overview.gross_profit_cents)} · ${fmtPct(overview.gross_margin_pct)}` : '—'}
          </div>
          <p className="neo-db-card-hint">
            {t('neo.merchant.grossHint', { defaultValue: '营收 − 成本' })}
          </p>
        </div>
        <div className="neo-db-card">
          <p className="neo-db-card-label">{t('neo.merchant.aov', { defaultValue: '客单价' })}</p>
          <div className="neo-db-card-value" data-testid="merchant-aov">
            {overview ? fmtYuan(overview.avg_order_cents) : '—'}
          </div>
          <p className="neo-db-card-hint">
            {t('neo.merchant.aovHint', { defaultValue: '营收 ÷ 未退款成交单数' })}
          </p>
        </div>
      </div>

      {overview?.comparison && (
        <p className="neo-mb-compare" data-testid="merchant-compare">
          <span className="neo-mb-compare-label">
            {t('neo.merchant.compareLabel', { defaultValue: '较上一周期' })}
          </span>
          <Delta label={t('neo.merchant.revenue', { defaultValue: '营收' })} value={overview.comparison.delta_pct.revenue} />
          <Delta label={t('neo.merchant.grossShort', { defaultValue: '毛利' })} value={overview.comparison.delta_pct.gross_profit} />
          <Delta label={t('neo.merchant.ordersShort', { defaultValue: '订单' })} value={overview.comparison.delta_pct.orders} />
        </p>
      )}

      {/* ── 分时流水 ── */}
      <div className="neo-db-tabs" style={{ marginBottom: 10 }} role="tablist">
        {(['15m', 'hour', 'day'] as Granularity[]).map((g) => (
          <button
            key={g}
            type="button"
            className={`neo-db-tab${granularity === g ? ' on' : ''}`}
            onClick={() => setGranularity(g)}
            data-testid={`merchant-granularity-${g}`}
          >
            {g === '15m' ? t('neo.merchant.g15', { defaultValue: '15 分钟' })
              : g === 'hour' ? t('neo.merchant.gHour', { defaultValue: '按小时' })
                : t('neo.merchant.gDay', { defaultValue: '按天' })}
          </button>
        ))}
        <button
          type="button"
          className="neo-db-tab"
          onClick={() => void refresh()}
          disabled={busy}
          data-testid="merchant-refresh"
        >
          {busy ? t('neo.merchant.loading', { defaultValue: '刷新中…' }) : t('neo.merchant.refresh', { defaultValue: '刷新' })}
        </button>
      </div>

      <div className="neo-db-panel" data-testid="merchant-flow">
        <p className="neo-db-card-label">
          {granularity === 'day'
            ? t('neo.merchant.flow7d', { defaultValue: '订单流水（近 7 天）' })
            : t('neo.merchant.flowToday', { defaultValue: '订单流水（今日）' })}
          {flow && (
            <span style={{ marginLeft: 8 }}>
              {t('neo.merchant.flowSum', {
                defaultValue: `合计 ${fmtYuan(flow.total.amount_cents)} · 峰值 ${fmtYuan(flow.peak?.amount_cents ?? 0)}`,
              })}
            </span>
          )}
        </p>
        {flow && (
          <p className="neo-mb-hint">
            {t('neo.merchant.flowNote', {
              defaultValue:
                '流水按支付时间归桶，含后续退款的成交；上方营收已扣退款，两者口径不同属正常。',
            })}
          </p>
        )}
        {flow && flow.total.amount_cents > 0 ? (
          <FlowChart data={flow} granularity={granularity} />
        ) : (
          <p className="neo-db-chart-empty">
            {t('neo.merchant.flowEmpty', { defaultValue: '窗口内还没有成交，先跑一单试试' })}
          </p>
        )}
      </div>

      {/* ── 客流 ── */}
      <div className="neo-db-panel" style={{ marginTop: 12 }} data-testid="merchant-traffic">
        <p className="neo-db-card-label">{t('neo.merchant.traffic', { defaultValue: '客流与转化' })}</p>
        {traffic ? (
          <>
            <p className="neo-db-card-hint">
              {t('neo.merchant.trafficSum', {
                defaultValue: `PV ${traffic.total.pv} · UV ${traffic.total.uv} · 转化 ${traffic.total.converted_visits} 人（${fmtPct(traffic.total.conversion_rate)}）`,
              })}
            </p>
            {traffic.channels.length > 0 ? (
              <table className="neo-db-table neo-mb-table" data-testid="merchant-channel-table">
                <thead>
                  <tr>
                    <th>{t('neo.merchant.channel', { defaultValue: '渠道' })}</th>
                    <th className="neo-mb-num">PV</th>
                    <th className="neo-mb-num">UV</th>
                    <th className="neo-mb-num">{t('neo.merchant.conv', { defaultValue: '转化率' })}</th>
                  </tr>
                </thead>
                <tbody>
                  {traffic.channels.map((c) => (
                    <tr key={c.channel}>
                      <td>{c.channel}</td>
                      <td className="neo-mb-num">{c.pv}</td>
                      <td className="neo-mb-num">{c.uv}</td>
                      <td className="neo-mb-num">{fmtPct(c.conversion_rate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="neo-db-chart-empty">
                {t('neo.merchant.trafficEmpty', { defaultValue: '还没有落地页埋点数据' })}
              </p>
            )}
          </>
        ) : (
          <p className="neo-db-chart-empty">—</p>
        )}
      </div>

      {/* ── 订单明细 ── */}
      <div className="neo-db-panel" style={{ marginTop: 12 }} data-testid="merchant-orders">
        <p className="neo-db-card-label">
          {t('neo.merchant.orders', { defaultValue: '订单明细' })}
          <span style={{ marginLeft: 8 }} data-testid="merchant-orders-sum">
            {orderPage
              ? t('neo.merchant.ordersSum', {
                  defaultValue: `共 ${orderPage.total} 单${orderPage.total > orders.length ? `，已显示 ${orders.length}` : ''}`,
                })
              : ''}
          </span>
        </p>
        <div className="neo-db-tabs" style={{ marginBottom: 10 }} role="tablist">
          {([
            ['', t('neo.merchant.orderAll', { defaultValue: '全部' })],
            ['created', t('neo.merchant.orderCreated', { defaultValue: '待支付' })],
            ['paid', t('neo.merchant.orderPaid', { defaultValue: '已支付' })],
            ['refunded', t('neo.merchant.orderRefunded', { defaultValue: '已退款' })],
          ] as const).map(([value, label]) => (
            <button
              key={value || 'all'}
              type="button"
              className={`neo-db-tab${orderFilter === value ? ' on' : ''}`}
              onClick={() => setOrderFilter(value)}
              data-testid={`merchant-order-filter-${value || 'all'}`}
            >
              {label}
            </button>
          ))}
        </div>
        {orders.length > 0 ? (
          <table className="neo-db-table neo-mb-table" data-testid="merchant-order-table">
            <thead>
              <tr>
                <th>{t('neo.merchant.orderTime', { defaultValue: '时间' })}</th>
                <th>{t('neo.merchant.orderProduct', { defaultValue: '商品' })}</th>
                <th>{t('neo.merchant.orderStatus', { defaultValue: '状态' })}</th>
                <th className="neo-mb-num">{t('neo.merchant.orderAmount', { defaultValue: '金额' })}</th>
                <th className="neo-mb-num">{t('neo.merchant.orderCost', { defaultValue: '成本' })}</th>
                <th className="neo-mb-num">{t('neo.merchant.orderGross', { defaultValue: '毛利' })}</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} data-testid={`merchant-order-row-${o.status}`}>
                  <td className="neo-mb-mono">{fmtTime(o.created_at)}</td>
                  <td>{o.product_name}</td>
                  <td>
                    <span className={`neo-mb-status neo-mb-status--${o.status}`}>
                      {ORDER_STATUS_LABEL[o.status]}
                    </span>
                  </td>
                  <td className="neo-mb-num">{fmtYuan(o.amount_cents)}</td>
                  <td className="neo-mb-num">{fmtYuan(o.cost_cents)}</td>
                  <td className="neo-mb-num">
                    {o.status === 'paid' ? fmtYuan(o.gross_profit_cents) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="neo-db-chart-empty">
            {orderFilter
              ? t('neo.merchant.ordersEmptyFiltered', { defaultValue: '该状态下还没有订单' })
              : t('neo.merchant.ordersEmpty', { defaultValue: '还没有订单，先跑一单试试' })}
          </p>
        )}
        {orderPage?.has_more && (
          <div style={{ marginTop: 10, textAlign: 'center' }}>
            <button
              type="button"
              className="neo-db-tab"
              onClick={() => void loadMore()}
              disabled={loadingMore}
              data-testid="merchant-orders-more"
            >
              {loadingMore
                ? t('neo.merchant.ordersLoading', { defaultValue: '加载中…' })
                : t('neo.merchant.ordersMore', {
                    defaultValue: `加载更多（还有 ${orderPage.total - orders.length} 单）`,
                  })}
            </button>
          </div>
        )}
        <p className="neo-mb-hint">
          {t('neo.merchant.ordersNote', {
            defaultValue:
              '状态由订单本身决定：待支付=已下单未付款，已支付=钱已入账，已退款=已冲回收入与成本。只有「已支付」的单计毛利，其余显示 —。',
          })}
        </p>
      </div>

      {/* ── 第一单链路 ── */}
      <div className="neo-db-panel" style={{ marginTop: 12 }} data-testid="merchant-chain">
        <p className="neo-db-card-label">
          {t('neo.merchant.chain', { defaultValue: '第一单链路' })}
          {chain && (
            <span style={{ marginLeft: 8 }} data-testid="merchant-chain-state">
              {chain.complete
                ? t('neo.merchant.chainOk', { defaultValue: '五步全通' })
                : t('neo.merchant.chainBroken', { defaultValue: '链路未通' })}
            </span>
          )}
        </p>
        <div className="neo-db-tabs" style={{ marginBottom: 10 }}>
          <input
            className="neo-db-tab"
            style={{ cursor: 'text', minWidth: 200 }}
            value={traceId}
            onChange={(e) => setTraceId(e.target.value)}
            placeholder={t('neo.merchant.tracePh', { defaultValue: '按 trace_id 查（留空=最早一笔）' })}
            data-testid="merchant-trace-input"
          />
          <button type="button" className="neo-db-tab" onClick={() => void loadChain()} data-testid="merchant-trace-load">
            {t('neo.merchant.traceLoad', { defaultValue: '查链路' })}
          </button>
        </div>
        {chain ? (
          <div className="neo-db-lesson-kinds" data-testid="merchant-chain-steps">
            {chain.steps.map((s) => (
              <span
                key={s.step}
                className="neo-db-lesson-chip"
                data-testid={`merchant-step-${s.step}`}
                title={`${s.step} · ${s.ok ? 'ok' : 'missing'}`}
              >
                {s.ok ? '✓' : '×'} {STEP_LABEL[s.step] ?? s.step}
              </span>
            ))}
          </div>
        ) : (
          <p className="neo-db-chart-empty">
            {t('neo.merchant.chainEmpty', { defaultValue: '还没有成交，链路无从判定' })}
          </p>
        )}
      </div>

      {/* ── 演示证据包：①③ 的留痕合成一份可下载的答辩材料 ── */}
      <div className="neo-db-panel neo-mb-evidence" style={{ marginTop: 12 }} data-testid="merchant-evidence">
        <p className="neo-db-card-label">
          {t('neo.merchant.evidence', { defaultValue: '演示证据包（运行记录）' })}
        </p>
        <p className="neo-mb-hint">
          {t('neo.merchant.evidenceHint', {
            defaultValue:
              '把经营口径、账实核对、记忆交接与人工裁决留痕合成一份材料，供评委核实业务闭环与人机分工；导出只读，不改数据，区间与上方 KPI 一致。',
          })}
        </p>
        {evidence && (
          <div className="neo-db-lesson-kinds" data-testid="merchant-evidence-summary">
            <span className="neo-db-lesson-chip" data-testid="merchant-evidence-reconcile">
              {evidence.merchant.reconcile.balanced ? '账实一致' : '账实有差额'}
            </span>
            <span className="neo-db-lesson-chip">
              {evidence.merchant.first_order.complete ? '第一单五步全通' : '第一单链路未通'}
            </span>
            <span className="neo-db-lesson-chip">写回事件 {evidence.memory.audit.total}</span>
            <span className="neo-db-lesson-chip" data-testid="merchant-evidence-conflicts">
              待裁决 {evidence.human_decisions.pending_conflicts}
            </span>
            <span className="neo-db-lesson-chip" data-testid="merchant-evidence-resolutions">
              人工裁决 {evidence.human_decisions.resolutions}
            </span>
            <span className="neo-db-lesson-chip">
              反馈待补跑 {evidence.human_decisions.pending_feedback + evidence.human_decisions.failed_feedback}
            </span>
          </div>
        )}
        <div className="neo-db-tabs" role="group" aria-label="evidence export">
          <button
            type="button"
            className="neo-db-tab"
            onClick={() => void loadEvidence()}
            disabled={evidenceBusy}
            data-testid="merchant-evidence-refresh"
          >
            {evidenceBusy
              ? t('neo.merchant.evidenceLoading', { defaultValue: '扫描中…' })
              : t('neo.merchant.evidenceScan', { defaultValue: '重新扫描留痕' })}
          </button>
          <button
            type="button"
            className="neo-db-tab"
            onClick={() => void exportFile('md')}
            data-testid="merchant-evidence-md"
          >
            {t('neo.merchant.evidenceMd', { defaultValue: '导出 Markdown 报告' })}
          </button>
          <button
            type="button"
            className="neo-db-tab"
            onClick={() => void exportFile('csv')}
            data-testid="merchant-evidence-csv"
          >
            {t('neo.merchant.evidenceCsv', { defaultValue: '导出订单 CSV' })}
          </button>
        </div>
        {exportMsg && (
          <p className="neo-db-status" role="status" data-testid="merchant-evidence-msg">
            {exportMsg}
          </p>
        )}
      </div>
    </section>
  );
}
