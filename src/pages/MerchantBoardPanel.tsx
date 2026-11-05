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
 *
 * 口径全部由后端算好，这里只做展示与单位换算，不在前端重复计算。
 */
import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '../common/i18n';
import {
  fetchFirstOrderChain,
  fetchMerchantOverview,
  fetchOrderTimeseries,
  fetchReconcile,
  fetchTrafficCurve,
  type FirstOrderChain,
  type Granularity,
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

export default function MerchantBoardPanel() {
  const { t } = useI18n();
  const [granularity, setGranularity] = useState<Granularity>('day');
  const [overview, setOverview] = useState<MerchantOverview | null>(null);
  const [flow, setFlow] = useState<OrderTimeseries | null>(null);
  const [traffic, setTraffic] = useState<TrafficCurve | null>(null);
  const [chain, setChain] = useState<FirstOrderChain | null>(null);
  const [reconcile, setReconcile] = useState<ReconcileResult | null>(null);
  const [traceId, setTraceId] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const msg = (err: unknown) => (err instanceof Error ? err.message : String(err));

  const refresh = useCallback(async () => {
    setBusy(true);
    setErrorMsg('');
    try {
      const [ov, ts, tc, rec, ch] = await Promise.all([
        fetchMerchantOverview(),
        fetchOrderTimeseries({ granularity, start: windowStart(granularity) }),
        fetchTrafficCurve({ granularity, start: windowStart(granularity) }),
        fetchReconcile(),
        fetchFirstOrderChain(''),
      ]);
      setOverview(ov);
      setFlow(ts);
      setTraffic(tc);
      setReconcile(rec);
      setChain(ch);
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
  }, [granularity, t]);

  const loadChain = useCallback(async () => {
    try {
      setChain(await fetchFirstOrderChain(traceId.trim()));
    } catch (err) {
      setErrorMsg(`链路查询失败：${msg(err)}`);
    }
  }, [traceId]);

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
          defaultValue: '订单流水 · 客流转化 · 第一单链路。KPI 是累计值，流水与客流按所选窗口；口径由后端算好，营收已扣退款。',
        })}
      </p>

      {errorMsg && (
        <p className="neo-db-status neo-db-status--error" role="alert" data-testid="merchant-error">
          {errorMsg}
        </p>
      )}

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
    </section>
  );
}
