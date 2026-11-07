/**
 * OpsPanel — 代运营看板（2026-11-07，缺口审计 P1「前端 UI 零接入」）。
 *
 * 沿用数据看板页的 neo-db-* 视觉体系与 i18n L(zh,en) 惯例，不引新依赖、
 * 不另建页面：由 DashboardPage 一行挂载（与 MerchantBoardPanel 并列）。
 * 数据全部走 /api/ops（overview 直出）+ /api/merchant/products + 社交账号：
 *
 *   1. 四步进度：上架 → 营销帖 → 多平台分发 → 快递寄出，done 口径是
 *      「无缺口」（gap 明细带具体 id），plan 直出下一步可照抄动作；
 *   2. 一键分发：对每个商品发 POST /api/ops/marketing/launch（只投有 active
 *      账号的平台；已发过的账号自动跳过 = 幂等，重跑即重试）；
 *   3. 运单列表：状态筛选 + 交运 / 轨迹同步（失败结构化显示，不吞错误）。
 *
 * 口径全部由后端算好，前端只做展示与动作触发。mock/real 如实标注：
 * 运单 mode=mock 的在界面上写「模拟」，不说「已发出」。
 */
import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '../common/i18n';
import { listMerchantProducts, type MerchantProduct } from '../api/merchantBoard';
import {
  fetchOpsOverview,
  fetchOpsShipments,
  fetchPublishAccounts,
  launchMarketing,
  shipOpsShipment,
  trackOpsShipment,
  type LaunchResult,
  type OpsOverview,
  type ShipmentRow,
  type ShipmentStatus,
} from '../api/ops';
import './dashboard-neo.css';
import './ops-panel.css';

const SHIP_STATUS: Array<ShipmentStatus | 'all'> = [
  'all',
  'pending',
  'shipped',
  'in_transit',
  'delivered',
  'failed',
];

/** 承运商 id → 展示名（与后端 CARRIERS 注册表一致，仅展示用）。 */
const CARRIER_LABEL: Record<string, string> = {
  sf: '顺丰',
  zto: '中通',
  yto: '圆通',
  jd: '京东物流',
  ems: '邮政EMS',
  debang: '德邦',
};

/** 平台 id → 展示名（与 lib/social-platforms PLATFORMS 一致，仅展示用）。 */
const PLATFORM_LABEL: Record<string, string> = {
  wechat_mp: '公众号',
  xiaohongshu: '小红书',
  douyin: '抖音',
  weibo: '微博',
  shipinhao: '视频号',
  kuaishou: '快手',
};

type LoadStatus = 'idle' | 'loading' | 'success' | 'error';

/** 轻量 id：缺口 chip 里 UUID 太长，中段截断，title 悬浮全文。 */
function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

