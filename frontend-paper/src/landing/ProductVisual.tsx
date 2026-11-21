/**
 * ProductVisual — Hero 右侧那台「产品窗口」样机。
 *
 * 版式与交互对齐 shadow-merge 的 product-visual：整机可点击进入工作台
 * （cursor / title / hover / 键盘回车），补进度条、侧栏 logo、悬浮卡图标与
 * 状态徽标的闪电气图标。内容全部来自 `content/landing.ts` 的 PREVIEW，
 * 颜色走 CSS 变量 / data-tone，组件里没有色值、没有写死的中文。
 */
import { PREVIEW } from '../content/landing';
import { IconBrainCircuit, IconCheck, IconFileCheck, IconZap } from '../shell/icons';

export function ProductVisual({ onEnter }: { onEnter: () => void }) {
  return (
    <div
      className="lp-visual"
      role="button"
      tabIndex={0}
      aria-label="进入工作台"
      title="点击进入工作台"
      onClick={onEnter}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onEnter();
        }
      }}
    >
      <div className="lp-visual-window">
        <div className="lp-visual-bar">
          <span className="lp-dots">
            <i />
            <i />
            <i />
          </span>
          <span className="lp-visual-title">{PREVIEW.title}</span>
          <span className="lp-visual-url">{PREVIEW.url}</span>
        </div>

        <div className="lp-visual-body">
          <aside className="lp-visual-rail">
            <span className="lp-vr-logo" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span className="lp-vr-dot is-on" />
            <span className="lp-vr-dot" />
            <span className="lp-vr-dot" />
            <span className="lp-vr-dot" />
          </aside>

          <div className="lp-visual-main">
            <div className="lp-visual-kicker">{PREVIEW.kicker}</div>
            <div className="lp-visual-h">{PREVIEW.project}</div>
            <div className="lp-visual-sub">
              <span className="lp-live" />
              {PREVIEW.state}
            </div>

            <div
              className="lp-progress"
              role="progressbar"
              aria-valuenow={PREVIEW.progress}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <i style={{ width: `${PREVIEW.progress}%` }} />
            </div>

            <div className="lp-stats">
              {PREVIEW.stats.map((s) => (
                <div key={s.v} className="lp-stat">
                  <b>{s.k}</b>
                  <span>{s.v}</span>
                </div>
              ))}
            </div>

            <div className="lp-flow">
              <div className="lp-flow-head">
                <span>{PREVIEW.flowTitle}</span>
                <span className="lp-flow-live">{PREVIEW.flowLive}</span>
              </div>
              <ul>
                {PREVIEW.flow.map((r) => (
                  <li key={r.t}>
                    <i data-tone={r.tone}>{r.n}</i>
                    <span>{r.t}</span>
                    <em>{r.s}</em>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div className="lp-float lp-float--a">
        <span className="lp-float-ico">
          <IconFileCheck size={17} />
        </span>
        <div>
          <b>{PREVIEW.floatDoc.title}</b>
          <span>{PREVIEW.floatDoc.note}</span>
        </div>
        <IconCheck size={13} className="lp-float-check" />
      </div>
      <div className="lp-float lp-float--b">
        <span className="lp-float-ico lp-float-ico--brain">
          <IconBrainCircuit size={18} />
        </span>
        <div>
          <b>{PREVIEW.floatAgent.title}</b>
          <span>{PREVIEW.floatAgent.note}</span>
        </div>
        <IconCheck size={13} className="lp-float-check" />
      </div>
      <div className="lp-visual-badge">
        <IconZap size={13} />
        {PREVIEW.floatBadge}
      </div>
    </div>
  );
}

export default ProductVisual;
