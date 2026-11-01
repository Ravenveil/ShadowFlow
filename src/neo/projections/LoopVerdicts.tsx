/**
 * LoopVerdicts — verifier 面板（L6 证据层打包，GAP：verifier 面板缺口）。
 *
 * 数据源（真实端点，不 mock）：
 *   GET /api/runs/{id}/loops/{loop_id}/verdicts
 *     → { iteration, score, rationale, claims[] }（单对象 / 数组 / envelope
 *        三种形态由 api/runs.getLoopVerdicts 统一归一）
 *
 * 挂在 NeoHost「过程」tab 迭代环卡内（每环一条折叠区）：默认收起，首次展开
 * 才拉取；`active`（SSE 仍在流）且展开时 5s 轮询刷新。端点 404/未就绪 →
 * 干净空态，不补占位。
 *
 * 2026-08-23 救场合入：`active`（loop 仍在跑）时露出「急停本循环」控制
 * （两步确认防误触），调 POST /runs/{id}/loops/{loop_id}/halt；成功后
 * 「已急停」红 pill 常驻，失败给红字重试提示（不 mock 成败，只看真实响应）。
 */
import { useEffect, useState } from 'react';
import { Ban, ChevronDown, ChevronRight, ShieldCheck } from 'lucide-react';
import { getLoopVerdicts, haltLoop, type LoopVerdict, type LoopVerdictClaim } from '../../api/runs';
import { useI18n } from '../../common/i18n';

export interface LoopVerdictsProps {
  runId: string;
  loopId: string;
  /** SSE 仍在流 → 展开期间 5s 轮询刷新 verdicts。 */
  active: boolean;
}

/** claim 字段未在契约里固定——防御式取文本，取不到退 JSON。 */
function claimText(c: LoopVerdictClaim): string {
  for (const k of ['text', 'claim', 'statement', 'content', 'description']) {
    const v = c[k];
    if (typeof v === 'string' && v) return v;
  }
  try {
    return JSON.stringify(c);
  } catch {
    return String(c);
  }
}

function claimStatus(c: LoopVerdictClaim): string | null {
  const v = c.status ?? c.verdict ?? c.result;
  return typeof v === 'string' && v ? v : null;
}

export function LoopVerdicts({ runId, loopId, active }: LoopVerdictsProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [verdicts, setVerdicts] = useState<LoopVerdict[] | null>(null);
  const [failed, setFailed] = useState(false);

  // ── loop 急停（演示救场）：active（SSE 仍在流）时露出，两步确认防误触，
  //    POST /runs/{id}/loops/{lid}/halt 成功后锁定为「已急停」红 pill。──
  const [confirming, setConfirming] = useState(false);
  const [halting, setHalting] = useState(false);
  const [halted, setHalted] = useState(false);
  const [haltFailed, setHaltFailed] = useState(false);

  const handleHaltConfirm = () => {
    if (halting) return;
    setHalting(true);
    setHaltFailed(false);
    haltLoop(runId, loopId).then(
      () => {
        setHalted(true);
        setHalting(false);
        setConfirming(false);
      },
      () => {
        setHaltFailed(true);
        setHalting(false);
      },
    );
  };

  // 首次展开才拉取；展开且流式期间 5s 轮询。
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const load = () => {
      getLoopVerdicts(runId, loopId).then(
        (v) => {
          if (cancelled) return;
          setVerdicts(v);
          setFailed(false);
        },
        () => {
          if (cancelled) return;
          setVerdicts(null);
          setFailed(true);
        },
      );
    };
    load();
    if (!active) return () => { cancelled = true; };
    const timer = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [open, runId, loopId, active]);

  return (
    <div className="neo-host-verdicts">
      <button
        type="button"
        className="neo-host-verdicts-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <ShieldCheck size={12} strokeWidth={1.9} aria-hidden />
        <span className="neo-host-sec-title">
          {t('neo.host.verdicts', { defaultValue: '验证意见' })}
        </span>
        {verdicts && verdicts.length > 0 && (
          <span className="neo-host-sec-meta">{verdicts.length}</span>
        )}
        {open ? (
          <ChevronDown size={12} strokeWidth={1.8} aria-hidden />
        ) : (
          <ChevronRight size={12} strokeWidth={1.8} aria-hidden />
        )}
      </button>
      {/* 急停控制：loop 运行中（active）可点；halt 后状态常驻可见 */}
      {(active || halted) && (
        <div className="neo-host-halt">
          {halted ? (
            <span className="neo-host-pill neo-host-pill--err">
              {t('neo.host.halted', { defaultValue: '已急停' })}
            </span>
          ) : confirming ? (
            <>
              <button
                type="button"
                className="neo-host-halt-btn neo-host-halt-btn--danger"
                disabled={halting}
                onClick={handleHaltConfirm}
              >
                {halting
                  ? t('neo.host.halting', { defaultValue: '急停中…' })
                  : t('neo.host.haltConfirm', { defaultValue: '确认急停' })}
              </button>
              <button
                type="button"
                className="neo-host-halt-btn"
                disabled={halting}
                onClick={() => setConfirming(false)}
              >
                {t('neo.host.haltCancel', { defaultValue: '取消' })}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="neo-host-halt-btn"
              onClick={() => setConfirming(true)}
            >
              <Ban size={11} strokeWidth={1.9} aria-hidden />
              {t('neo.host.haltLoop', { defaultValue: '急停本循环' })}
            </button>
          )}
          {haltFailed && (
            <span className="neo-host-halt-err" role="alert">
              {t('neo.host.haltFailed', { defaultValue: '急停失败，请重试' })}
            </span>
          )}
        </div>
      )}
      {open && (
        failed ? (
          <div className="neo-host-tree-note neo-host-tree-note--pad">
            {t('neo.host.verdictsError', { defaultValue: '验证意见加载失败' })}
          </div>
        ) : verdicts === null ? (
          <div className="neo-host-tree-note neo-host-tree-note--pad">
            {t('neo.host.loading', { defaultValue: '读取中…' })}
          </div>
        ) : verdicts.length === 0 ? (
          <div className="neo-host-tree-note neo-host-tree-note--pad">
            {t('neo.host.verdictsEmpty', { defaultValue: '该循环暂无验证意见' })}
          </div>
        ) : (
          verdicts.map((v) => (
            <div key={`${loopId}-${v.iteration}`} className="neo-host-verdict">
              <div className="neo-host-verdict-head">
                <span className="neo-host-iter-k">
                  {t('neo.host.iterK', { defaultValue: '第 {{k}} 轮', k: v.iteration + 1 })}
                </span>
                <span className="neo-host-iter-score">
                  score {typeof v.score === 'number' ? v.score.toFixed(2) : '—'}
                </span>
              </div>
              {v.rationale && <p className="neo-host-verdict-rationale">{v.rationale}</p>}
              {v.claims.length > 0 && (
                <ul className="neo-host-verdict-claims">
                  {v.claims.map((c, i) => {
                    const status = claimStatus(c);
                    return (
                      <li key={i} className="neo-host-verdict-claim">
                        <span className="neo-host-verdict-claim-text">{claimText(c)}</span>
                        {status && (
                          <span className="neo-host-pill neo-host-pill--muted">{status}</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ))
        )
      )}
    </div>
  );
}

export default LoopVerdicts;
