/**
 * NeoRunHistory — 历史 runs 列表视图（GAP B39，L6 证据层打包）。
 *
 * /runs 路由下架后（B3 已把两处死链改为 /?run=<id>）缺历史回溯入口；本组件
 * 挂在 Neo 左栏一级导航「历史」行（nav.view === 'runs'，中栏整宽阅读态）。
 *
 * 数据源：GET /api/runs?limit=50 → RunRecord[]（src/api/runs.listRuns，
 * raw array / envelope 双形态由客户端归一）。列表项链接沿用 B3 形态
 * /?run=<id>（整页重载 → NeoApp 从 URL 恢复 runId → useRunSession
 * 只读重放历史 run）。失败/空 → 干净空态，不 mock。
 */
import { useEffect, useState } from 'react';
import { CircleCheck, CircleX, History, RefreshCw } from 'lucide-react';
import { listRuns, type RunRecord } from '../api/runs';
import { useI18n } from '../common/i18n';
import './neo.css';
import './neo-host.css';

function fmtTime(iso: string | undefined): string | null {
  if (!iso) return null;
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return null;
  return iso.replace('T', ' ').slice(0, 19);
}

export function NeoRunHistory() {
  const { t } = useI18n();
  const [runs, setRuns] = useState<RunRecord[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    listRuns(50).then(
      (rows) => {
        if (!cancelled) {
          setRuns(rows);
          setFailed(false);
        }
      },
      () => {
        if (!cancelled) {
          setRuns(null);
          setFailed(true);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [tick]);

  return (
    <div className="neo-history">
      <div className="neo-history-head">
        <History size={14} strokeWidth={1.8} aria-hidden />
        <span className="neo-history-title">
          {t('neo.history.title', { defaultValue: '历史任务' })}
        </span>
        {runs && <span className="neo-host-sec-meta">{runs.length}</span>}
        <button
          type="button"
          className="neo-host-icon-btn"
          title={t('neo.host.refresh', { defaultValue: '刷新' })}
          onClick={() => setTick((n) => n + 1)}
        >
          <RefreshCw size={12} strokeWidth={1.8} />
        </button>
      </div>

      {failed ? (
        <div className="neo-list-note neo-list-error">
          <span className="neo-list-error-text">
            {t('neo.history.error', { defaultValue: '历史任务加载失败' })}
          </span>
          <button
            type="button"
            className="neo-list-retry"
            onClick={() => setTick((n) => n + 1)}
          >
            {t('common.retry', { defaultValue: '重试' })}
          </button>
        </div>
      ) : runs === null ? (
        <div className="neo-host-tree-note neo-host-tree-note--pad">
          {t('neo.host.loading', { defaultValue: '读取中…' })}
        </div>
      ) : runs.length === 0 ? (
        <div className="neo-list-note">
          {t('neo.history.empty', { defaultValue: '还没有历史任务' })}
        </div>
      ) : (
        runs.map((r) => {
          const time = fmtTime(r.created_at);
          return (
            <a
              key={r.run_id}
              className="neo-history-row"
              href={`/?run=${encodeURIComponent(r.run_id)}`}
              title={r.goal}
            >
              {r.status === 'completed' ? (
                <CircleCheck size={14} strokeWidth={1.8} className="neo-history-ic neo-history-ic--ok" aria-hidden />
              ) : (
                <CircleX size={14} strokeWidth={1.8} className="neo-history-ic neo-history-ic--err" aria-hidden />
              )}
              <span className="neo-history-main">
                <span className="neo-history-goal">{r.goal}</span>
                <span className="neo-history-sub">
                  {r.skill_display_name}
                  {time ? ` · ${time}` : ''}
                </span>
              </span>
              {r.artifact_filename && (
                <span className="neo-history-artifact">{r.artifact_filename}</span>
              )}
            </a>
          );
        })
      )}
    </div>
  );
}

export default NeoRunHistory;
