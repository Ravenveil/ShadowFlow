/**
 * DashboardPage — 数据看板（2026-11-05，整合 OPC-OS PR#3 看板设计）。
 *
 * 指标全部从我们自己的域取材（token_usage / run_index / projects /
 * conversations），订单/客户/营收类指标按评审结论弃掉。图表轻量 SVG
 * 自绘，不引新依赖。双形态：路由页 /dashboard 全页；NeoApp 中栏
 * `<DashboardPage embedded />` 内嵌（rail 常驻——点击侧边栏「数据看板」
 * 后左侧边栏保持）。
 *
 * 数据源：src/api/dashboard.ts → GET /api/dashboard/*（Node）。
 */
import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '../common/i18n';
import {
  fetchDashboardOverview,
  fetchDashboardTimeseries,
  fetchDashboardBreakdown,
  fetchDashboardBriefing,
  type DashboardOverview,
  type DashboardTimeseries,
  type DashboardBreakdown,
  type DashboardBriefing,
  type TimeseriesMetric,
  type BreakdownBy,
} from '../api/dashboard';
import './dashboard-neo.css';

const DAY_WINDOWS = [7, 30, 90] as const;
type DayWindow = (typeof DAY_WINDOWS)[number];

function fmtInt(n: number): string {
  return new Intl.NumberFormat('zh-CN').format(Math.round(n));
}

function fmtCost(usd: number): string {
  if (usd > 0 && usd < 0.01) return '<$0.01';
  return `$${usd.toFixed(2)}`;
}

function fmtCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(Math.round(n));
}