export default function OpsPanel() {
  const { t, language } = useI18n();
  const L = (zh: string, en: string) => (language === 'zh' ? zh : en);

  const [overview, setOverview] = useState<OpsOverview | null>(null);
  const [products, setProducts] = useState<MerchantProduct[]>([]);
  const [activePlatforms, setActivePlatforms] = useState<string[]>([]);
  const [shipments, setShipments] = useState<ShipmentRow[]>([]);
  const [shipFilter, setShipFilter] = useState<ShipmentStatus | 'all'>('all');
  const [status, setStatus] = useState<LoadStatus>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  /** 每个商品的一键分发回执（key=product_id），成功失败都如实展示。 */
  const [launchResults, setLaunchResults] = useState<Record<string, LaunchResult>>({});
  /** 行级动作（交运/轨迹）的进行中标记，防连点。 */
  const [busyId, setBusyId] = useState('');
  const [actionMsg, setActionMsg] = useState('');

  const refresh = useCallback(async () => {
    setStatus('loading');
    setErrorMsg('');
    try {
      const [ov, prods, accts, ships] = await Promise.all([
        fetchOpsOverview(),
        listMerchantProducts(),
        fetchPublishAccounts(),
        fetchOpsShipments(shipFilter === 'all' ? undefined : shipFilter),
      ]);
      setOverview(ov);
      setProducts(prods);
      setActivePlatforms([
        ...new Set(
          (accts.accounts ?? []).filter((a) => a.status === 'active').map((a) => a.platform),
        ),
      ]);
      setShipments(ships.shipments ?? []);
      setStatus('success');
    } catch (err) {
      setStatus('error');
      setErrorMsg(
        t('ops.loadFailed', {
          defaultValue:
            language === 'zh'
              ? `代运营看板加载失败：${err instanceof Error ? err.message : String(err)}`
              : `Failed to load ops board: ${err instanceof Error ? err.message : String(err)}`,
        }),
      );
    }
  }, [shipFilter, t, language]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function onLaunch(p: MerchantProduct) {
    setActionMsg('');
    try {
      const result = await launchMarketing(p.id, activePlatforms);
      setLaunchResults((prev) => ({ ...prev, [p.id]: result }));
      setActionMsg(
        L(
          `「${p.name}」分发完成：新发 ${result.summary.published}，跳过 ${result.summary.skipped}，失败 ${result.summary.failed}`,
          `"${p.name}" distributed: ${result.summary.published} published, ${result.summary.skipped} skipped, ${result.summary.failed} failed`,
        ),
      );
      // 帖子数与四步进度变了，静默刷新（不闪 loading）。
      // await 掉避免悬浮 promise 在 act 外落 state（KnowledgePage 竞态教训）。
      setOverview(await fetchOpsOverview());
    } catch (err) {
      setActionMsg(
        L(
          `分发失败：${err instanceof Error ? err.message : String(err)}`,
          `Launch failed: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }
  }

  async function onShip(row: ShipmentRow) {
    setBusyId(row.id);
    setActionMsg('');
    try {
      const result = await shipOpsShipment(row.id);
      const no = result.receipt.tracking_no ?? '';
      setActionMsg(
        result.receipt.ok
          ? L(
              `运单已${row.mode === 'mock' ? '（模拟）' : ''}交运，面单号 ${no}`,
              `Shipment ${row.mode === 'mock' ? '(mock) ' : ''}shipped, tracking ${no}`,
            )
          : L(
              `交运失败（${result.receipt.code ?? 'ERROR'}）：${result.receipt.error ?? ''}`,
              `Ship failed (${result.receipt.code ?? 'ERROR'}): ${result.receipt.error ?? ''}`,
            ),
      );
      await refresh();
    } catch (err) {
      setActionMsg(
        L(
          `交运失败：${err instanceof Error ? err.message : String(err)}`,
          `Ship failed: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    } finally {
      setBusyId('');
    }
  }

  async function onTrack(row: ShipmentRow) {
    setBusyId(row.id);
    setActionMsg('');
    try {
      const result = await trackOpsShipment(row.id);
      setActionMsg(
        result.receipt.ok
          ? L(
              `轨迹同步：新增 ${result.added} 条，当前状态 ${result.receipt.status ?? row.status}`,
              `Tracking synced: ${result.added} new events, status ${result.receipt.status ?? row.status}`,
            )
          : L(
              `轨迹查询失败（${result.receipt.code ?? 'ERROR'}）：${result.receipt.error ?? ''}`,
              `Track failed (${result.receipt.code ?? 'ERROR'}): ${result.receipt.error ?? ''}`,
            ),
      );
      await refresh();
    } catch (err) {
      setActionMsg(
        L(
          `轨迹查询失败：${err instanceof Error ? err.message : String(err)}`,
          `Track failed: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    } finally {
      setBusyId('');
    }
  }

  function statusLabel(s: ShipmentStatus): string {
    switch (s) {
      case 'pending':
        return L('待交运', 'Pending');
      case 'shipped':
        return L('已交运', 'Shipped');
      case 'in_transit':
        return L('运输中', 'In transit');
      case 'delivered':
        return L('已送达', 'Delivered');
      case 'failed':
        return L('失败·可重试', 'Failed·retryable');
    }
  }

  return (
    <section className="neo-db-section" data-testid="ops-panel">
      <h2 className="neo-db-section-title">{L('代运营看板', 'Ops board')}</h2>
      <p className="neo-db-sub">
        {L(
          '上架商品 → 自动生营销帖 → 多平台分发 → 快递寄出；口径以 overview 直出为准',
          'Listings → marketing posts → multi-platform distribution → shipping; straight from /api/ops/overview',
        )}
      </p>

      <div className="ops-toolbar">
        <button
          type="button"
          className="neo-db-refresh"
          onClick={refresh}
          disabled={status === 'loading'}
          data-testid="ops-refresh"
        >
          {status === 'loading' ? L('加载中…', 'Loading…') : L('刷新', 'Refresh')}
        </button>
        {actionMsg && (
          <p className="ops-action-msg" role="status" data-testid="ops-action-msg">
            {actionMsg}
          </p>
        )}
      </div>

      {status === 'error' && (
        <p className="neo-db-status neo-db-status--error" role="alert" data-testid="ops-error">
          {errorMsg}
        </p>
      )}

      {/* ── 四步进度 + plan ───────────────────────────────────────────── */}
      {overview && (
        <>
          <div className="ops-steps" data-testid="ops-steps">
            {overview.steps.map((s) => (
              <div key={s.key} className={`ops-step${s.done ? ' done' : ''}`} data-testid={`ops-step-${s.key}`}>
                <div className="ops-step-head">
                  <span className="ops-step-name">{s.name}</span>
                  <span className={`ops-step-badge${s.done ? ' ok' : ''}`}>
                    {s.done ? L('完成', 'Done') : L('有缺口', 'Gap')}
                  </span>
                </div>
                <div className="ops-step-count">{s.count}</div>
                {s.gap.length > 0 && (
                  <div className="ops-gap">
                    {s.gap.slice(0, 5).map((g, i) => (
                      <span key={i} className="ops-gap-chip" title={g}>
                        {shortId(g)}
                      </span>
                    ))}
                    {s.gap.length > 5 && (
                      <span className="ops-gap-chip more">+{s.gap.length - 5}</span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="neo-db-panel ops-plan" data-testid="ops-plan">
            <p className="ops-plan-label">{L('下一步（照抄执行）', 'Next action (copy & run)')}</p>
            <p className="ops-plan-reason">{overview.plan.reason}</p>
            {overview.plan.next_action && (
              <p className="ops-plan-endpoint">
                <code>
                  {overview.plan.next_action.method} {overview.plan.next_action.path}
                </code>
                {overview.plan.next_action.body && (
                  <code className="ops-plan-body">{JSON.stringify(overview.plan.next_action.body)}</code>
                )}
              </p>
            )}
            {overview.pending_orders.length > 0 && (
              <p className="ops-plan-hint">
                {L('待寄出订单：', 'Orders awaiting shipment: ')}
                {overview.pending_orders.map((o) => shortId(o.id)).join('、')}
              </p>
            )}
          </div>
        </>
      )}

      {/* ── 一键分发 ──────────────────────────────────────────────────── */}
      {products.length > 0 && (
        <div className="neo-db-panel">
          <table className="neo-db-table" data-testid="ops-products">
            <thead>
              <tr>
                <th>{L('商品', 'Product')}</th>
                <th className="neo-db-table-num">{L('售价', 'Price')}</th>
                <th>{L('分发目标', 'Targets')}</th>
                <th>{L('操作', 'Action')}</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const result = launchResults[p.id];
                return (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td className="neo-db-table-num">¥{(p.price_cents / 100).toFixed(2)}</td>
                    <td>
                      {activePlatforms.length > 0 ? (
                        activePlatforms.map((pf) => (
                          <span key={pf} className="ops-gap-chip">
                            {PLATFORM_LABEL[pf] ?? pf}
                          </span>
                        ))
                      ) : (
                        <span className="ops-muted">{L('无 active 发布账号', 'No active account')}</span>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="neo-db-refresh ops-launch-btn"
                        disabled={activePlatforms.length === 0}
                        onClick={() => onLaunch(p)}
                        data-testid={`ops-launch-${p.id}`}
                      >
                        {L('一键分发', 'Distribute')}
                      </button>
                      {result && (
                        <span className="ops-launch-result" data-testid={`ops-launch-result-${p.id}`}>
                          {L(
                            `新发 ${result.summary.published} / 跳过 ${result.summary.skipped} / 失败 ${result.summary.failed}`,
                            `${result.summary.published} new / ${result.summary.skipped} skipped / ${result.summary.failed} failed`,
                          )}
                          {result.items
                            .filter((it) => it.code)
                            .map((it, i) => (
                              <span key={i} className="ops-gap-chip" title={it.error ?? ''}>
                                {it.platform || it.account_id}: {it.code}
                              </span>
                            ))}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── 运单 ──────────────────────────────────────────────────────── */}
      <div className="neo-db-tabs" role="tablist" aria-label={L('运单状态', 'Shipment status')}>
        {SHIP_STATUS.map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            className={`neo-db-tab${shipFilter === s ? ' on' : ''}`}
            aria-selected={shipFilter === s}
            onClick={() => setShipFilter(s)}
            data-testid={`ops-ship-filter-${s}`}
          >
            {s === 'all' ? L('全部', 'All') : statusLabel(s)}
          </button>
        ))}
      </div>

      <div className="neo-db-panel">
        {shipments.length === 0 ? (
          <p className="neo-db-chart-empty" data-testid="ops-shipments-empty">
            {L('暂无运单', 'No shipments')}
          </p>
        ) : (
          <table className="neo-db-table" data-testid="ops-shipments">
            <thead>
              <tr>
                <th>{L('面单号', 'Tracking')}</th>
                <th>{L('承运商', 'Carrier')}</th>
                <th>{L('收件人', 'Receiver')}</th>
                <th>{L('状态', 'Status')}</th>
                <th className="neo-db-table-num">{L('尝试', 'Attempts')}</th>
                <th>{L('操作', 'Action')}</th>
              </tr>
            </thead>
            <tbody>
              {shipments.map((row) => (
                <tr key={row.id}>
                  <td>
                    {row.tracking_no ?? L('（未出单）', '(none)')}
                    {row.mode === 'mock' && <span className="ops-gap-chip">{L('模拟', 'mock')}</span>}
                  </td>
                  <td>{CARRIER_LABEL[row.carrier] ?? row.carrier}</td>
                  <td>{row.receiver_name}</td>
                  <td>
                    <span className={`ops-status ops-status--${row.status}`}>
                      {statusLabel(row.status)}
                    </span>
                    {row.error && (
                      <span className="ops-gap-chip" title={row.error}>
                        {row.error.slice(0, 16)}…
                      </span>
                    )}
                  </td>
                  <td className="neo-db-table-num">{row.attempts}</td>
                  <td>
                    {(row.status === 'pending' || row.status === 'failed') && (
                      <button
                        type="button"
                        className="neo-db-refresh ops-launch-btn"
                        disabled={busyId === row.id}
                        onClick={() => onShip(row)}
                        data-testid={`ops-ship-${row.id}`}
                      >
                        {L('交运', 'Ship')}
                      </button>
                    )}
                    {row.tracking_no && (
                      <button
                        type="button"
                        className="neo-db-refresh ops-launch-btn"
                        disabled={busyId === row.id}
                        onClick={() => onTrack(row)}
                        data-testid={`ops-track-${row.id}`}
                      >
                        {L('同步轨迹', 'Track')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