function fmtDelta(pct: number | null): string {
  if (pct === null) return '—';
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct}% 环比`;
}

/** 轻量 SVG 折线图（自绘，无依赖）。height 固定 120，宽度 viewBox 自适应。 */
function TrendChart({
  series,
  metric,
}: {
  series: DashboardTimeseries['series'];
  metric: TimeseriesMetric;
}) {
  const values = series.map((d) =>
    metric === 'calls' ? d.calls : metric === 'cost' ? d.cost ?? 0 : d.tokens ?? 0,
  );
  const max = Math.max(...values, 1);
  const allZero = values.every((v) => v === 0);
  const W = 640;
  const H = 120;
  const PAD = 6;
  const step = series.length > 1 ? (W - PAD * 2) / (series.length - 1) : 0;
  const pt = (v: number, i: number): [number, number] => [
    PAD + i * step,
    H - PAD - (v / max) * (H - PAD * 2),
  ];
  const points = values.map((v, i) => pt(v, i));
  const path = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area =
    points.length > 1
      ? `${path} L${points[points.length - 1][0].toFixed(1)},${H - PAD} L${points[0][0].toFixed(1)},${H - PAD} Z`
      : '';
  return (
    <svg
      className="neo-db-chart-svg"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="usage trend chart"
      data-testid="db-trend-chart"
    >
      {area && <path className="neo-db-chart-area" d={area} />}
      {points.length > 1 && <path className="neo-db-chart-line" d={path} />}
      {!allZero &&
        points.map(([x, y], i) => (
          <circle key={i} className="neo-db-chart-dot" cx={x} cy={y} r={2} />
        ))}
    </svg>
  );
}

type LoadStatus = 'idle' | 'loading' | 'success' | 'error';

export default function DashboardPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { t, language } = useI18n();
  const [days, setDays] = useState<DayWindow>(30);
  const [metric, setMetric] = useState<TimeseriesMetric>('tokens');
  const [breakdownBy, setBreakdownBy] = useState<BreakdownBy>('model');
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [timeseries, setTimeseries] = useState<DashboardTimeseries | null>(null);
  const [breakdown, setBreakdown] = useState<DashboardBreakdown | null>(null);
  const [briefing, setBriefing] = useState<DashboardBriefing | null>(null);
  const [status, setStatus] = useState<LoadStatus>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const refresh = useCallback(async () => {
    setStatus('loading');
    setErrorMsg('');
    try {
      const [ov, ts, bd, bf] = await Promise.all([
        fetchDashboardOverview(days),
        fetchDashboardTimeseries(days, metric),
        fetchDashboardBreakdown(days, breakdownBy),
        fetchDashboardBriefing(7),
      ]);
      setOverview(ov);
      setTimeseries(ts);
      setBreakdown(bd);
      setBriefing(bf);
      setStatus('success');
    } catch (err) {
      setStatus('error');
      setErrorMsg(
        t('db.loadFailed', {
          defaultValue:
            language === 'zh'
              ? `看板加载失败：${err instanceof Error ? err.message : String(err)}`
              : `Failed to load dashboard: ${err instanceof Error ? err.message : String(err)}`,
        }),
      );
    }
  }, [days, metric, breakdownBy, t, language]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const L = (zh: string, en: string) => (language === 'zh' ? zh : en);

  return (
    <div className={`neo-db${embedded ? ' embedded' : ''}`} data-testid="dashboard-page">
      <div className="neo-db-header">
        <div>
          <p className="neo-db-eyebrow">{L('DATA PLATFORM', 'DATA PLATFORM')}</p>
          <h1 className="neo-db-title">{L('数据看板', 'Dashboard')}</h1>
          <p className="neo-db-sub">
            {L(
              '调用 · token 消耗 · 成本估算 · run 成功率与每日简报',
              'Calls · token usage · cost estimate · run success rate & daily briefing',
            )}
          </p>
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
        <div className="neo-db-cards" data-testid="db-overview-cards">
          <div className="neo-db-card">
            <p className="neo-db-card-label">{L('LLM 调用', 'LLM calls')}</p>
            <div className="neo-db-card-value">{fmtInt(overview.usage.calls)}</div>
            <p className="neo-db-card-delta">{fmtDelta(overview.usage.deltas.calls)}</p>
          </div>
          <div className="neo-db-card">
            <p className="neo-db-card-label">{L('Token 消耗', 'Tokens')}</p>
            <div className="neo-db-card-value">{fmtCompact(overview.usage.total_tokens)}</div>
            <p className="neo-db-card-delta">{fmtDelta(overview.usage.deltas.total_tokens)}</p>
            <p className="neo-db-card-hint">
              ↑{fmtCompact(overview.usage.input_tokens)} ↓{fmtCompact(overview.usage.output_tokens)}
            </p>
          </div>
          <div className="neo-db-card">
            <p className="neo-db-card-label">{L('估算成本', 'Est. cost')}</p>
            <div className="neo-db-card-value">{fmtCost(overview.usage.cost_est_usd)}</div>
            <p className="neo-db-card-delta">{fmtDelta(overview.usage.deltas.cost_est_usd)}</p>
          </div>
          <div className="neo-db-card">
            <p className="neo-db-card-label">{L('Run 成功率', 'Run success rate')}</p>
            <div className="neo-db-card-value">
              {overview.runs.success_rate === null ? '—' : `${overview.runs.success_rate}%`}
            </div>
            <p className="neo-db-card-hint">
              {fmtInt(overview.runs.total)} {L('次 · 失败', 'runs · failed')} {fmtInt(overview.runs.failed)}
            </p>
          </div>
          <div className="neo-db-card">
            <p className="neo-db-card-label">{L('活跃项目 / 会话', 'Active projects / conversations')}</p>
            <div className="neo-db-card-value">
              {fmtInt(overview.active.projects)} / {fmtInt(overview.active.conversations)}
            </div>
          </div>
        </div>
      )}

      {timeseries && (
        <section className="neo-db-section">
          <h2 className="neo-db-section-title">
            {metric === 'tokens'
              ? L('Token 趋势', 'Token trend')
              : metric === 'calls'
                ? L('调用趋势', 'Call trend')
                : L('成本趋势', 'Cost trend')}
          </h2>
          <div className="neo-db-chart-wrap">
            <div className="neo-db-panel" style={{ flex: 1 }}>
              <div className="neo-db-tabs" style={{ marginBottom: 12 }}>
                {(['tokens', 'calls', 'cost'] as TimeseriesMetric[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`neo-db-tab${metric === m ? ' on' : ''}`}
                    onClick={() => setMetric(m)}
                    data-testid={`db-metric-${m}`}
                  >
                    {m === 'tokens' ? L('Tokens', 'Tokens') : m === 'calls' ? L('调用', 'Calls') : L('成本', 'Cost')}
                  </button>
                ))}
              </div>
              {timeseries.series.some((d) =>
                metric === 'calls' ? d.calls > 0 : metric === 'cost' ? (d.cost ?? 0) > 0 : (d.tokens ?? 0) > 0,
              ) ? (
                <TrendChart series={timeseries.series} metric={metric} />
              ) : (
                <p className="neo-db-chart-empty">{L('窗口内暂无数据', 'No data in this window')}</p>
              )}
            </div>
          </div>
        </section>
      )}

      {breakdown && breakdown.items.length > 0 && (
        <section className="neo-db-section">
          <h2 className="neo-db-section-title">
            {breakdownBy === 'model' ? L('按模型分布', 'By model') : L('按会话分布', 'By session')}
          </h2>
          <div className="neo-db-tabs" style={{ marginBottom: 10 }}>
            {(['model', 'session'] as BreakdownBy[]).map((b) => (
              <button
                key={b}
                type="button"
                className={`neo-db-tab${breakdownBy === b ? ' on' : ''}`}
                onClick={() => setBreakdownBy(b)}
                data-testid={`db-breakdown-${b}`}
              >
                {b === 'model' ? L('模型', 'Model') : L('会话', 'Session')}
              </button>
            ))}
          </div>
          <div className="neo-db-panel">
            <table className="neo-db-table" data-testid="db-breakdown-table">
              <thead>
                <tr>
                  <th>{breakdownBy === 'model' ? L('模型', 'Model') : L('会话', 'Session')}</th>
                  <th className="neo-db-table-num">{L('调用', 'Calls')}</th>
                  <th className="neo-db-table-num">Tokens</th>
                  <th className="neo-db-table-num">{L('成本', 'Cost')}</th>
                </tr>
              </thead>
              <tbody>
                {breakdown.items.map((it) => (
                  <tr key={it.key || '(none)'}>
                    <td>{it.key || L('（未记录）', '(untracked)')}</td>
                    <td className="neo-db-table-num">{fmtInt(it.calls)}</td>
                    <td className="neo-db-table-num">{fmtCompact(it.total_tokens)}</td>
                    <td className="neo-db-table-num">{fmtCost(it.cost_est_usd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {briefing && (
        <section className="neo-db-section">
          <h2 className="neo-db-section-title">{L('每日简报', 'Daily briefing')}</h2>
          <div className="neo-db-panel">
            <div className="neo-db-brief-grid">
              <div className="neo-db-brief-item">
                <p className="neo-db-brief-k">{L('今日调用', 'Calls today')}</p>
                <p className="neo-db-brief-v">{fmtInt(briefing.today.calls)}</p>
              </div>
              <div className="neo-db-brief-item">
                <p className="neo-db-brief-k">{L('今日 token / 成本', 'Tokens / cost today')}</p>
                <p className="neo-db-brief-v">
                  {fmtCompact(briefing.today.total_tokens)} · {fmtCost(briefing.today.cost_est_usd)}
                </p>
              </div>
              <div className="neo-db-brief-item">
                <p className="neo-db-brief-k">{L('昨日调用', 'Calls yesterday')}</p>
                <p className="neo-db-brief-v">{fmtInt(briefing.yesterday.calls)}</p>
              </div>
              <div className="neo-db-brief-item">
                <p className="neo-db-brief-k">{L('近 7 日 token 合计', 'Tokens last 7d')}</p>
                <p className="neo-db-brief-v">{fmtCompact(briefing.trend_7d.total_tokens)}</p>
              </div>
            </div>
            {briefing.lessons_learned.length > 0 && (
              <div className="neo-db-lesson-kinds">
                {briefing.lessons_learned.map((l) => (
                  <span key={l.kind} className="neo-db-lesson-chip">
                    {l.kind === 'lesson'
                      ? L(`教训 ×${l.n}`, `Lessons ×${l.n}`)
                      : l.kind === 'preference'
                        ? L(`偏好 ×${l.n}`, `Preferences ×${l.n}`)
                        : L(`弱项 ×${l.n}`, `Weaknesses ×${l.n}`)}
                  </span>
                ))}
              </div>
            )}
            {briefing.failed_top.length > 0 && (
              <div className="neo-db-lesson-kinds">
                {briefing.failed_top.slice(0, 3).map((f, i) => (
                  <span key={i} className="neo-db-lesson-chip">
                    {L(`失败 ${f.n} 次：`, `Failed ×${f.n}: `)}
                    {f.goal ? f.goal.slice(0, 24) : L('(无目标)', '(no goal)')}
                  </span>
                ))}
              </div>
            )}
            {briefing.alerts.length > 0 && (
              <div className="neo-db-alerts">
                {briefing.alerts.map((a, i) => (
                  <p key={i} className="neo-db-alert" data-testid="db-alert">
                    {a}
                  </p>
                ))}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
